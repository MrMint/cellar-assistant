/**
 * `PlaceSearchActor(hash)` — C1 (migration plan §2.3).
 *
 * > | `PlaceSearchActor(hash)` | `performSemanticSearch` 4-hop pipeline;
 * > `search_places_hybrid` + `search_category_vectors` | no | projection |
 *
 * The four hops of `src/app/(authenticated)/map/actions.ts`'s
 * `performSemanticSearch`, in one actor turn:
 *
 *  1. embed the query (`EmbeddingActor`, replacing `getCachedSearchVector`'s
 *     `unstable_cache` around an admin-credentialled `create_search_vector`);
 *  2. `search_category_vectors` for the categories the phrase implies;
 *  3. score those categories — label-type weight × quadratic similarity decay,
 *     ported verbatim from `LABEL_TYPE_WEIGHTS` and `rawSimilarity²`;
 *  4. `search_places_hybrid` with the categories, their scores, the viewport,
 *     the rating floor and the **visibility-filtered** tier-list ids.
 *
 * ## The viewer is in the key exactly when the search is viewer-scoped
 *
 * §2.3's table says "viewer in hash: no" for this actor; §1.5 says the viewer
 * *is* in the hash for "map browse with tier-list or visit filters". Those
 * disagree, because `search_places_hybrid` takes `tier_list_ids`. C1 follows
 * §1.5: `placeSearchIsViewerScoped` puts the viewer in the key iff a tier-list
 * or visit filter is present, and the search is shared across every viewer
 * otherwise.
 *
 * That is not a tidiness point. An unconditional "no" means one activation
 * holds the result set for a tier-list-filtered search, and the *next* viewer
 * to ask the same question — with no right to that tier list — reads the cached
 * answer. It would re-open `target-stack.md` §7's hole one layer above the SQL
 * that A3b left it in. The `ValidationError` in `SearchActorBase` closes the
 * other half: an activation cannot be handed an input that hashes elsewhere.
 *
 * ## The tier-list filter, and the visit filter
 *
 * Both go through `lib/tier-list-visibility.ts` and `lib/place-search-sql.ts`;
 * see those modules for the gap and its fix. `search_places_hybrid` has no
 * visit-status parameter at all — today's `performSemanticSearch` takes
 * `_visitStatuses` and silently drops it — so the filter is applied here, over
 * `user_place_interactions` for `ctx.viewerId` and no one else's.
 *
 * ## Weights
 *
 * `PLACE_SEARCH_WEIGHTS` in `@cellar-assistant/contracts` is the declared
 * source of truth §2.3 asks for. A3b's port left the literals in the PL/pgSQL
 * body, so `place-search-actor.test.ts` reads the deployed function back with
 * `pg_get_functiondef` and asserts the two agree — the drift §2.3 is worried
 * about becomes a red test rather than a silent divergence. Actually
 * parameterising the SQL is §9's deferred "rewriting the two big search SQL
 * functions"; see the C1 report.
 *
 * ## Post-filtering, ported as-is
 *
 * The adaptive relative threshold (`max(top × 0.33, 5)`) and the
 * `overallRelevance` normalisation live in the frontend today. The threshold is
 * a *ranking* decision and moves here; the normalisation is a rendering
 * decision (marker size and opacity) and stays in D5.
 */
import type {
  ActorCategory,
  Ctx,
  Page,
  PageArgs,
  PlaceSearchActorInterface,
  PlaceSearchHit,
  PlaceSearchInput,
} from "@cellar-assistant/contracts";
import {
  CATEGORY_VECTOR_LIMIT,
  CATEGORY_VECTOR_MAX_DISTANCE,
  LABEL_TYPE_WEIGHTS,
  PLACE_SEARCH_RESULT_CAP,
  PlaceSearchActorDescriptor,
  placeSearchActorId,
  ValidationError,
} from "@cellar-assistant/contracts";
import { userPlaceInteractions } from "@cellar-assistant/db";
import { and, eq, inArray } from "@cellar-assistant/db/orm";
import type { ActorId, DaprClient } from "@dapr/dapr";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import type { EmbedQuery } from "../lib/embedding-client.ts";
import { daprEmbedQuery } from "../lib/embedding-client.ts";
import { requireSignedIn } from "../lib/guards.ts";
import {
  decodePoint,
  num,
  searchCategoryVectors,
  searchPlacesHybrid,
} from "../lib/place-search-sql.ts";
import { SearchActorBase } from "../lib/search-actor-base.ts";
import { resolveTierListFilter } from "../lib/tier-list-visibility.ts";
import { toVectorLiteral } from "../lib/vectors.ts";

/** `performSemanticSearch`'s adaptive cut, ported. */
const RELATIVE_CUTOFF = 0.33;
/** `combined_score > 0.05`, expressed on the 0–100 confidence scale. */
const ABSOLUTE_MINIMUM_SCORE = 0.05;

export class PlaceSearchActor
  extends SearchActorBase<PlaceSearchInput, PlaceSearchHit>
  implements PlaceSearchActorInterface
{
  static readonly category: ActorCategory = PlaceSearchActorDescriptor.category;

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

  protected keyFor(input: PlaceSearchInput, viewerId: string | null): string {
    return placeSearchActorId(input, viewerId);
  }

  async results(
    ctx: Ctx,
    input: PlaceSearchInput,
    page: PageArgs,
  ): Promise<Page<PlaceSearchHit>> {
    return this.pageOf(ctx, input, page);
  }

  async all(
    ctx: Ctx,
    input: PlaceSearchInput,
  ): Promise<readonly PlaceSearchHit[]> {
    return this.resultSet(ctx, input);
  }

  /**
   * **Every turn**, before the cached result set is consulted.
   *
   * That matters most here. The tier-list filter is re-resolved on each call,
   * so a tier list that went PRIVATE between two pages stops answering at once
   * rather than at the end of the 5-minute idle window — and a denied filter
   * is `"empty"`, not a throw and not a cached result, because
   * `search_places_hybrid` treats a null `tier_list_ids` as *no filter at all*
   * and reducing a denied filter to null would widen the answer instead of
   * narrowing it (see `lib/tier-list-visibility.ts`).
   */
  protected override async authorize(
    ctx: Ctx,
    input: PlaceSearchInput,
  ): Promise<"allow" | "empty"> {
    requireSignedIn(ctx, "search places");
    if (input.query.trim() === "") {
      throw new ValidationError("a place search needs a query");
    }
    requireLimit(input.limit ?? PLACE_SEARCH_RESULT_CAP);
    // A visit filter with nobody to filter by is an empty answer, never an
    // unfiltered one.
    if (input.visitStatus != null && ctx.viewerId === null) return "empty";
    const filter = await resolveTierListFilter(this.db, ctx, input.tierListIds);
    return filter.kind === "empty" ? "empty" : "allow";
  }

  protected async runSearch(
    ctx: Ctx,
    input: PlaceSearchInput,
  ): Promise<readonly PlaceSearchHit[]> {
    const query = input.query.trim();
    const limit = requireLimit(input.limit ?? PLACE_SEARCH_RESULT_CAP);

    // `authorize` has already run this and turned an all-invisible filter into
    // an empty answer; this is the call whose *ids* reach the SQL.
    const tierListFilter = await resolveTierListFilter(
      this.db,
      ctx,
      input.tierListIds,
    );
    if (tierListFilter.kind === "empty") return [];

    const { matchedCategories, categoryScores } = await this.#categories(
      ctx,
      query,
    );

    const rows = await searchPlacesHybrid(this.db, {
      searchQuery: query,
      matchedCategories,
      categoryScores,
      bounds: input.bounds ?? null,
      minRating: input.minRating ?? null,
      resultLimit: limit,
      tierListFilter,
      filterCategories: input.filterCategories ?? [],
    });

    const hits = rows.map(
      (row): PlaceSearchHit => ({
        placeId: row.id,
        name: row.name,
        location: decodePoint(row.location),
        primaryCategory: row.primary_category,
        categories: row.categories ?? [],
        rating: num(row.rating),
        priceLevel: row.price_level,
        streetAddress: row.street_address,
        locality: row.locality,
        region: row.region,
        isVerified: row.is_verified,
        textRank: Number(row.text_rank),
        trigramSimilarity: Number(row.trigram_similarity),
        categoryScore: Number(row.category_score),
        combinedScore: Number(row.combined_score),
      }),
    );

    return this.#applyVisitFilter(ctx, input, cutWeakMatches(hits));
  }

  /**
   * Hops 2 and 3. `search_category_vectors` is a pure vector lookup with no
   * visibility dimension — `category_vectors` is seeded reference data (A9).
   */
  async #categories(
    ctx: Ctx,
    query: string,
  ): Promise<{
    matchedCategories: readonly string[];
    categoryScores: readonly number[];
  }> {
    const literal = toVectorLiteral(await this.#embed(ctx, query));
    const matches = await searchCategoryVectors(this.db, {
      vectorLiteral: literal,
      maxDistance: CATEGORY_VECTOR_MAX_DISTANCE,
      resultLimit: CATEGORY_VECTOR_LIMIT,
    });

    // Ported verbatim from `performSemanticSearch`: cosine distance → raw
    // similarity, squared to sharpen the decay, times the label-type weight,
    // keeping the best score per category.
    const scores = new Map<string, number>();
    for (const match of matches) {
      const distance = Number(match.distance);
      const rawSimilarity = Math.max(0, 1 - distance / 2);
      const typeWeight =
        LABEL_TYPE_WEIGHTS[match.label_type ?? "descriptor"] ?? 0.8;
      const weighted = rawSimilarity * rawSimilarity * typeWeight;
      for (const category of match.associated_categories ?? []) {
        scores.set(category, Math.max(scores.get(category) ?? 0, weighted));
      }
    }

    // Two parallel arrays, index-aligned — the shape the SQL function's
    // `array_position(matched_categories, cat)` lookup requires.
    const matchedCategories = [...scores.keys()];
    return {
      matchedCategories,
      categoryScores: matchedCategories.map((c) => scores.get(c) ?? 0),
    };
  }

  /**
   * `search_places_hybrid` has no visit-status parameter, so the filter runs
   * here — over `ctx.viewerId`'s rows only. Today's semantic path takes a
   * `visitStatuses` argument and silently ignores it.
   */
  async #applyVisitFilter(
    ctx: Ctx,
    input: PlaceSearchInput,
    hits: readonly PlaceSearchHit[],
  ): Promise<readonly PlaceSearchHit[]> {
    const status = input.visitStatus ?? null;
    if (status === null || hits.length === 0) return hits;
    const viewer = ctx.viewerId;
    // A visit filter with nobody to filter by is an empty answer, never an
    // unfiltered one — the same trap `resolveTierListFilter` guards.
    if (viewer === null) return [];

    const rows = await this.db
      .select({ placeId: userPlaceInteractions.placeId })
      .from(userPlaceInteractions)
      .where(
        and(
          eq(userPlaceInteractions.userId, viewer),
          eq(userPlaceInteractions.isVisited, true),
          inArray(
            userPlaceInteractions.placeId,
            hits.map((hit) => hit.placeId),
          ),
        ),
      );
    const visited = new Set(rows.map((row) => row.placeId));
    return hits.filter((hit) =>
      status === "visited"
        ? visited.has(hit.placeId)
        : !visited.has(hit.placeId),
    );
  }
}

/**
 * `performSemanticSearch`'s adaptive threshold: keep anything within a third of
 * the best score, with an absolute floor. A *ranking* decision, so it moves
 * server-side with the ranking; the marker-size normalisation stays in D5.
 */
const cutWeakMatches = (
  hits: readonly PlaceSearchHit[],
): readonly PlaceSearchHit[] => {
  if (hits.length === 0) return hits;
  const top = Math.max(...hits.map((hit) => hit.combinedScore), 0);
  const threshold = Math.max(top * RELATIVE_CUTOFF, ABSOLUTE_MINIMUM_SCORE);
  return hits.filter((hit) => hit.combinedScore >= threshold);
};

const requireLimit = (value: number): number => {
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > PLACE_SEARCH_RESULT_CAP
  ) {
    throw new ValidationError(
      `limit must be an integer in [1, ${PLACE_SEARCH_RESULT_CAP}], got ${value}`,
    );
  }
  return value;
};
