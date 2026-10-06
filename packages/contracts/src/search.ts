/**
 * Search actors (migration plan §2.3; workstream C1).
 *
 * Ten actors, one rule: **a search actor is keyed by a hash of every input
 * except pagination** (§1.5). The actor runs its query once on activation-plus-
 * first-call, holds the capped result set the SQL already limits to 50–500, and
 * `offsetPage`s it in memory. Two pages of one search are therefore two turns on
 * one activation over one result set, not two queries — which is the property
 * `search-keys.test.ts` asserts and the reason the cursor may be an offset at
 * all (`page.ts`'s note on `offsetPage`).
 *
 * ## The key builders live here, not in `services/actors`
 *
 * `services/api` addresses these actors and `services/actors` implements them, so the
 * *key* is a contract between the two exactly as `itemActorId` is (§8.3). Every
 * builder below has the same shape — `(input, viewerId) => string` — including
 * the seven that ignore `viewerId`. That uniformity is deliberate: it lets one
 * test call all ten with two different viewers and assert which keys move,
 * which is the only honest way to check "the viewer is in the hash for exactly
 * the identity-sensitive surfaces".
 *
 * ## Which surfaces are identity-sensitive, and why one of them is conditional
 *
 * §1.5 names three: **in-cellar item search, map browse with tier-list or visit
 * filters, and user search.** §2.3's table then marks `PlaceSearchActor`'s
 * "viewer in hash" column `no` — and those two statements disagree, because
 * `search_places_hybrid` takes `tier_list_ids`, which makes it *exactly* §1.5's
 * second surface. C1 resolves it the way §1.5 words it: `PlaceSearchActor` puts
 * the viewer in the hash **iff** the search is filtered by a tier list or by
 * visit status, and shares one activation across every viewer otherwise. An
 * unconditional `no` would let viewer A's tier-list-filtered result set be
 * served to viewer B from the same activation, which is the §7 hole re-opened
 * one layer up from the SQL that A3b left it in.
 *
 * See `docs/architecture/target-stack.md` §7 and
 * `services/actors/src/lib/tier-list-visibility.ts`.
 */
import { createHash } from "node:crypto";
import type { ActorDescriptor } from "./actors.ts";
import type { Ctx } from "./ctx.ts";
import type { ItemRef, ItemType } from "./items.ts";
import type { Page, PageArgs } from "./page.ts";
import type { LngLat } from "./places.ts";

/* -------------------------------------------------------------------------- */
/* Hashing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Canonical JSON: object keys sorted, `undefined` and `null` members dropped,
 * arrays left in order (order is meaning — `orderedIds`, a vector).
 *
 * Without the sort, `{a, b}` and `{b, a}` are two activations for one search;
 * without the `undefined` drop, an explicitly-passed `undefined` differs from
 * an omitted argument even though the actor cannot tell them apart.
 */
const canonical = (value: unknown): string => {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
};

/**
 * The whole capped result set, for a caller that pages it itself — the menu
 * match and recipe-photo jobs. Internal on every search actor: a resolver
 * pages through `results`, and `all` hands back the entire set in one reply.
 */
export type SearchAllInterface<TInput, THit> = {
  all(ctx: Ctx, input: TInput): Promise<readonly THit[]>;
};

/** The hash every search actor id is. Exported for tests, not for call sites. */
export const searchHash = (input: unknown): string =>
  createHash("sha256").update(canonical(input)).digest("hex");

/**
 * `EmbeddingActor`'s key — `sha256(lower(trim(text)))`, **not** `searchHash`.
 *
 * Settled by B1 (§6's B1 outcome, "For C1") and already relied on by two live
 * call sites that compute it inline: `embeddingActorId` in
 * `services/actors/src/actors/cellar-actor.ts` and `daprEmbedText` in
 * `item-actor.ts`. This is the canonical copy; `embedding-actor.test.ts`
 * asserts all three agree, so changing it here without changing them fails.
 */
export const embeddingActorId = (text: string): string =>
  createHash("sha256").update(text.trim().toLowerCase()).digest("hex");

/* -------------------------------------------------------------------------- */
/* EmbeddingActor                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `EmbeddingActor(sha256(lower(trim(text))))` — replaces `create_search_vector`
 * and `src/lib/cache`'s `unstable_cache` admin workaround (§2.3).
 *
 * The bare-`string` second argument is not the outbox-payload trap (§6's B2
 * note): this method is only ever reached by a *synchronous* sidecar invoke
 * from `CellarActor` and `ItemActor`, never through `outbox.payload`. Both call
 * sites already pass `[ctx, text]`, so the signature is fixed by them.
 */
export type EmbedResult = {
  readonly vector: readonly number[];
  readonly dimensions: number;
  /** `true` when this turn computed it; `false` when the activation had it. */
  readonly computed: boolean;
};

export type EmbeddingActorInterface = {
  embed(ctx: Ctx, text: string): Promise<EmbedResult>;
};

/**
 * A stored item's or recipe's embedding input: the text, and the files
 * embedded with it into the same vector (an item's label and display images,
 * in send order; `[]` for a recipe, or for a model that takes no images).
 */
export type EmbedDocumentInput = {
  readonly text: string;
  readonly imageFileIds: readonly string[];
};

export type EmbedDocumentResult = EmbedResult & {
  /**
   * `embedding_model` for the vector — which embedding made it, as the
   * process that ran the model has it configured — or `null` when that process
   * does not know (then the stored row reads as stale and is redone).
   */
  readonly model: string | null;
};

/**
 * `embedDocument` is internal: `system` only (it is reached from
 * `regenerateVector`, an outbox delivery), because it reads whatever files it
 * is named, as the system.
 */
export type InternalEmbeddingActorInterface = {
  embedDocument(
    ctx: Ctx,
    input: EmbedDocumentInput,
  ): Promise<EmbedDocumentResult>;
  /** G32: a person's search photo (`purpose: "query"`). */
  embedImage(ctx: Ctx, input: EmbedImageInput): Promise<EmbedImageResult>;
  /** G32: a stored `item_image` (`purpose: "document"`), system only. */
  embedStoredImage(ctx: Ctx, input: EmbedImageInput): Promise<EmbedImageResult>;
};

/**
 * The `EmbeddingActor` a document embedding is addressed to: one activation
 * per (text, ordered image set), so the activation is still the cache (§2.3)
 * and a document never shares one with a search phrase. The `document`
 * domain separator is what keeps the two key spaces apart — the query key
 * hashes the bare lower-cased text. Text is trimmed, **not** lower-cased:
 * case is part of what a document says, and legacy embedded it verbatim.
 */
export const documentEmbeddingActorId = (input: EmbedDocumentInput): string =>
  createHash("sha256")
    .update(
      `\u0000document\u0000${input.text.trim()}\u0000${input.imageFileIds.join(",")}`,
    )
    .digest("hex");

/**
 * G32 — a photograph embedded on its own, into the same space as the stored
 * item vectors (legacy `getVectorForString`'s image branch, `82450ad1`).
 *
 * `purpose` decides which budget seam pays: `query` is a person's search photo
 * (`ai_model/image_search`, with its per-user cap), `document` is a stored
 * `item_image` being indexed (`ai_model/image_embedding`, system only). The
 * vector is the same either way — `gemini-embedding-2` takes no task for an
 * image-only input.
 */
export type EmbedImageInput = {
  readonly fileId: string;
  readonly purpose: "query" | "document";
};

export type EmbedImageResult = EmbedResult & {
  /**
   * `item_image_vectors.embedding_model` for the vector
   * (`<provider>:<model>@<dimensions>/IMAGE`), or `null` when the process
   * that ran the model does not know.
   */
  readonly model: string | null;
};

/**
 * The viewer is in the key, unlike {@link embeddingActorId}: the activation
 * caches the vector, and a cached vector handed to a second caller would skip
 * the `FileActor` visibility check the first caller passed. A system caller
 * (an outbox delivery, the backfill) keys as `system`.
 */
export const imageEmbeddingActorId = (
  input: EmbedImageInput,
  viewerId: string | null,
): string =>
  createHash("sha256")
    .update(
      `\u0000image\u0000${viewerId ?? "system"}\u0000${input.purpose}\u0000${input.fileId}`,
    )
    .digest("hex");

export const EmbeddingActorDescriptor: ActorDescriptor<
  EmbeddingActorInterface,
  InternalEmbeddingActorInterface
> = {
  actorType: "EmbeddingActor",
  category: "search",
  // A model call, but not one of §8.5's two 120s exceptions.
  methods: {
    embed: { timeoutMs: 30_000 },
  },
  internalMethods: {
    // Up to six image downloads (30s each at worst, `lib/ai/images.ts`) and
    // then the model call — longer than a phrase, still bounded.
    embedDocument: { timeoutMs: 90_000 },
    // One image download and one model call.
    embedImage: { timeoutMs: 60_000 },
    embedStoredImage: { timeoutMs: 60_000 },
  },
};

/* -------------------------------------------------------------------------- */
/* ItemSearchActor                                                             */
/* -------------------------------------------------------------------------- */

/** Today's `text_search` / `image_search` default in `searchByText.ts`. */
export const ITEM_SEARCH_MAX_DISTANCE = 1;
/** §1.5's "the SQL functions already cap at 50–500", for the ported queries. */
export const ITEM_SEARCH_RESULT_CAP = 50;

/**
 * The image search's defaults, applied by the API when a search names neither.
 *
 * `limit: 10` is legacy's (`82450ad1:src/components/common/OnboardingWizard/
 * actors/searchByImage.ts`). The cutoff is **0.4, not legacy's 0.3**, from a
 * measurement against `gemini-embedding-2` on Vertex (2026-10-05, six category
 * photographs against six one-line `title: none | text: …` documents): the
 * right document was nearest every time, at **0.31–0.38**; the runner-up at
 * 0.39–0.46. Legacy's 0.3 held only because every legacy item vector had its
 * photos fused in — an item embedded from text alone (no image yet, or a
 * text-only model at write time) sits past 0.3 from a photo of itself and
 * would never be offered. Image-to-image distances for the same photograph
 * were 0.02–0.04, so the `item_image_vectors` arm is unaffected by the choice.
 * Results are ranked nearest first, so a looser cutoff adds candidates below
 * the right one rather than ahead of it.
 */
export const IMAGE_SEARCH_MAX_DISTANCE = 0.4;
export const IMAGE_SEARCH_RESULT_LIMIT = 10;

/**
 * Either a phrase (embedded through `EmbeddingActor`) or a vector the caller
 * already has — which is how `image_search` works: the image is embedded by
 * `ItemOnboardingActor`'s model call, never here.
 */
export type ItemSearchInput = {
  readonly text?: string | null;
  readonly vector?: readonly number[] | null;
  /**
   * G32: a search photo, already uploaded through `FileActor`. Embedded as an
   * image (`EmbeddingActor.embedImage`) and matched against both the item
   * vectors and every visible `item_image_vectors` row; an item ranks by the
   * nearer of the two. The viewer joins the key when this is set — which
   * images may match depends on who is asking.
   */
  readonly imageFileId?: string | null;
  /** Empty means all six. */
  readonly itemTypes?: readonly ItemType[] | null;
  readonly maxDistance?: number | null;
  readonly limit?: number | null;
};

export type ItemSearchHit = ItemRef & {
  readonly name: string;
  /** Cosine distance, 0–2. Lower is closer. */
  readonly distance: number;
};

export type ItemSearchActorInterface = {
  results(
    ctx: Ctx,
    input: ItemSearchInput,
    page: PageArgs,
  ): Promise<Page<ItemSearchHit>>;
};

export const ItemSearchActorDescriptor: ActorDescriptor<
  ItemSearchActorInterface,
  SearchAllInterface<ItemSearchInput, ItemSearchHit>
> = {
  actorType: "ItemSearchActor",
  category: "search",
  // The whole capped set, embedding included; called by the menu-match and
  // recipe-photo jobs, which used to disagree (20s and 30s) about the same
  // call. The longer bound, so neither gives up earlier than it did.
  methods: {
    // Embeds its phrase through `EmbeddingActor` inside the request.
    results: { modelBacked: true },
  },
  internalMethods: { all: { timeoutMs: 30_000 } },
};

/** Viewer-insensitive: an item's embedding is the same for everyone (§2.3). */
export const itemSearchActorId = (
  input: ItemSearchInput,
  viewerId: string | null,
): string =>
  searchHash({
    kind: "item",
    text: normaliseText(input.text),
    vector: input.vector ?? null,
    // Absent (and so hashed exactly as before) for a text or vector search,
    // which stay shared across viewers.
    ...(input.imageFileId == null
      ? {}
      : { imageFileId: input.imageFileId, viewerId }),
    itemTypes: [...(input.itemTypes ?? [])].sort(),
    maxDistance: input.maxDistance ?? ITEM_SEARCH_MAX_DISTANCE,
    limit: input.limit ?? ITEM_SEARCH_RESULT_CAP,
  });

/* -------------------------------------------------------------------------- */
/* CellarItemSearchActor                                                       */
/* -------------------------------------------------------------------------- */

/**
 * In-cellar semantic sort (§2.3) — **identity-sensitive**: the answer is the
 * contents of one cellar, and whether the viewer may see that cellar is the
 * whole question. `CellarActor.items(semanticQuery)` (B1) computes the same
 * ordering from the aggregate it already holds; this actor exists because §2.3
 * asks for it and because a search keyed by its inputs can be paged without
 * re-sorting. See the actor's module doc for when to use which.
 */
export type CellarItemSearchInput = {
  readonly cellarId: string;
  readonly query: string;
  readonly limit?: number | null;
};

export type CellarItemSearchHit = {
  readonly cellarItemId: string;
  readonly item: ItemRef;
  readonly distance: number | null;
};

export type CellarItemSearchActorInterface = {
  results(
    ctx: Ctx,
    input: CellarItemSearchInput,
    page: PageArgs,
  ): Promise<Page<CellarItemSearchHit>>;
};

export const CellarItemSearchActorDescriptor: ActorDescriptor<
  CellarItemSearchActorInterface,
  SearchAllInterface<CellarItemSearchInput, CellarItemSearchHit>
> = {
  actorType: "CellarItemSearchActor",
  category: "search",
  methods: {
    results: { modelBacked: true },
  },
  internalMethods: { all: {} },
};

/** **Viewer in the hash** — §1.5's first identity-sensitive surface. */
export const cellarItemSearchActorId = (
  input: CellarItemSearchInput,
  viewerId: string | null,
): string =>
  searchHash({
    kind: "cellar-item",
    cellarId: input.cellarId,
    query: normaliseText(input.query),
    limit: input.limit ?? ITEM_SEARCH_RESULT_CAP,
    viewerId,
  });

/* -------------------------------------------------------------------------- */
/* BrandSearchActor                                                            */
/* -------------------------------------------------------------------------- */

export const BRAND_SEARCH_RESULT_CAP = 50;

export type BrandSearchInput = {
  /** Matched as `%term%`, case-insensitively. Empty lists brands by name. */
  readonly term?: string | null;
  readonly limit?: number | null;
};

export type BrandSearchHit = {
  readonly id: string;
  readonly name: string;
  readonly brandType: string | null;
  readonly logoUrl: string | null;
};

export type BrandSearchActorInterface = {
  results(
    ctx: Ctx,
    input: BrandSearchInput,
    page: PageArgs,
  ): Promise<Page<BrandSearchHit>>;
};

export const BrandSearchActorDescriptor: ActorDescriptor<
  BrandSearchActorInterface,
  SearchAllInterface<BrandSearchInput, BrandSearchHit>
> = {
  actorType: "BrandSearchActor",
  category: "search",
  methods: {
    results: {},
  },
  internalMethods: { all: {} },
};

/** Viewer-insensitive: the brand catalog is the same for every signed-in user. */
export const brandSearchActorId = (
  input: BrandSearchInput,
  _viewerId: string | null,
): string =>
  searchHash({
    kind: "brand",
    term: normaliseText(input.term),
    limit: input.limit ?? BRAND_SEARCH_RESULT_CAP,
  });

/* -------------------------------------------------------------------------- */
/* RecipeSearchActor                                                           */
/* -------------------------------------------------------------------------- */

export const RECIPE_SEARCH_RESULT_CAP = 50;
/** `src/lib/recipe-search.ts`'s semantic threshold, preserved. */
export const RECIPE_SEARCH_MAX_DISTANCE = 0.8;

export type RecipeSearchInput = {
  /** `_ilike` over name, description and type — today's `SearchRecipesQuery`. */
  readonly term?: string | null;
  /** When set, the semantic half runs too and ranking is by vector distance. */
  readonly semanticQuery?: string | null;
  /** `recipes.type`: `food` | `cocktail`. */
  readonly type?: string | null;
  readonly maxDistance?: number | null;
  readonly limit?: number | null;
};

export type RecipeSearchHit = {
  readonly recipeId: string;
  readonly name: string;
  readonly description: string | null;
  readonly type: string;
  readonly recipeGroupId: string | null;
  /** Present only on a `semanticQuery` search. Cosine distance, 0–2. */
  readonly distance: number | null;
};

export type RecipeSearchActorInterface = {
  results(
    ctx: Ctx,
    input: RecipeSearchInput,
    page: PageArgs,
  ): Promise<Page<RecipeSearchHit>>;
};

export const RecipeSearchActorDescriptor: ActorDescriptor<
  RecipeSearchActorInterface,
  SearchAllInterface<RecipeSearchInput, RecipeSearchHit>
> = {
  actorType: "RecipeSearchActor",
  category: "search",
  methods: {
    results: { modelBacked: true },
  },
  internalMethods: { all: { timeoutMs: 20_000 } },
};

/** Viewer-insensitive: recipes are catalog data with no privacy column. */
export const recipeSearchActorId = (
  input: RecipeSearchInput,
  _viewerId: string | null,
): string =>
  searchHash({
    kind: "recipe",
    term: normaliseText(input.term),
    semanticQuery: normaliseText(input.semanticQuery),
    type: normaliseText(input.type),
    maxDistance: input.maxDistance ?? RECIPE_SEARCH_MAX_DISTANCE,
    limit: input.limit ?? RECIPE_SEARCH_RESULT_CAP,
  });

/* -------------------------------------------------------------------------- */
/* UserSearchActor                                                             */
/* -------------------------------------------------------------------------- */

export const USER_SEARCH_RESULT_CAP = 10;

export type UserSearchInput = {
  readonly term: string;
  readonly limit?: number | null;
};

export type UserSearchHit = {
  readonly userId: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
};

export type UserSearchActorInterface = {
  results(
    ctx: Ctx,
    input: UserSearchInput,
    page: PageArgs,
  ): Promise<Page<UserSearchHit>>;
};

export const UserSearchActorDescriptor: ActorDescriptor<
  UserSearchActorInterface,
  SearchAllInterface<UserSearchInput, UserSearchHit>
> = {
  actorType: "UserSearchActor",
  category: "search",
  methods: {
    results: {},
  },
  internalMethods: { all: {} },
};

/**
 * **Viewer in the hash** — §1.5's third surface. The result set excludes the
 * viewer, their friends and anyone with a request open in either direction, so
 * two viewers typing the same word get genuinely different answers.
 */
export const userSearchActorId = (
  input: UserSearchInput,
  viewerId: string | null,
): string =>
  searchHash({
    kind: "user",
    term: normaliseText(input.term),
    limit: input.limit ?? USER_SEARCH_RESULT_CAP,
    viewerId,
  });

/* -------------------------------------------------------------------------- */
/* DuplicatePlaceSearchActor                                                   */
/* -------------------------------------------------------------------------- */

/** `find_duplicate_places`' own defaults, and `PlaceCreationActor`'s. */
export const DUPLICATE_SEARCH_RADIUS_M = 200;
export const DUPLICATE_SEARCH_MIN_SIMILARITY = 0.3;
export const DUPLICATE_SEARCH_RESULT_CAP = 5;

/**
 * B5's ceiling on the radius, preserved: a 5km "duplicate" is not one.
 *
 * A7g moved it here from `duplicate-place-search-actor.ts`, where it was a
 * module-private constant. The cap has to be *stated* in the arg description
 * (D5 found it undocumented), and the house style interpolates the constant
 * rather than typing the number out — which is only possible if the API layer
 * can import it. Two copies of `5000` in two packages is exactly the drift
 * that makes documentation worse than none.
 */
export const DUPLICATE_SEARCH_MAX_RADIUS_M = 5000;

export type DuplicatePlaceSearchInput = {
  readonly name: string;
  readonly location: LngLat;
  readonly radiusMeters?: number | null;
  readonly minSimilarity?: number | null;
  readonly limit?: number | null;
};

export type DuplicatePlaceHit = {
  readonly placeId: string;
  readonly name: string;
  readonly primaryCategory: string | null;
  readonly location: LngLat | null;
  readonly streetAddress: string | null;
  readonly locality: string | null;
  readonly similarity: number;
  readonly distanceMeters: number;
};

export type DuplicatePlaceSearchActorInterface = {
  results(
    ctx: Ctx,
    input: DuplicatePlaceSearchInput,
    page: PageArgs,
  ): Promise<Page<DuplicatePlaceHit>>;
};

export const DuplicatePlaceSearchActorDescriptor: ActorDescriptor<
  DuplicatePlaceSearchActorInterface,
  SearchAllInterface<DuplicatePlaceSearchInput, DuplicatePlaceHit>
> = {
  actorType: "DuplicatePlaceSearchActor",
  category: "search",
  methods: {
    results: {},
  },
  internalMethods: { all: {} },
};

/** Viewer-insensitive: `places` has no privacy column (B5's module doc). */
export const duplicatePlaceSearchActorId = (
  input: DuplicatePlaceSearchInput,
  _viewerId: string | null,
): string =>
  searchHash({
    kind: "duplicate-place",
    name: normaliseText(input.name),
    lng: round6(input.location.lng),
    lat: round6(input.location.lat),
    radiusMeters: input.radiusMeters ?? DUPLICATE_SEARCH_RADIUS_M,
    minSimilarity: input.minSimilarity ?? DUPLICATE_SEARCH_MIN_SIMILARITY,
    limit: input.limit ?? DUPLICATE_SEARCH_RESULT_CAP,
  });

/* -------------------------------------------------------------------------- */
/* PlaceSearchActor                                                            */
/* -------------------------------------------------------------------------- */

/** `searchMapPlaces`' semantic cap, preserved: "more adds noise, not signal". */
export const PLACE_SEARCH_RESULT_CAP = 50;
/** `performSemanticSearch` step 2. */
export const CATEGORY_VECTOR_MAX_DISTANCE = 0.6;
export const CATEGORY_VECTOR_LIMIT = 15;

/**
 * `search_places_hybrid`'s weights, lifted out of the SQL body (§2.3: "with
 * every weight passed as an argument from TypeScript so there is one source of
 * truth"). A3b deliberately left them hard-coded; see the actor's module doc
 * for what C1 could and could not finish here.
 */
export const PLACE_SEARCH_WEIGHTS = {
  textRank: 0.35,
  trigram: 0.25,
  category: 0.4,
  /** Quadratic bonus above `nameBoostThreshold`. */
  nameBoost: 0.5,
  nameBoostThreshold: 0.5,
  /** `primary_category` match multiplier inside the category layers. */
  primaryCategoryBoost: 1.15,
} as const;

/** `performSemanticSearch`'s `LABEL_TYPE_WEIGHTS`, ported verbatim. */
export const LABEL_TYPE_WEIGHTS: Record<string, number> = {
  category: 1.0,
  item_type: 0.95,
  alias: 0.9,
  descriptor: 0.8,
};

export type MapBounds = {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
};

export type VisitStatusFilter = "visited" | "unvisited";

export type PlaceSearchInput = {
  readonly query: string;
  readonly bounds?: MapBounds | null;
  /** `places.primary_category` / `categories` values, already mapped. */
  readonly filterCategories?: readonly string[] | null;
  readonly minRating?: number | null;
  /** Ids as the *client* supplied them. The actor filters them by visibility. */
  readonly tierListIds?: readonly string[] | null;
  readonly visitStatus?: VisitStatusFilter | null;
  readonly limit?: number | null;
};

export type PlaceSearchHit = {
  readonly placeId: string;
  readonly name: string;
  readonly location: LngLat | null;
  readonly primaryCategory: string | null;
  readonly categories: readonly string[];
  readonly rating: number | null;
  readonly priceLevel: number | null;
  readonly streetAddress: string | null;
  readonly locality: string | null;
  readonly region: string | null;
  readonly isVerified: boolean | null;
  readonly textRank: number;
  readonly trigramSimilarity: number;
  readonly categoryScore: number;
  readonly combinedScore: number;
};

export type PlaceSearchActorInterface = {
  results(
    ctx: Ctx,
    input: PlaceSearchInput,
    page: PageArgs,
  ): Promise<Page<PlaceSearchHit>>;
};

export const PlaceSearchActorDescriptor: ActorDescriptor<
  PlaceSearchActorInterface,
  SearchAllInterface<PlaceSearchInput, PlaceSearchHit>
> = {
  actorType: "PlaceSearchActor",
  category: "search",
  methods: {
    results: { modelBacked: true },
  },
  internalMethods: { all: {} },
};

/**
 * True when this search's answer depends on who is asking — §1.5's second
 * identity-sensitive surface, "map browse **with tier-list or visit filters**".
 */
export const placeSearchIsViewerScoped = (input: PlaceSearchInput): boolean =>
  (input.tierListIds?.length ?? 0) > 0 || input.visitStatus != null;

/** Viewer in the hash **iff** `placeSearchIsViewerScoped` (module doc). */
export const placeSearchActorId = (
  input: PlaceSearchInput,
  viewerId: string | null,
): string =>
  searchHash({
    kind: "place",
    query: normaliseText(input.query),
    bounds: input.bounds ?? null,
    filterCategories: [...(input.filterCategories ?? [])].sort(),
    minRating: input.minRating ?? null,
    tierListIds: [...(input.tierListIds ?? [])].sort(),
    visitStatus: input.visitStatus ?? null,
    limit: input.limit ?? PLACE_SEARCH_RESULT_CAP,
    viewerId: placeSearchIsViewerScoped(input) ? viewerId : null,
  });

/* -------------------------------------------------------------------------- */
/* GooglePlacesActor                                                           */
/* -------------------------------------------------------------------------- */

export const GOOGLE_AUTOCOMPLETE_RADIUS_M = 500;
export const GOOGLE_NEARBY_RADIUS_M = 200;
export const GOOGLE_NEARBY_MAX_RESULTS = 5;

export type GooglePlacesSearchInput = {
  readonly mode: "autocomplete" | "nearby";
  /** Required for `autocomplete`, ignored for `nearby`. */
  readonly input?: string | null;
  readonly location: LngLat;
  readonly radiusMeters?: number | null;
  readonly maxResults?: number | null;
};

export type GooglePlaceSuggestion = {
  readonly googlePlaceId: string;
  readonly name: string;
  readonly secondaryText: string | null;
  readonly types: readonly string[];
  readonly location: LngLat | null;
};

export type GooglePlacesSearchResult = {
  readonly suggestions: readonly GooglePlaceSuggestion[];
  /** `false` when `BudgetActor` denied the spend; `suggestions` is then empty. */
  readonly charged: boolean;
  readonly reason: string;
};

/**
 * G21: what the create-place form pre-fills from a picked Google suggestion,
 * before the place exists — exactly the fields `82450ad1`'s
 * `CreatePlaceForm.prefillFromGoogle` set (name, phone, website, the editorial
 * summary as the description, and the types it mapped to categories), and
 * nothing else. Fetched with a field mask of just these.
 */
export type GooglePlacePrefill = {
  readonly googlePlaceId: string;
  readonly name: string | null;
  /** E.164 when Google gave an international number, else its national one. */
  readonly phone: string | null;
  readonly website: string | null;
  readonly editorialSummary: string | null;
  readonly types: readonly string[];
};

export type GooglePlaceDetailsInput = { readonly googlePlaceId: string };

export type GooglePlaceDetailsResult = {
  /** Null when the budget denied the call or Google had no such place. */
  readonly details: GooglePlacePrefill | null;
  /** `false` when `BudgetActor` denied the spend; nothing was spent. */
  readonly charged: boolean;
  readonly reason: string;
};

export type GooglePlacesActorInterface = {
  search(
    ctx: Ctx,
    input: GooglePlacesSearchInput,
  ): Promise<GooglePlacesSearchResult>;
  /** G21 — keyed by {@link googlePlaceDetailsActorId}, not the search hash. */
  details(
    ctx: Ctx,
    input: GooglePlaceDetailsInput,
  ): Promise<GooglePlaceDetailsResult>;
};

export const GooglePlacesActorDescriptor: ActorDescriptor<GooglePlacesActorInterface> =
  {
    actorType: "GooglePlacesActor",
    category: "search",
    methods: {
      search: {},
      details: {},
    },
  };

/**
 * `GooglePlacesActor`'s key for a details pre-fill. Viewer-insensitive, like
 * the search key: the same pick by anyone inside one activation is charged
 * once. Its own `kind`, so it can never collide with a search activation.
 */
export const googlePlaceDetailsActorId = (googlePlaceId: string): string =>
  searchHash({
    kind: "google-place-details",
    googlePlaceId: googlePlaceId.trim(),
  });

/** Viewer-insensitive: Google's answer does not depend on who asked. */
export const googlePlacesActorId = (
  input: GooglePlacesSearchInput,
  _viewerId: string | null,
): string =>
  searchHash({
    kind: "google-places",
    mode: input.mode,
    input: normaliseText(input.input),
    lng: round6(input.location.lng),
    lat: round6(input.location.lat),
    radiusMeters:
      input.radiusMeters ??
      (input.mode === "autocomplete"
        ? GOOGLE_AUTOCOMPLETE_RADIUS_M
        : GOOGLE_NEARBY_RADIUS_M),
    maxResults: input.maxResults ?? GOOGLE_NEARBY_MAX_RESULTS,
  });

/* -------------------------------------------------------------------------- */
/* GeocodeActor                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Photon forward/reverse (§2.3). Long idle window — 24h, configured in the
 * actor runtime, not here — because a street's coordinates do not move.
 *
 * The reverse key rounds to 5 decimal places (~1.1 m), which is finer than the
 * "~11m precision" `src/lib/cache/index.ts` claims but coarse enough that a
 * pixel of map jitter does not mint a new activation.
 */
export type GeocodeInput =
  | { readonly mode: "forward"; readonly query: string }
  | { readonly mode: "reverse"; readonly location: LngLat };

export type ForwardGeocodeResult = {
  readonly latitude: number;
  readonly longitude: number;
  readonly displayName: string;
} | null;

export type ReverseGeocodeResult = {
  readonly streetAddress: string | null;
  readonly locality: string | null;
  readonly region: string | null;
  readonly postcode: string | null;
  readonly countryCode: string | null;
} | null;

export type GeocodeActorInterface = {
  forward(ctx: Ctx, input: GeocodeInput): Promise<ForwardGeocodeResult>;
  reverse(ctx: Ctx, input: GeocodeInput): Promise<ReverseGeocodeResult>;
};

export const GeocodeActorDescriptor: ActorDescriptor<GeocodeActorInterface> = {
  actorType: "GeocodeActor",
  category: "search",
  methods: {
    forward: {},
    reverse: {},
  },
};

/** Viewer-insensitive: an address is an address. */
export const geocodeActorId = (
  input: GeocodeInput,
  _viewerId: string | null,
): string =>
  searchHash(
    input.mode === "forward"
      ? { kind: "geocode", mode: "forward", query: normaliseText(input.query) }
      : {
          kind: "geocode",
          mode: "reverse",
          lng: round5(input.location.lng),
          lat: round5(input.location.lat),
        },
  );

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `"  Pinot   Noir "` and `"pinot noir"` are one search. Whitespace is
 * collapsed as well as trimmed, because a double space is a typo and not a
 * different query — and every one of these terms reaches SQL as an `ilike`
 * pattern or an embedding, both of which ignore it.
 */
const normaliseText = (value: string | null | undefined): string | null => {
  if (value == null) return null;
  const collapsed = value.trim().replace(/\s+/g, " ").toLowerCase();
  return collapsed === "" ? null : collapsed;
};

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
const round5 = (n: number): number => Math.round(n * 1e5) / 1e5;
