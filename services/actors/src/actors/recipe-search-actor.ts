/**
 * `RecipeSearchActor(hash)` — C1 (migration plan §2.3).
 *
 * > | `RecipeSearchActor(hash)` | recipe group `_ilike` search, `recipe_vectors`
 * > match | no | projection |
 *
 * Replaces the two halves of `src/lib/recipe-search.ts`: `SearchRecipesQuery`
 * (`_ilike` over `name`, `description` and `type`, newest first) and
 * `SemanticRecipeSearchQuery` (`recipe_vectors.distance` with a `_lte`
 * threshold, closest first). One actor, because they are one feature: the page
 * runs the lexical query when the box has a word in it and the semantic one
 * when it has a phrase, and a caller should not have to know which.
 *
 * **This actor does not touch B6's aggregate.** It reads `recipes` and
 * `recipe_vectors` directly — §1.1 lets a search actor read any table — and
 * writes nothing. `RecipeActor` remains the single writer of both.
 *
 * ## Which query runs
 *
 * - `semanticQuery` set → embed it, rank by cosine distance, cut at
 *   `maxDistance` (0.8, today's threshold).
 * - `term` set, no `semanticQuery` → `_ilike` over the three columns, ordered
 *   by exact-name match, then name length, then name, then id.
 * - Both → the `_ilike` narrows the candidate set and the vector ranks it,
 *   which is the shape `/recipes` actually wants and neither old query offered.
 * - Neither → the newest recipes, capped. Today's `GetAllRecipesQuery`.
 *
 * `type` (`food` | `cocktail`) filters all four.
 *
 * ## Ordering, and why `created_at` is never the last word
 *
 * The lexical order today is `created_at desc` alone. Inside the test harness
 * `now()` is constant for the whole transaction (B1's note), so every fixture
 * row ties and `created_at desc` is not an order at all — and in production two
 * recipes imported in one batch tie just as hard. Every ordering here ends in
 * `id`, so the offset cursor §1.5 gives search actors means the same thing on
 * the next page.
 *
 * ## Viewer: not in the key
 *
 * `recipes` has no privacy column and today's Hasura select permission is
 * `filter: {}` for role `user`. Catalog data, B3's rule: any signed-in viewer,
 * anonymous refused, one activation shared by everyone.
 */
import type {
  ActorCategory,
  Ctx,
  Page,
  PageArgs,
  RecipeSearchActorInterface,
  RecipeSearchHit,
  RecipeSearchInput,
} from "@cellar-assistant/contracts";
import {
  RECIPE_SEARCH_MAX_DISTANCE,
  RECIPE_SEARCH_RESULT_CAP,
  RecipeSearchActorDescriptor,
  recipeSearchActorId,
  ValidationError,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import type { ActorId, DaprClient } from "@dapr/dapr";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import type { EmbedQuery } from "../lib/embedding-client.ts";
import { daprEmbedQuery } from "../lib/embedding-client.ts";
import { requireSignedIn } from "../lib/guards.ts";
import { withHnswScan } from "../lib/hnsw.ts";
import { SearchActorBase } from "../lib/search-actor-base.ts";
import { toVectorLiteral } from "../lib/vectors.ts";
import { escapeLike } from "./brand-search-actor.ts";

type Row = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly type: string;
  readonly recipe_group_id: string | null;
  readonly distance: string | number | null;
};

export class RecipeSearchActor
  extends SearchActorBase<RecipeSearchInput, RecipeSearchHit>
  implements RecipeSearchActorInterface
{
  static readonly category: ActorCategory =
    RecipeSearchActorDescriptor.category;

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

  protected keyFor(input: RecipeSearchInput, viewerId: string | null): string {
    return recipeSearchActorId(input, viewerId);
  }

  /** Catalog data: `recipes` has no privacy column (module doc). */
  protected override async authorize(ctx: Ctx): Promise<"allow"> {
    requireSignedIn(ctx, "search recipes");
    return "allow";
  }

  async results(
    ctx: Ctx,
    input: RecipeSearchInput,
    page: PageArgs,
  ): Promise<Page<RecipeSearchHit>> {
    return this.pageOf(ctx, input, page);
  }

  async all(
    ctx: Ctx,
    input: RecipeSearchInput,
  ): Promise<readonly RecipeSearchHit[]> {
    return this.resultSet(ctx, input);
  }

  protected async runSearch(
    ctx: Ctx,
    input: RecipeSearchInput,
  ): Promise<readonly RecipeSearchHit[]> {
    const term = (input.term ?? "").trim();
    const semanticQuery = (input.semanticQuery ?? "").trim();
    const type = (input.type ?? "").trim();
    const limit = requireLimit(input.limit ?? RECIPE_SEARCH_RESULT_CAP);
    const maxDistance = requireDistance(
      input.maxDistance ?? RECIPE_SEARCH_MAX_DISTANCE,
    );

    const pattern = term === "" ? null : `%${escapeLike(term)}%`;
    const lexical =
      pattern === null
        ? sql`true`
        : sql`(r.name ilike ${pattern} escape '\\'
               or coalesce(r.description, '') ilike ${pattern} escape '\\'
               or r.type ilike ${pattern} escape '\\')`;
    const typeFilter = type === "" ? sql`true` : sql`r.type = ${type}`;

    if (semanticQuery === "") {
      const { rows } = await this.db.execute<Row>(sql`
        select r.id, r.name, r.description, r.type, r.recipe_group_id,
               null::float8 as distance
        from public.recipes r
        where ${lexical} and ${typeFilter}
        order by (lower(r.name) = ${term.toLowerCase()}) desc,
                 r.created_at desc nulls last,
                 lower(r.name) asc,
                 r.id asc
        limit ${limit}
      `);
      return rows.map(toHit);
    }

    const literal = toVectorLiteral(await this.#embed(ctx, semanticQuery));
    // `ORDER BY rv.vector <=> q LIMIT k` over `idx_recipe_vectors_hnsw_cosine`
    // (`../lib/hnsw.ts`), with the lexical and type filters inside the scan so
    // the iterative scan keeps going until k recipes pass them. The old
    // `min(distance) … GROUP BY … HAVING` read and sorted every vector; since
    // `recipe_vectors_one_per_recipe` a recipe has at most one, so `min` over
    // one row was the row. The cutoff is applied to the k rows afterwards.
    const { rows } = await withHnswScan(this.db, (tx) =>
      tx.execute<Row>(sql`
        with nearest as materialized (
          select r.id, r.name, r.description, r.type, r.recipe_group_id,
                 (rv.vector <=> ${literal}::halfvec)::float8 as distance
          from public.recipe_vectors rv
          join public.recipes r on r.id = rv.recipe_id
          where rv.vector is not null and ${lexical} and ${typeFilter}
          order by rv.vector <=> ${literal}::halfvec
          limit ${limit}
        )
        select id, name, description, type, recipe_group_id, distance
        from nearest
        where distance <= ${maxDistance}
        order by distance asc, lower(name) asc, id asc
      `),
    );
    return rows.map(toHit);
  }
}

const toHit = (row: Row): RecipeSearchHit => ({
  recipeId: row.id,
  name: row.name,
  description: row.description,
  type: row.type,
  recipeGroupId: row.recipe_group_id,
  distance: row.distance === null ? null : Number(row.distance),
});

const requireLimit = (value: number): number => {
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > RECIPE_SEARCH_RESULT_CAP
  ) {
    throw new ValidationError(
      `limit must be an integer in [1, ${RECIPE_SEARCH_RESULT_CAP}], got ${value}`,
    );
  }
  return value;
};

const requireDistance = (value: number): number => {
  if (!Number.isFinite(value) || value < 0 || value > 2) {
    throw new ValidationError(
      `maxDistance must be a cosine distance in [0, 2], got ${value}`,
    );
  }
  return value;
};
