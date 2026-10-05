/**
 * `ItemSearchActor(hash)` — C1 (migration plan §2.3).
 *
 * > | `ItemSearchActor(hash)` | `text_search` / `image_search` native queries,
 * > `searchByText`, `searchByImage` | no | projection (id, type, name, distance) |
 *
 * ## What it replaces, exactly
 *
 * Two Hasura *native queries* with identical bodies, differing only in the name
 * of their one argument (`nhost/metadata/databases/databases.yaml`):
 *
 * ```sql
 * SELECT DISTINCT ON (beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id) *,
 *        vector <=> {{text}}::halfvec(768) AS distance
 * FROM public.item_vectors
 * ORDER BY beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id, distance
 * ```
 *
 * …wrapped by the client in `where: {distance: {_lte: 1}}, order_by: {distance:
 * asc}, limit: 10`. `text_search` took a vector the client had already obtained
 * from `create_search_vector`; `image_search` took one from the image pipeline.
 * That difference is the whole difference, so this actor takes **either** a
 * phrase (embedded here, through `EmbeddingActor`) or a caller-supplied vector
 * (the image case — the model call that produces it belongs to
 * `ItemOnboardingActor`, never to a search turn).
 *
 * The `DISTINCT ON` is **not** ported any more. It collapsed duplicate vectors
 * for one item, and since `item_vectors_one_per_item` (a unique index per item
 * column) there are none to collapse — while its `ORDER BY <six columns>,
 * distance` forced a sequential scan and a sort of every vector on every
 * search. The query is now `ORDER BY vector <=> q LIMIT k` over the HNSW index,
 * with the type filter inside the scan and the distance cutoff applied to the
 * k rows it returns (`../lib/hnsw.ts` has the settings that make that exact
 * enough). HNSW is approximate: at scale the k rows are the likely nearest,
 * which is the trade every vector search makes and the old query did not.
 *
 * ## Names come from one query, not six
 *
 * The old client asked for `wine { … } beer { … } spirit { … } coffee { … }` as
 * four object relationships and threw away the five nulls per row. Here the six
 * item tables are `LEFT JOIN`ed once and collapsed with `COALESCE`, so a search
 * is a single round trip regardless of how many types matched. §2.3 asks for a
 * *projection* (id, type, name, distance) rather than ids, which is §1.5's
 * "projections for high-cardinality catalog lists (map, item search, brand
 * index)" — the DataLoader would otherwise fan out 50 `ItemActor.get` calls to
 * render a result list that only needs a name.
 *
 * ## Ordering is total, deliberately
 *
 * `ORDER BY distance ASC, name ASC, id ASC`. Distance alone is not a total
 * order — two items embedded from near-identical text tie — and a search actor
 * pages its result set by *offset* (§1.5), so a tie broken differently between
 * two turns would drop or repeat a row across a page boundary. The old query
 * had the same latent problem and never noticed because Hasura re-ran it.
 *
 * ## Viewer: not in the key
 *
 * §2.3 marks this actor "viewer in hash: no", and that is right — items are
 * catalog data with no privacy column (B2's rule, following B3's). The three
 * viewer tests still exist (§1.6: "for catalog data the stranger case is 'any
 * signed-in user'; the test still exists"), and what they assert is that owner,
 * friend and stranger all see the same rows while an anonymous caller is
 * refused.
 */
import type {
  ActorCategory,
  Ctx,
  ItemSearchActorInterface,
  ItemSearchHit,
  ItemSearchInput,
  ItemType,
  Page,
  PageArgs,
} from "@cellar-assistant/contracts";
import {
  ITEM_SEARCH_MAX_DISTANCE,
  ITEM_SEARCH_RESULT_CAP,
  ITEM_TYPES,
  ItemSearchActorDescriptor,
  isItemType,
  itemSearchActorId,
  ValidationError,
} from "@cellar-assistant/contracts";
import { itemVectors } from "@cellar-assistant/db";
import { sql } from "@cellar-assistant/db/orm";
import type { ActorId, DaprClient } from "@dapr/dapr";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import type { EmbedQuery } from "../lib/embedding-client.ts";
import { daprEmbedQuery } from "../lib/embedding-client.ts";
import { requireSignedIn } from "../lib/guards.ts";
import { withHnswScan } from "../lib/hnsw.ts";
import { ARCS } from "../lib/item-arcs.ts";
import { ITEM_TABLES } from "../lib/item-bindings.ts";
import { SearchActorBase } from "../lib/search-actor-base.ts";
import { toVectorLiteral } from "../lib/vectors.ts";

/** `item_vectors`' item arc (`../lib/item-arcs.ts`). */
const VECTORS = ARCS.itemVectors;

type Row = {
  readonly item_type: string;
  readonly item_id: string;
  readonly name: string;
  readonly distance: string | number;
};

export class ItemSearchActor
  extends SearchActorBase<ItemSearchInput, ItemSearchHit>
  implements ItemSearchActorInterface
{
  static readonly category: ActorCategory = ItemSearchActorDescriptor.category;

  readonly #embed: EmbedQuery;

  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    embed: EmbedQuery = daprEmbedQuery,
  ) {
    super(daprClient, id, db);
    this.#embed = embed;
  }

  protected keyFor(input: ItemSearchInput, viewerId: string | null): string {
    return itemSearchActorId(input, viewerId);
  }

  /** Catalog data: any signed-in viewer, anonymous refused (§1.6). */
  protected override async authorize(ctx: Ctx): Promise<"allow"> {
    requireSignedIn(ctx, "search items");
    return "allow";
  }

  async results(
    ctx: Ctx,
    input: ItemSearchInput,
    page: PageArgs,
  ): Promise<Page<ItemSearchHit>> {
    return this.pageOf(ctx, input, page);
  }

  async all(
    ctx: Ctx,
    input: ItemSearchInput,
  ): Promise<readonly ItemSearchHit[]> {
    return this.resultSet(ctx, input);
  }

  protected async runSearch(
    ctx: Ctx,
    input: ItemSearchInput,
  ): Promise<readonly ItemSearchHit[]> {
    const vector = await this.#vectorFor(ctx, input);
    const literal = toVectorLiteral(vector);
    const types = normaliseTypes(input.itemTypes);
    const maxDistance = requireDistance(
      input.maxDistance ?? ITEM_SEARCH_MAX_DISTANCE,
    );
    const limit = requireLimit(input.limit ?? ITEM_SEARCH_RESULT_CAP);

    // Only the requested types' columns take part, so a wine-only search never
    // pays for the five other LEFT JOINs' rows. Every column is the arc's own,
    // rendered through `sql.identifier` — no column name is spliced as text.
    const m = "m";
    const typeFilter = sql.join(
      types.map((type) => VECTORS.isSet(type, m)),
      sql` or `,
    );
    const nameCoalesce = sql.join(
      types.map((type) => sql`${sql.identifier(aliasOf(type))}.name`),
      sql`, `,
    );
    const joins = sql.join(
      types.map((type) => {
        const alias = sql.identifier(aliasOf(type));
        return sql`left join ${ITEM_TABLES[type]} ${alias}
          on ${alias}.id = ${VECTORS.column(type, m)}`;
      }),
      sql` `,
    );
    const vectorColumns = VECTORS.columnList("v");
    // The type filter is written against `v` here, because it has to sit
    // inside the nearest-neighbour scan: filtering after the LIMIT would let a
    // wine-only search come back short whenever beers were nearer.
    const scanFilter = sql.join(
      types.map((type) => VECTORS.isSet(type, "v")),
      sql` or `,
    );

    // `ORDER BY v.vector <=> q LIMIT k` is the only shape that uses
    // `item_vectors_vector_hnsw_idx` (`../lib/hnsw.ts`). The distance cutoff,
    // the name join and the total order are applied to those k rows after.
    // `materialized` keeps the planner from pushing the cutoff into the scan,
    // which would turn the ordered index scan back into a filtered seq scan.
    const { rows } = await withHnswScan(this.db, (tx) =>
      tx.execute<Row>(sql`
        with nearest as materialized (
          select ${vectorColumns},
                 (v.vector <=> ${literal}::halfvec(768))::float8 as distance
          from ${itemVectors} v
          where v.vector is not null and (${scanFilter})
          order by v.vector <=> ${literal}::halfvec(768)
          limit ${limit}
        )
        select
          ${VECTORS.typeExpr(m, types)} as item_type,
          ${VECTORS.idExpr(m, types)} as item_id,
          coalesce(${nameCoalesce}) as name,
          m.distance as distance
        from nearest m
        ${joins}
        where (${typeFilter})
          and m.distance <= ${maxDistance}
          and coalesce(${nameCoalesce}) is not null
        order by m.distance asc, name asc, item_id asc
        limit ${limit}
      `),
    );

    return rows.map((row) => {
      if (!isItemType(row.item_type)) {
        throw new ValidationError(
          `item_vectors produced an unknown item type ${row.item_type}`,
        );
      }
      return {
        type: row.item_type,
        id: row.item_id,
        name: row.name,
        distance: Number(row.distance),
      };
    });
  }

  /**
   * A phrase is embedded through `EmbeddingActor`; a vector is taken as given.
   * Exactly one of the two is required — accepting both would make the key
   * ambiguous about which one produced the answer.
   */
  async #vectorFor(
    ctx: Ctx,
    input: ItemSearchInput,
  ): Promise<readonly number[]> {
    const text = input.text?.trim();
    const hasText = text !== undefined && text !== "";
    const hasVector = (input.vector?.length ?? 0) > 0;
    if (hasText === hasVector) {
      throw new ValidationError(
        "an item search takes exactly one of `text` or `vector`: a phrase is " +
          "embedded through EmbeddingActor, a vector comes from the image " +
          "pipeline, and supplying both leaves the actor's key ambiguous",
      );
    }
    if (hasVector) return input.vector as readonly number[];
    return this.#embed(ctx, text as string);
  }
}

/** `it_wine`, `it_beer`, … — one alias per item table, stable and collision-free. */
const aliasOf = (type: ItemType): string => `it_${type.toLowerCase()}`;

const normaliseTypes = (
  types: readonly ItemType[] | null | undefined,
): readonly ItemType[] => {
  if (types == null || types.length === 0) return ITEM_TYPES;
  const unknown = types.filter((type) => !isItemType(type));
  if (unknown.length > 0) {
    throw new ValidationError(`unknown item type(s): ${unknown.join(", ")}`);
  }
  // De-duplicated and in `ITEM_TYPES` order, so the SQL is the same shape for
  // any permutation the caller happens to send.
  return ITEM_TYPES.filter((type) => types.includes(type));
};

const requireDistance = (value: number): number => {
  if (!Number.isFinite(value) || value < 0 || value > 2) {
    throw new ValidationError(
      `maxDistance must be a cosine distance in [0, 2], got ${value}`,
    );
  }
  return value;
};

const requireLimit = (value: number): number => {
  if (!Number.isInteger(value) || value < 1 || value > ITEM_SEARCH_RESULT_CAP) {
    throw new ValidationError(
      `limit must be an integer in [1, ${ITEM_SEARCH_RESULT_CAP}], got ${value}`,
    );
  }
  return value;
};
