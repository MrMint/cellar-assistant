/**
 * `ItemSearchActor(hash)` — C1 (migration plan §2.3).
 *
 * > | `ItemSearchActor(hash)` | `text_search` / `image_search` native queries,
 * > `searchByText`, `searchByImage` | no | projection (id, type, name, distance) |
 *
 * ## What it replaces, exactly
 *
 * Two Hasura *native queries* with identical bodies, differing only in the name
 * of their one argument (`82450ad1:nhost/metadata/databases/databases.yaml`):
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
  ConflictError,
  ITEM_SEARCH_MAX_DISTANCE,
  ITEM_SEARCH_RESULT_CAP,
  ITEM_TYPES,
  ItemSearchActorDescriptor,
  isActorError,
  isItemType,
  itemSearchActorId,
  ValidationError,
} from "@cellar-assistant/contracts";
import { itemImage, itemImageVectors, itemVectors } from "@cellar-assistant/db";
import { sql } from "@cellar-assistant/db/orm";
import { bypassesPolicy } from "@cellar-assistant/policy";
import type { ActorId, DaprClient } from "@dapr/dapr";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import type { EmbedImage, EmbedQuery } from "../lib/embedding-client.ts";
import {
  daprEmbedQuery,
  daprEmbedQueryImage,
} from "../lib/embedding-client.ts";
import { requireSignedIn } from "../lib/guards.ts";
import { withHnswScan } from "../lib/hnsw.ts";
import { reciprocalRankFusion, tiedRanks } from "../lib/hybrid-rank.ts";
import { ARCS } from "../lib/item-arcs.ts";
import { ITEM_TABLES } from "../lib/item-bindings.ts";
import { SearchActorBase } from "../lib/search-actor-base.ts";
import {
  type DiscardSearchPhoto,
  daprDiscardSearchPhoto,
} from "../lib/search-photos.ts";
import { requireUuid } from "../lib/uuid.ts";
import { toVectorLiteral } from "../lib/vectors.ts";

/** `item_vectors`' item arc (`../lib/item-arcs.ts`). */
const VECTORS = ARCS.itemVectors;
/** `item_image`'s item arc — the same six column names, so the union lines up. */
const IMAGES = ARCS.itemImage;

type Row = {
  readonly item_type: string;
  readonly item_id: string;
  readonly name: string;
  /** `null` only from the lexical arm, for an item with no vector. */
  readonly distance: string | number | null;
  /**
   * N08, a text search only: `strict_word_similarity` of phrase to name —
   * on both arms' rows, so a vector hit carries it too. `null` for a vector
   * or photo search, which have no phrase.
   */
  readonly lexical?: string | number | null;
};

/** A lexical-arm row: its rank score is the mean of word and whole similarity. */
type LexicalRow = Row & { readonly score: string | number };

export class ItemSearchActor
  extends SearchActorBase<ItemSearchInput, ItemSearchHit>
  implements ItemSearchActorInterface
{
  static readonly category: ActorCategory = ItemSearchActorDescriptor.category;

  readonly #embed: EmbedQuery;
  readonly #embedImage: EmbedImage;
  readonly #discardPhoto: DiscardSearchPhoto;

  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    embed: EmbedQuery = daprEmbedQuery,
    embedImage: EmbedImage = daprEmbedQueryImage,
    discardPhoto: DiscardSearchPhoto = daprDiscardSearchPhoto,
  ) {
    super(daprClient, id, db);
    this.#embed = embed;
    this.#embedImage = embedImage;
    this.#discardPhoto = discardPhoto;
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
    const imageFileId = input.imageFileId?.trim().toLowerCase() ?? "";
    if (imageFileId === "") return this.#search(ctx, input);
    let hits: readonly ItemSearchHit[];
    try {
      hits = await this.#search(ctx, input);
    } catch (error) {
      // A deployment that cannot embed a photo will refuse this one on every
      // retry (the capability check runs before the file is read), so the
      // photo has no use left either.
      if (
        error instanceof ConflictError &&
        error.reason === "IMAGE_SEARCH_UNAVAILABLE"
      ) {
        await this.#discard(ctx, imageFileId);
      }
      throw error;
    }
    await this.#discard(ctx, imageFileId);
    return hits;
  }

  /**
   * G32: the search photo has done its one job — its vector made this
   * result set, which this activation now caches for every page. So it is
   * discarded (`../lib/search-photos.ts`): row and object, if it is the
   * viewer's own `image-search` file; anything else is left alone by
   * `FileActor.discardSearchPhoto`.
   *
   * Best-effort and after the result, never instead of it: a failure is
   * logged and `MaintenanceActor` reaps the file at `SEARCH_PHOTO_TTL_MS`.
   * A reload of `/search?image=<id>` after this is answered from this
   * activation's cached result while it lives, and after its eviction (and
   * `EmbeddingActor`'s) with `NotFoundError` from `FileActor` — which the
   * page shows as an expired image-search link.
   */
  async #discard(ctx: Ctx, fileId: string): Promise<void> {
    try {
      await this.#discardPhoto(ctx, fileId);
    } catch (error) {
      console.warn(
        `[ItemSearchActor] discarding search photo ${fileId} failed; ` +
          `MaintenanceActor reaps it later: ${String(error)}`,
      );
    }
  }

  async #search(
    ctx: Ctx,
    input: ItemSearchInput,
  ): Promise<readonly ItemSearchHit[]> {
    const query = await this.#queryFor(ctx, input);
    const types = normaliseTypes(input.itemTypes);
    if (query.kind === "name") {
      // D25 parity: no embedding, so the name is all there is to rank by.
      // Not cached (`doNotCache`): the embedding may be back on the next
      // turn, and a name-only query over the trigram indexes is cheap.
      this.doNotCache();
      const rows = await this.db.transaction((tx) =>
        this.#lexicalRows(tx, {
          text: query.text,
          literal: null,
          types,
          limit: requireLimit(input.limit ?? ITEM_SEARCH_RESULT_CAP),
        }),
      );
      return toHits(rows);
    }
    const literal = toVectorLiteral(query.vector);
    const maxDistance = requireDistance(
      input.maxDistance ?? ITEM_SEARCH_MAX_DISTANCE,
    );
    const limit = requireLimit(input.limit ?? ITEM_SEARCH_RESULT_CAP);
    if (query.kind === "image") {
      return toHits(
        await this.#imageRows(ctx, {
          literal,
          model: query.model,
          types,
          maxDistance,
          limit,
        }),
      );
    }

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
    const { vectorRows, lexicalRows } = await withHnswScan(
      this.db,
      async (tx) => {
        const { rows: vectorRows } = await tx.execute<Row>(sql`
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
          m.distance as distance,
          ${
            // A text search scores every vector hit's name as well, so a hit
            // the lexical arm did not list (under its threshold, or crowded
            // out of its `limit`) still says how well its name matched: the
            // name margin `planCandidates` applies must not read "not listed"
            // as "no match at all".
            query.kind === "text"
              ? sql`strict_word_similarity(${query.text}, coalesce(${nameCoalesce}))::float8`
              : sql`null::float8`
          } as lexical
        from nearest m
        ${joins}
        where (${typeFilter})
          and m.distance <= ${maxDistance}
          and coalesce(${nameCoalesce}) is not null
        order by m.distance asc, name asc, item_id asc
        limit ${limit}
      `);
        const lexicalRows: readonly LexicalRow[] =
          query.kind === "text"
            ? await this.#lexicalRows(tx, {
                text: query.text,
                literal,
                types,
                limit,
              })
            : [];
        return { vectorRows, lexicalRows };
      },
    );

    if (query.kind !== "text") return toHits(vectorRows);
    return fuseHybrid(
      toHits(vectorRows),
      toHits(lexicalRows),
      tiedRanks(
        lexicalRows.map((row) => Number(row.score)),
        LEXICAL_TIE,
      ),
      limit,
    );
  }

  /**
   * N08 — the lexical arm: the items whose **name** best matches the phrase
   * by pg_trgm, each with its own vector distance so the fused hit reports a
   * real one.
   *
   * `strict_word_similarity(phrase, name)` — the similarity of the phrase to
   * the best run of whole words in the name — rather than plain `similarity`,
   * so "lagavulin 16" scores 1.0 against "Lagavulin 16 Year Old" instead of
   * being diluted by the words the phrase left out. `<<%` is that comparison
   * against `pg_trgm.strict_word_similarity_threshold`, which is what the
   * `idx_<table>_name_trgm` GIN indexes serve
   * (`20261008030851_item_names_trigram`); the threshold is set for this
   * transaction only.
   *
   * The arm is ordered by the mean of that and whole-string `similarity`, so
   * of two names that both contain the phrase as words — "Duvel" and "Duvel
   * Tripel Hop Citra" — the one that *is* the phrase leads. Scores within
   * {@link LEXICAL_TIE} of each other share a rank when fused (`tiedRanks`):
   * "Jameson Irish Whiskey" and "Jameson Black Barrel" are equally good
   * answers to "jameson" by name, and the vector should decide.
   *
   * An item with **no vector** is returned too, with `distance: null` — the
   * one way a text search can find it at all. That is not only the window
   * before `create`'s outbox delivery embeds it: measured 2026-10-07 on the
   * shared development database, 70 of 77 teas, 36 of 138 wines and 2 of 6
   * sakes had no vector (`item_vectors` coverage, the roadmap's "check it
   * first"). The re-embed job does not create a missing vector; whatever
   * left them unembedded, the name still finds them.
   */
  async #lexicalRows(
    tx: DbOrTx,
    q: {
      readonly text: string;
      /** The phrase's vector; `null` when it could not be embedded. */
      readonly literal: string | null;
      readonly types: readonly ItemType[];
      readonly limit: number;
    },
  ): Promise<readonly LexicalRow[]> {
    const literal = q.literal;
    await tx.execute(sql`
      select set_config('pg_trgm.strict_word_similarity_threshold',
                        ${String(LEXICAL_THRESHOLD)}, true)
    `);
    const arms = sql.join(
      q.types.map((type) => {
        const t = sql.identifier(aliasOf(type));
        return sql`
          select ${type}::text as item_type, ${t}.id::text as item_id,
                 ${t}.name as name,
                 strict_word_similarity(${q.text}, ${t}.name)::float8 as lexical,
                 similarity(${q.text}, ${t}.name)::float8 as whole,
                 ${
                   literal === null
                     ? sql`null::float8`
                     : sql`(v.vector <=> ${literal}::halfvec(768))::float8`
                 } as distance
          from ${ITEM_TABLES[type]} ${t}
          ${
            literal === null
              ? sql``
              : sql`left join ${itemVectors} v
                      on ${VECTORS.column(type, "v")} = ${t}.id`
          }
          where ${q.text} <<% ${t}.name`;
      }),
      sql` union all `,
    );
    const { rows } = await tx.execute<LexicalRow>(sql`
      select item_type, item_id, name, distance, lexical,
             ((lexical + whole) / 2)::float8 as score
      from (${arms}) lexical_arm
      order by score desc, name asc, item_id asc
      limit ${q.limit}
    `);
    return rows;
  }

  /**
   * G32 — a search photo against **both** vector sets, each item ranked by the
   * nearer of the two:
   *
   *  - `item_vectors`, exactly as legacy's `image_search` did: one vector per
   *    item, its text fused with its label and display photos;
   *  - `item_image_vectors`, one per stored photograph, embedded alone — new
   *    here. A photo of a bottle lands far closer to a photo of the same
   *    bottle (0.02–0.04 for the same image, measured) than to any fused
   *    vector, whose text pulls it toward the words.
   *
   * **Visibility is applied to the image arm, inside the SQL**, mirroring
   * `canSeeItemImage` (`@cellar-assistant/policy`): a public image, or the
   * viewer's own; everything for system/admin. Items are catalog data that
   * every signed-in viewer may see, so the item arm needs no filter — but a
   * private photo must not be what *surfaces* an item, or which items
   * somebody privately photographed would leak through the ranking. That is
   * why the viewer is in this search's key (`itemSearchActorId`).
   *
   * Only image vectors made by the configured image embedding take part: a
   * row from another model is in another space, and its distance means
   * nothing. (The item arm has no such filter, as before; the re-embed job is
   * what converges it.)
   *
   * Each arm takes its own nearest-k over its own HNSW index, then the union
   * is collapsed to one row per item with `min(distance)`. The image arm takes
   * a wider k ({@link IMAGE_ARM_CANDIDATES}) because several photos of one
   * item, and invisible ones, can occupy its top rows.
   */
  async #imageRows(
    ctx: Ctx,
    q: {
      readonly literal: string;
      readonly model: string;
      readonly types: readonly ItemType[];
      readonly maxDistance: number;
      readonly limit: number;
    },
  ): Promise<readonly Row[]> {
    const { literal, model, types, maxDistance, limit } = q;
    const m = "m";
    const typeFilterOn = (alias: string) =>
      sql.join(
        types.map((type) => VECTORS.isSet(type, alias)),
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
    const viewer = ctx.viewerId;
    const visible = bypassesPolicy(ctx)
      ? sql`true`
      : viewer === null
        ? sql`ii.is_public`
        : sql`(ii.is_public or ii.user_id = ${viewer})`;

    const { rows } = await withHnswScan(this.db, (tx) =>
      tx.execute<Row>(sql`
        with item_arm as materialized (
          select ${VECTORS.columnList("v")},
                 (v.vector <=> ${literal}::halfvec(768))::float8 as distance
          from ${itemVectors} v
          where v.vector is not null and (${typeFilterOn("v")})
          order by v.vector <=> ${literal}::halfvec(768)
          limit ${limit}
        ),
        image_arm as materialized (
          select iv.item_image_id,
                 (iv.vector <=> ${literal}::halfvec(768))::float8 as distance
          from ${itemImageVectors} iv
          where iv.embedding_model = ${model}
          order by iv.vector <=> ${literal}::halfvec(768)
          limit ${IMAGE_ARM_CANDIDATES}
        ),
        candidates as (
          select ${VECTORS.columnList("a")}, a.distance from item_arm a
          union all
          select ${IMAGES.columnList("ii")}, i.distance
          from image_arm i
          join ${itemImage} ii on ii.id = i.item_image_id
          where ${visible} and (${typeFilterOn("ii")})
        ),
        best as (
          select ${VECTORS.columnList("c")}, min(c.distance) as distance
          from candidates c
          group by ${VECTORS.columnList("c")}
        )
        select
          ${VECTORS.typeExpr(m, types)} as item_type,
          ${VECTORS.idExpr(m, types)} as item_id,
          coalesce(${nameCoalesce}) as name,
          m.distance as distance
        from best m
        ${joins}
        where (${typeFilterOn(m)})
          and m.distance <= ${maxDistance}
          and coalesce(${nameCoalesce}) is not null
        order by m.distance asc, name asc, item_id asc
        limit ${limit}
      `),
    );
    return rows;
  }

  /**
   * A phrase is embedded through `EmbeddingActor`; a vector is taken as
   * given; a photo (G32) is embedded as an image through `EmbeddingActor`,
   * as this viewer. Exactly one of the three is required — accepting more
   * would make the key ambiguous about which one produced the answer.
   */
  async #queryFor(
    ctx: Ctx,
    input: ItemSearchInput,
  ): Promise<
    | { readonly kind: "vector"; readonly vector: readonly number[] }
    | {
        readonly kind: "text";
        readonly vector: readonly number[];
        readonly text: string;
      }
    | { readonly kind: "name"; readonly text: string }
    | {
        readonly kind: "image";
        readonly vector: readonly number[];
        readonly model: string;
      }
  > {
    const text = input.text?.trim();
    const hasText = text !== undefined && text !== "";
    const hasVector = (input.vector?.length ?? 0) > 0;
    const imageFileId = input.imageFileId?.trim() ?? "";
    const hasImage = imageFileId !== "";
    if (Number(hasText) + Number(hasVector) + Number(hasImage) !== 1) {
      throw new ValidationError(
        "an item search takes exactly one of `text`, `vector` or " +
          "`imageFileId`: a phrase is embedded through EmbeddingActor, a " +
          "vector is used as given, a photo is embedded as an image, and " +
          "supplying more than one leaves the actor's key ambiguous",
      );
    }
    if (hasImage) {
      const embedded = await this.#embedImage(ctx, {
        fileId: requireUuid(imageFileId, "imageFileId"),
        purpose: "query",
      });
      if (embedded.model === null) {
        throw new ConflictError(
          "EmbeddingActor did not say which embedding made the photo's " +
            "vector, so it cannot be compared with stored image vectors",
          "IMAGE_SEARCH_UNAVAILABLE",
        );
      }
      return { kind: "image", vector: embedded.vector, model: embedded.model };
    }
    if (hasVector) {
      return { kind: "vector", vector: input.vector as readonly number[] };
    }
    const phrase = text as string;
    let vector: readonly number[];
    try {
      vector = await this.#embed(ctx, phrase);
    } catch (error) {
      if (!embeddingUnavailable(error)) throw error;
      console.warn(
        "[ItemSearchActor] the phrase could not be embedded; ranking by " +
          `name alone: ${String(error)}`,
      );
      return { kind: "name", text: phrase };
    }
    return { kind: "text", vector, text: phrase };
  }
}

/**
 * D25 — whether a failed phrase embedding means "no embedding here right
 * now" rather than "this request is wrong".
 *
 * A text search has two arms, and only one of them needs a model: with no
 * provider (`AI_UNCONFIGURED`), a spent embedding budget, a provider that
 * failed or a sidecar hop that timed out, the name arm still answers, so the
 * search returns name matches instead of failing whole — the same search on
 * every deployment, with the ranking it can afford. A refusal that is about
 * the request (`VALIDATION`, `FORBIDDEN`, `NOT_FOUND`) is still thrown: the
 * name arm would not make that request right.
 */
export const embeddingUnavailable = (error: unknown): boolean =>
  !isActorError(error) ||
  error.code === "CONFLICT" ||
  error.code === "BUDGET_EXCEEDED";

/**
 * How many image vectors the image arm reads before visibility and the
 * per-item collapse. Five per result at the result cap: several photos of one
 * item, and other people's private photos, can fill the nearest rows.
 */
const IMAGE_ARM_CANDIDATES = 5 * ITEM_SEARCH_RESULT_CAP;

const toHits = (rows: readonly Row[]): ItemSearchHit[] =>
  rows.map((row) => {
    if (!isItemType(row.item_type)) {
      throw new ValidationError(
        `item_vectors produced an unknown item type ${row.item_type}`,
      );
    }
    return {
      type: row.item_type,
      id: row.item_id,
      name: row.name,
      distance: row.distance === null ? null : Number(row.distance),
      ...(row.lexical === undefined || row.lexical === null
        ? {}
        : { lexicalSimilarity: Number(row.lexical) }),
    };
  });

/**
 * `pg_trgm.strict_word_similarity_threshold` for the lexical arm. pg_trgm's
 * own default (0.5): high enough that "smoky islay scotch" matches no name
 * and the arm stays out of a descriptive search, low enough that a typo of a
 * one-word name ("laphroig", 0.58) still matches.
 */
export const LEXICAL_THRESHOLD = 0.5;

/**
 * Lexical scores closer than this share a rank in the fusion (`tiedRanks`):
 * smaller differences are the length of the rest of the name, not evidence.
 */
export const LEXICAL_TIE = 0.05;

/**
 * N08 — the two arms of a text search as one ranking: reciprocal rank fusion
 * (`../lib/hybrid-rank.ts`), then the actor's total order — score, lexical
 * rank, distance, name, id — so an offset page means the same thing on every
 * turn.
 *
 * The lexical rank breaks a tie in score because a tie is what a *symmetric*
 * disagreement produces: "duvel" ranks Duvel first by name and Duvel Tripel
 * Hop first by vector, each second in the other list. The name is the more
 * specific evidence of what was typed.
 *
 * A hit carries its vector distance either way, and the strict word
 * similarity of the phrase to its name whichever arm found it (the vector
 * arm scores names too, it just does not rank by them). With no lexical
 * match at all the order is exactly the vector order: RRF over one list is
 * that list.
 */
export const fuseHybrid = (
  vector: readonly ItemSearchHit[],
  lexical: readonly ItemSearchHit[],
  lexicalRanks: readonly number[],
  limit: number,
): ItemSearchHit[] =>
  reciprocalRankFusion<ItemSearchHit>(
    [{ items: vector }, { items: lexical, ranks: lexicalRanks }],
    (hit) => `${hit.type}:${hit.id}`,
  )
    .map((fused) => {
      const [fromVector, fromLexical] = fused.entries;
      const hit = (fromVector ?? fromLexical) as ItemSearchHit;
      return {
        score: fused.score,
        lexicalRank: fused.ranks[1] ?? Number.POSITIVE_INFINITY,
        hit: {
          type: hit.type,
          id: hit.id,
          name: hit.name,
          distance: hit.distance,
          lexicalSimilarity:
            fromLexical?.lexicalSimilarity ??
            fromVector?.lexicalSimilarity ??
            null,
        },
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.lexicalRank - b.lexicalRank ||
        orderedDistance(a.hit) - orderedDistance(b.hit) ||
        compareText(a.hit.name, b.hit.name) ||
        compareText(a.hit.id, b.hit.id),
    )
    .slice(0, limit)
    .map(({ hit }) => hit);

/** A hit with no vector sorts after every hit that has one. */
const orderedDistance = (hit: ItemSearchHit): number =>
  hit.distance ?? Number.POSITIVE_INFINITY;

/** Code-unit order, like the SQL's `name asc` under the C collation tests use. */
const compareText = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

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
