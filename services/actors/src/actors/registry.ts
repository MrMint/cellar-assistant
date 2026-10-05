/**
 * Every actor this host serves, as data: one {@link entry} per class, each
 * holding the class **and** the descriptor it answers to.
 *
 * ## Why a list, and why each class is paired with its descriptor
 *
 * `src/index.ts` used to hand-write ~49 `registerActor` calls, and three things
 * followed from that. Tests had to parse `index.ts` as an AST to learn what was
 * registered, because importing it binds a port. The category was declared
 * twice — on the descriptor in `@cellar-assistant/contracts` and as the class's
 * `static category` — with nothing comparing the two. And nothing tied a class
 * to the contract `services/api` types its proxies over: only `PingActor` said
 * `implements`, and a `RecipePhotoJobActor` drift had already shipped (fixed in
 * 61ece700).
 *
 * `entry(Class, Descriptor)` closes the last of those at compile time. It
 * accepts a class only if its instances carry every method of the descriptor's
 * public **and** internal interface, compared with **strict parameter
 * variance** ({@link StrictInterface}). That is stronger than the class's own
 * `implements` clause: TypeScript checks method-syntax parameters bivariantly,
 * so `implements` accepts a method whose parameter is *narrower* than the
 * contract's, which is the drift that matters — a caller the contract allows,
 * the class does not handle. `registry.test.ts` holds a `@ts-expect-error`
 * mismatch, so a loosened `entry` fails typecheck.
 *
 * The runtime half is `registry.test.ts`: `Class.name === actorType` (Dapr
 * registers a class under its constructor name, so a descriptor naming anything
 * else addresses an actor type nobody serves), the two categories agree, and
 * every concrete actor class under `src/actors` is here exactly once.
 *
 * ## Order
 *
 * Registration order is the order below, which is the order `index.ts` used —
 * it only shows in the boot log line. The workstream notes that sat beside each
 * `registerActor` call moved here with it.
 */
import type {
  ActorCategory,
  ActorDescriptor,
  ActorInterface,
  AnyActorDescriptor,
} from "@cellar-assistant/contracts";
import {
  BarcodeActorDescriptor,
  BrandActorDescriptor,
  BrandLinksCollectionActorDescriptor,
  BrandRegistryActorDescriptor,
  BrandSearchActorDescriptor,
  BrandsCollectionActorDescriptor,
  BudgetActorDescriptor,
  CategoryVectorsActorDescriptor,
  CellarActorDescriptor,
  CellarItemSearchActorDescriptor,
  CellarsCollectionActorDescriptor,
  CheckInsCollectionActorDescriptor,
  DuplicatePlaceSearchActorDescriptor,
  EmbeddingActorDescriptor,
  FavoritesCollectionActorDescriptor,
  FileActorDescriptor,
  FriendsCollectionActorDescriptor,
  GeocodeActorDescriptor,
  GooglePlacesActorDescriptor,
  ItemActorDescriptor,
  ItemOnboardingActorDescriptor,
  ItemSearchActorDescriptor,
  MapActorDescriptor,
  MatchSuggestionsCollectionActorDescriptor,
  MenuMatchJobActorDescriptor,
  MenuScanActorDescriptor,
  MenuScansCollectionActorDescriptor,
  OnboardingReprocessJobActorDescriptor,
  OvertureReloadJobActorDescriptor,
  PingActorDescriptor,
  PlaceActorDescriptor,
  PlaceCreationActorDescriptor,
  PlaceRefreshJobActorDescriptor,
  PlaceSearchActorDescriptor,
  RankingsActorDescriptor,
  RecipeActorDescriptor,
  RecipeGroupActorDescriptor,
  RecipeGroupsCollectionActorDescriptor,
  RecipePhotoJobActorDescriptor,
  RecipeSearchActorDescriptor,
  ReferenceDataActorDescriptor,
  TierListActorDescriptor,
  TierListsCollectionActorDescriptor,
  UserActorDescriptor,
  UserSearchActorDescriptor,
  VectorReembedJobActorDescriptor,
} from "@cellar-assistant/contracts";
import type { AbstractActor, ActorId, DaprClient } from "@dapr/dapr";
import { guardDeclaredMethods } from "../lib/actor-method-allowlist.ts";
import type { KeepAlive } from "../lib/keep-alive.ts";
import { BarcodeActor } from "./barcode-actor.ts";
import { BrandActor } from "./brand-actor.ts";
import { BrandLinksCollectionActor } from "./brand-links-collection-actor.ts";
import { BrandRegistryActor } from "./brand-registry-actor.ts";
import { BrandSearchActor } from "./brand-search-actor.ts";
import { BrandsCollectionActor } from "./brands-collection-actor.ts";
import { BudgetActor } from "./budget-actor.ts";
import { CategoryVectorsActor } from "./category-vectors-actor.ts";
import { CellarActor } from "./cellar-actor.ts";
import { CellarItemSearchActor } from "./cellar-item-search-actor.ts";
import { CellarsCollectionActor } from "./cellars-collection-actor.ts";
import { CheckInsCollectionActor } from "./check-ins-collection-actor.ts";
import { DuplicatePlaceSearchActor } from "./duplicate-place-search-actor.ts";
import { EmbeddingActor } from "./embedding-actor.ts";
import { FavoritesCollectionActor } from "./favorites-collection-actor.ts";
import { FileActor } from "./file-actor.ts";
import { FriendsCollectionActor } from "./friends-collection-actor.ts";
import { GeocodeActor } from "./geocode-actor.ts";
import { GooglePlacesActor } from "./google-places-actor.ts";
import { ItemActor } from "./item-actor.ts";
import { ItemOnboardingActor } from "./item-onboarding-actor.ts";
import { ItemSearchActor } from "./item-search-actor.ts";
import {
  MAINTENANCE_KEEP_ALIVE,
  MaintenanceActor,
  MaintenanceActorDescriptor,
} from "./maintenance-actor.ts";
import { MapActor } from "./map-actor.ts";
import { MatchSuggestionsCollectionActor } from "./match-suggestions-collection-actor.ts";
import { MenuMatchJobActor } from "./menu-match-job-actor.ts";
import { MenuScanActor } from "./menu-scan-actor.ts";
import { MenuScansCollectionActor } from "./menu-scans-collection-actor.ts";
import { OnboardingReprocessJobActor } from "./onboarding-reprocess-job-actor.ts";
import {
  OUTBOX_KEEP_ALIVE,
  OutboxActor,
  OutboxActorDescriptor,
} from "./outbox-actor.ts";
import { OvertureReloadJobActor } from "./overture-reload-job-actor.ts";
import { PingActor } from "./ping-actor.ts";
import { PlaceActor } from "./place-actor.ts";
import { PlaceCreationActor } from "./place-creation-actor.ts";
import { PlaceRefreshJobActor } from "./place-refresh-job-actor.ts";
import { PlaceSearchActor } from "./place-search-actor.ts";
import { ProbeJobActor, ProbeJobActorDescriptor } from "./probe-job-actor.ts";
import { RankingsActor } from "./rankings-actor.ts";
import { RecipeActor } from "./recipe-actor.ts";
import { RecipeGroupActor } from "./recipe-group-actor.ts";
import { RecipeGroupsCollectionActor } from "./recipe-groups-collection-actor.ts";
import { RecipePhotoJobActor } from "./recipe-photo-job-actor.ts";
import { RecipeSearchActor } from "./recipe-search-actor.ts";
import { ReferenceDataActor } from "./reference-data-actor.ts";
import { TierListActor } from "./tier-list-actor.ts";
import { TierListsCollectionActor } from "./tier-lists-collection-actor.ts";
import { UserActor } from "./user-actor.ts";
import { UserSearchActor } from "./user-search-actor.ts";
import { VectorReembedJobActor } from "./vector-reembed-job-actor.ts";

/**
 * An interface whose methods are compared with strict parameter variance.
 *
 * `(...args: A) => R` rebuilt through `infer` is a *function type*, not a
 * method signature, and TypeScript's `strictFunctionTypes` applies to exactly
 * that distinction. The mapped copy is otherwise identical to the original.
 */
export type StrictInterface<TInterface> = {
  [TMethod in keyof TInterface]: TInterface[TMethod] extends (
    ...args: infer TArgs
  ) => infer TResult
    ? (...args: TArgs) => TResult
    : never;
};

/**
 * A class Dapr can host for a descriptor: constructible as Dapr constructs it
 * — `new Cls(daprClient, actorId)`, every further constructor parameter
 * defaulted (that is how each actor is handed its seams) — with the
 * descriptor's methods on its instances and its category as a static.
 */
export type ActorClassFor<
  TInterface extends ActorInterface,
  TInternal extends ActorInterface,
> = (new (
  daprClient: DaprClient,
  id: ActorId,
) => AbstractActor & StrictInterface<TInterface & TInternal>) & {
  readonly category: ActorCategory;
};

/** One registered actor: what Dapr is handed, and what it answers to. */
export type RegistryEntry = {
  readonly actorClass: (new (
    daprClient: DaprClient,
    id: ActorId,
  ) => AbstractActor) & { readonly category: ActorCategory };
  readonly descriptor: AnyActorDescriptor;
  /**
   * The reminder that keeps an actor nothing invokes alive, armed by `boot()`
   * after the server starts. See `../lib/keep-alive.ts`.
   */
  readonly keepAlive?: KeepAlive;
};

export type EntryOptions = {
  readonly keepAlive?: KeepAlive;
};

/**
 * Pair a class with its descriptor. The descriptor alone decides the
 * interfaces (`NoInfer` on the class), so a class that lacks a method, or
 * takes a narrower argument than the contract promises, is a type error here.
 *
 * Also wraps every declared method so it refuses a malformed `ctx` before its
 * body runs (`../lib/actor-method-allowlist.ts`). That is the runtime half of
 * the wire boundary; the other half — refusing an undeclared method name
 * before Dapr dispatches it — reads the same descriptor tables, from
 * `ACTOR_REGISTRY`, in `index.ts`.
 */
export const entry = <
  TInterface extends ActorInterface,
  TInternal extends ActorInterface,
>(
  actorClass: ActorClassFor<NoInfer<TInterface>, NoInfer<TInternal>>,
  descriptor: ActorDescriptor<TInterface, TInternal>,
  options: EntryOptions = {},
): RegistryEntry => {
  guardDeclaredMethods(actorClass, descriptor);
  return { actorClass, descriptor, ...options };
};

export const ACTOR_REGISTRY: readonly RegistryEntry[] = [
  entry(PingActor, PingActorDescriptor),
  // A5 (§2.7). Nothing invokes `OutboxActor`; its keep-alive is the only thing
  // that runs it. `JobActor` itself is abstract and is never registered; C4's
  // concrete subclasses register alongside this probe.
  entry(OutboxActor, OutboxActorDescriptor, { keepAlive: OUTBOX_KEEP_ALIVE }),
  entry(ProbeJobActor, ProbeJobActorDescriptor),
  // A8 (§2.1, §2.6). Registering `MaintenanceActor` makes it *callable*; its
  // keep-alive is what makes it *run* — that half was once missing for nine
  // days, and the outbox's only alarm read "all clear" because it was off.
  entry(FileActor, FileActorDescriptor),
  entry(MaintenanceActor, MaintenanceActorDescriptor, {
    keepAlive: MAINTENANCE_KEEP_ALIVE,
  }),
  // A9 (§2.5, §2.1).
  entry(ReferenceDataActor, ReferenceDataActorDescriptor),
  entry(CategoryVectorsActor, CategoryVectorsActorDescriptor),
  // B1 (§2.1).
  entry(CellarActor, CellarActorDescriptor),
  // B4 (§2.1, §1.7).
  entry(UserActor, UserActorDescriptor),
  // B3 (§2.1).
  entry(BrandActor, BrandActorDescriptor),
  entry(BrandRegistryActor, BrandRegistryActorDescriptor),
  // B7 (§2.1).
  entry(TierListActor, TierListActorDescriptor),
  // B2 (§2.1). `ItemActor` serves all seven key namespaces (six item types
  // plus `generic:`); `BarcodeActor` is keyed by the code itself.
  entry(ItemActor, ItemActorDescriptor),
  entry(BarcodeActor, BarcodeActorDescriptor),
  entry(ItemOnboardingActor, ItemOnboardingActorDescriptor),
  // B5 (§2.1, §1.5). `PlaceCreationActor` is the registry in front of
  // `PlaceActor.create`, keyed by the creating viewer (Wave 6 — see
  // docs/architecture/actor-keys.md); `BudgetActor` is the singleton every paid
  // external call reserves through.
  entry(PlaceActor, PlaceActorDescriptor),
  entry(PlaceCreationActor, PlaceCreationActorDescriptor),
  entry(BudgetActor, BudgetActorDescriptor),
  // B6 (§2.1, §3). A group owns `recipe_votes` because what a vote decides is
  // the group's `canonical_recipe_id` — `vote` recomputes it in-turn,
  // replacing the `update_canonical_recipe` PL/pgSQL trigger.
  entry(RecipeActor, RecipeActorDescriptor),
  entry(RecipeGroupActor, RecipeGroupActorDescriptor),
  // C1 (§2.3). Ten search actors, every one keyed by a hash of its inputs
  // **except pagination** (§1.5) and writing nothing (§1.1). `EmbeddingActor`
  // is keyed by `sha256(lower(trim(text)))` rather than `searchHash`, because
  // B1's `CellarActor.semanticQuery` already addressed it that way.
  //
  // Three of them put the viewer in the key — `CellarItemSearchActor`,
  // `UserSearchActor`, and `PlaceSearchActor` when (and only when) the search
  // carries a tier-list or visit filter. See `packages/contracts/src/search.ts`.
  entry(EmbeddingActor, EmbeddingActorDescriptor),
  entry(ItemSearchActor, ItemSearchActorDescriptor),
  entry(CellarItemSearchActor, CellarItemSearchActorDescriptor),
  entry(BrandSearchActor, BrandSearchActorDescriptor),
  entry(RecipeSearchActor, RecipeSearchActorDescriptor),
  entry(UserSearchActor, UserSearchActorDescriptor),
  entry(PlaceSearchActor, PlaceSearchActorDescriptor),
  entry(DuplicatePlaceSearchActor, DuplicatePlaceSearchActorDescriptor),
  entry(GooglePlacesActor, GooglePlacesActorDescriptor),
  entry(GeocodeActor, GeocodeActorDescriptor),
  // C2 (§2.4). The two view actors: screen-shaped projections, keyed by
  // viewer, writing nothing (§1.1). `MapActor` reaches
  // `search_places_adaptive_cluster` only through `lib/place-search-sql.ts`,
  // so it inherits C1's tier-list gate (target-stack.md §7) instead of
  // re-opening it; `RankingsActor` replaces the `item_scores` native query and
  // derives its reviewer set from `ctx`, which is the second §7 hole closed.
  // See `packages/contracts/src/views.ts`.
  entry(MapActor, MapActorDescriptor),
  entry(RankingsActor, RankingsActorDescriptor),
  // B8 (§2.1, §1.4, §8.5). `MenuScanActor` owns `menu_scans` and
  // `item_match_suggestions` and replaces the `processing_status` event
  // trigger with three outbox rows. `MenuMatchJobActor` exists because §8.5
  // forbids an entity actor from calling a search actor: the vector match and
  // its AI verification run on `job -> entity / registry / search` instead.
  entry(MenuScanActor, MenuScanActorDescriptor),
  entry(MenuMatchJobActor, MenuMatchJobActorDescriptor),
  // C4 (§2.6). The three real job actors, replacing A5's `ProbeJobActor` as
  // the example: each writes only its own `jobs` row and reaches every other
  // aggregate through the actor that owns it. `MaintenanceActor` is registered
  // with A8 above — §2.6 lists it here but it is an unbounded scheduled
  // singleton, not a finite cursor chain, so it is a plain `ActorBase`.
  // `RecipePhotoJobActor` is where target-stack §7's client-supplied `userId`
  // dies: its principal is `jobs.created_by`, and its payload type forbids one.
  entry(PlaceRefreshJobActor, PlaceRefreshJobActorDescriptor),
  entry(OnboardingReprocessJobActor, OnboardingReprocessJobActorDescriptor),
  entry(RecipePhotoJobActor, RecipePhotoJobActorDescriptor),
  // C4b (§2.6). The Overture bulk reload: the half of `refreshPlaces` C4 left
  // unbuilt. It writes `places` through `PlaceActor` at the reserved key
  // `PLACE_BULK_ACTOR_ID`, one page per turn, so §8.5's call graph gains one
  // `job -> entity` edge rather than one per row.
  entry(OvertureReloadJobActor, OvertureReloadJobActorDescriptor),
  // The re-embed walk: every `item_vectors` / `recipe_vectors` row another
  // embedding made, re-embedded by its own `ItemActor` / `RecipeActor`. The
  // cutover step after the switch to `gemini-embedding-2`.
  entry(VectorReembedJobActor, VectorReembedJobActorDescriptor),
  // C3 (§2.2, §1.5). Nine collection actors: they write nothing (§1.1), hold
  // nothing between turns (each list is one keyset-paged query), and declare
  // ids or a projection per method in `packages/contracts/src/collections.ts`.
  //
  // Seven are keyed by the viewer and refuse any caller who is not that
  // viewer, on every turn, before reading (C2's rule; C1's bug was a warm
  // activation answering an unchecked second caller). The two catalog
  // collections are keyed by a hash of their filter rather than being the
  // singletons §2.2 writes — §1.5: "key read-only actors by something with
  // cardinality".
  //
  // `MatchSuggestionsCollectionActor` serves `/discoveries` from the
  // **viewer's own** scans; §2.2's "places the viewer has interacted with"
  // scope is withdrawn, because menu scans are owner-only (§2.1, B8).
  entry(CellarsCollectionActor, CellarsCollectionActorDescriptor),
  entry(CheckInsCollectionActor, CheckInsCollectionActorDescriptor),
  entry(TierListsCollectionActor, TierListsCollectionActorDescriptor),
  entry(FavoritesCollectionActor, FavoritesCollectionActorDescriptor),
  entry(FriendsCollectionActor, FriendsCollectionActorDescriptor),
  entry(MenuScansCollectionActor, MenuScansCollectionActorDescriptor),
  entry(
    MatchSuggestionsCollectionActor,
    MatchSuggestionsCollectionActorDescriptor,
  ),
  entry(RecipeGroupsCollectionActor, RecipeGroupsCollectionActorDescriptor),
  entry(BrandsCollectionActor, BrandsCollectionActorDescriptor),
  entry(BrandLinksCollectionActor, BrandLinksCollectionActorDescriptor),
];
