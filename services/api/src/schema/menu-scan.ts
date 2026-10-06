/**
 * `MenuScan` — B8 (migration plan §2.1 `MenuScanActor`, §1.5, §8.3).
 *
 * Three root fields, and deliberately no more:
 *
 * | field | actor method | why |
 * |---|---|---|
 * | `menuScan(id)` | `get` | the owner's own scan |
 * | `createMenuScan` | `create` | records the upload and queues extraction |
 * | `actOnMenuScanSuggestion` | `actOnSuggestion` | `/discoveries`' accept / reject |
 *
 * **`process` and `match` are absent on purpose.** Both are `system` (§1.6:
 * "`ctx.kind === 'system'` … is not derivable from a request"), so a resolver
 * could not call them even if one existed — `makeActorClient` refuses to build
 * a client from a system ctx, and the actor refuses a user ctx. The pipeline is
 * driven end to end by the outbox rows `create` writes, which is what replaced
 * the `processing_status` event trigger.
 *
 * `MatchSuggestion` follows B7's `TierListItem` shape rather than a union: an
 * `Item` is a GraphQL *interface* and cannot be a union member, so the type
 * carries `targetKind` plus two nullable siblings (`suggestedItem: Item`,
 * `suggestedRecipe: Recipe`). The frontend is D5's; nothing here renders.
 */
import { randomUUID } from "node:crypto";
import type {
  ActOnSuggestionResult,
  MatchSuggestionDto,
  MenuScanDto,
} from "@cellar-assistant/contracts";
import {
  ForbiddenError,
  itemActorId,
  MatchSuggestionsCollectionActorDescriptor,
  MENU_SCAN_STATUSES,
  MenuScanActorDescriptor,
  MenuScansCollectionActorDescriptor,
  SUGGESTION_ACTIONS,
  viewerCollectionActorId,
} from "@cellar-assistant/contracts";
import type { ApiContext } from "../context.ts";
import { builder } from "./builder.ts";
import { failureSummary } from "./failure-summary.ts";
import { ItemInterface } from "./item.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";
import { RecipeType_ } from "./recipe.ts";
import { PlaceStubType } from "./tier-list.ts";

const MenuScanStatusEnum = builder.enumType("MenuScanStatus", {
  description:
    "`menu_scans.processing_status`, enforced by its check constraint. " +
    "`pending` → `processing` → `completed` | `failed`; the transitions are " +
    "made by `MenuScanActor.process`, never by a client.",
  values: MENU_SCAN_STATUSES,
});

const SuggestionTargetKindEnum = builder.enumType("MatchSuggestionTargetKind", {
  description:
    "Which of `item_match_suggestions`' seven `suggested_*_id` columns is " +
    "set. `RECIPE` is how a cocktail matches (`recipe_vectors`); every other " +
    "type matches an item (`item_vectors`).",
  values: ["ITEM", "RECIPE"] as const,
});

const SuggestionActionEnum = builder.enumType("MatchSuggestionAction", {
  description: "What the owner did with a suggestion.",
  values: SUGGESTION_ACTIONS,
});

export const MatchSuggestionType = builder
  .objectRef<MatchSuggestionDto>("MatchSuggestion")
  .implement({
    description:
      "One AI-proposed match between a scanned menu line and something in " +
      "the catalog. Pending until its scan's owner accepts or rejects it.",
    fields: (t) => ({
      id: t.exposeID("id"),
      menuScanId: t.exposeID("menuScanId", {
        nullable: true,
        description:
          "§2.2: carried on the projection so `/discoveries` can route the " +
          "mutation back to the right `MenuScanActor`.",
      }),
      placeMenuItemId: t.exposeID("placeMenuItemId"),
      menuItemName: t.exposeString("menuItemName", {
        description: "The menu's own wording, not the normalised search name.",
      }),
      targetKind: t.field({
        type: SuggestionTargetKindEnum,
        resolve: (suggestion) => suggestion.target.kind,
      }),
      suggestedItem: t.field({
        type: ItemInterface,
        nullable: true,
        description: "Set when `targetKind` is `ITEM`.",
        resolve: (suggestion) =>
          suggestion.target.kind === "ITEM"
            ? itemActorId(suggestion.target.item)
            : null,
      }),
      suggestedRecipe: t.field({
        type: RecipeType_,
        nullable: true,
        description: "Set when `targetKind` is `RECIPE` — a matched cocktail.",
        resolve: (suggestion) =>
          suggestion.target.kind === "RECIPE"
            ? suggestion.target.recipeId
            : null,
      }),
      confidenceScore: t.exposeFloat("confidenceScore", {
        description:
          "0–1. `1 - distance / 2` over the vector distance, or the " +
          "verifier's own confidence for a match in the 0.4–0.9 band.",
      }),
      matchReasoning: t.exposeString("matchReasoning", { nullable: true }),
      similarityMetrics: t.field({
        type: "JSON",
        nullable: true,
        resolve: (suggestion) => suggestion.similarityMetrics,
      }),
      accepted: t.exposeBoolean("accepted", { nullable: true }),
      rejected: t.exposeBoolean("rejected", { nullable: true }),
      actedBy: t.exposeID("actedBy", { nullable: true }),
      actedAt: t.expose("actedAt", { type: "DateTime", nullable: true }),
      createdAt: t.expose("createdAt", { type: "DateTime", nullable: true }),
    }),
  });

export const MatchSuggestionConnection = builder.connectionObject(
  { type: MatchSuggestionType, name: "MatchSuggestionConnection" },
  { name: "MatchSuggestionEdge" },
);

/**
 * One batch, N parallel `MenuScanActor.get` calls (§1.5).
 *
 * Worth noticing what this buys beyond a round trip: `MenuScanActor.get` runs
 * `#requireOwner` itself (§2.1, "scan owner only"), so the id page C3 produces
 * is re-authorized row by row inside the actor that owns each row. A
 * projection would have had only the collection's own `where` clause between a
 * bug and somebody else's scan.
 */
const loadMenuScans = async (
  keys: readonly string[],
  context: ApiContext,
): Promise<readonly (MenuScanDto | Error)[]> =>
  await Promise.all(
    keys.map(async (key): Promise<MenuScanDto | Error> => {
      try {
        return await context.actor(MenuScanActorDescriptor, key).get();
      } catch (cause) {
        return cause instanceof Error ? cause : new Error(String(cause));
      }
    }),
  );

export const MenuScanType = builder
  .loadableObjectRef<MenuScanDto, string>("MenuScan", {
    load: loadMenuScans,
    toKey: (scan) => scan.id,
  })
  .implement({
    description:
      "One photographed menu. Visible to the person who scanned it and " +
      "nobody else — not friends, not the public (§2.1).",
    fields: (t) => ({
      id: t.exposeID("id"),
      userId: t.exposeID("userId"),
      originalImageId: t.exposeID("originalImageId", {
        description: "A `files.id` (B8's transform 12 repointed this column).",
      }),
      processedImageId: t.exposeID("processedImageId", { nullable: true }),
      placeId: t.exposeID("placeId", { nullable: true }),
      estimatedPlaceId: t.exposeID("estimatedPlaceId", { nullable: true }),
      manualPlaceOverride: t.exposeID("manualPlaceOverride", {
        nullable: true,
      }),
      place: t.field({
        type: PlaceStubType,
        nullable: true,
        description:
          "`manualPlaceOverride ?? placeId ?? estimatedPlaceId` — the place " +
          "the menu is actually filed against. Derived, never stored.",
        resolve: (scan) =>
          scan.effectivePlaceId === null ? null : { id: scan.effectivePlaceId },
      }),
      extractedText: t.exposeString("extractedText", { nullable: true }),
      processingStatus: t.field({
        type: MenuScanStatusEnum,
        resolve: (scan) => scan.processingStatus,
      }),
      processingError: t.string({
        nullable: true,
        description:
          "Why extraction failed, as one sentence with a next action in it — " +
          "**not** the provider's own message. `menu_scans.processing_error` " +
          "holds the raw text (an endpoint, a status, a body) for operators; " +
          "`failure-summary.ts` says why that must not be what a client gets, " +
          "and `MenuScanActor.process` also emits it as " +
          "`menu_scan.extraction_failed`. Null while the scan is fine.",
        resolve: (scan) => failureSummary(scan.processingError),
      }),
      confidenceScore: t.exposeFloat("confidenceScore", { nullable: true }),
      processingModel: t.exposeString("processingModel", { nullable: true }),
      processingDurationMs: t.exposeInt("processingDurationMs", {
        nullable: true,
      }),
      itemsDetected: t.exposeInt("itemsDetected"),
      itemsMatched: t.exposeInt("itemsMatched", {
        description:
          "Menu lines with at least one suggestion. Recomputed from rows " +
          "each time the matcher reports, never incremented.",
      }),
      scannedAt: t.expose("scannedAt", { type: "DateTime", nullable: true }),
      processedAt: t.expose("processedAt", {
        type: "DateTime",
        nullable: true,
      }),
      createdAt: t.expose("createdAt", { type: "DateTime", nullable: true }),
      updatedAt: t.expose("updatedAt", { type: "DateTime", nullable: true }),

      suggestions: t.field({
        type: MatchSuggestionConnection,
        description:
          "Paged (§1.5) — a scanned menu can be hundreds of lines. Pending " +
          "suggestions first, then by confidence.",
        args: t.arg.connectionArgs(),
        resolve: async (scan, args, context) =>
          connectionFromPage(
            await context
              .actor(MenuScanActorDescriptor, scan.id)
              .suggestions(toPageArgs(args)),
          ),
      }),
    }),
  });

const ActOnSuggestionPayload = builder
  .objectRef<ActOnSuggestionResult>("MatchSuggestionActionPayload")
  .implement({
    fields: (t) => ({
      suggestion: t.field({
        type: MatchSuggestionType,
        resolve: (result) => result.suggestion,
      }),
      propagated: t.exposeBoolean("propagated", {
        description:
          "True when the acceptance was queued onto `PlaceActor` — " +
          "`verifyMenuItemMatch` for an item match of any type, or " +
          "`linkMenuItemRecipe` for a recipe. False for a rejection and for " +
          "a repeat.",
      }),
    }),
  });

const MenuScanPlaceHintInput = builder.inputType("MenuScanPlaceHintInput", {
  description:
    "Where the menu was photographed. All three are hints: the scan files " +
    "its menu against `placeId ?? estimatedPlaceId`, preferring a later " +
    "manual override.",
  fields: (t) => ({
    placeId: t.id({ required: false }),
    estimatedPlaceId: t.id({ required: false }),
    longitude: t.float({ required: false }),
    latitude: t.float({ required: false }),
  }),
});

const CreateMenuScanInputType = builder.inputType("CreateMenuScanInput", {
  fields: (t) => ({
    originalImageId: t.id({
      required: true,
      description:
        "A `files.id` whose object `FileActor.verify` confirms. An unverified " +
        "file — a `createUploadTarget` whose PUT never happened — is refused " +
        "with `ConflictError`, and the check is the server's, not the " +
        "client's. You do not have to call `verifyUpload` first: creating the " +
        "scan verifies on the way through.",
    }),
    processedImageId: t.id({
      required: false,
      description: "Verified on the same terms as `originalImageId`.",
    }),
    placeHint: t.field({ type: MenuScanPlaceHintInput, required: false }),
  }),
});

const ActOnSuggestionInputType = builder.inputType(
  "MatchSuggestionActionInput",
  {
    fields: (t) => ({
      suggestionId: t.id({ required: true }),
      action: t.field({ type: SuggestionActionEnum, required: true }),
    }),
  },
);

builder.queryField("menuScan", (t) =>
  t.field({
    type: MenuScanType,
    description:
      "Yours alone. `NotFoundError` covers both 'no such scan' and 'not " +
      "yours' (§1.6), so a scan id is not an oracle.",
    errors: {},
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      context.actor(MenuScanActorDescriptor, String(args.id)).get(),
  }),
);

const MenuScanConnection = builder.connectionObject(
  { type: MenuScanType, name: "MenuScanConnection" },
  { name: "MenuScanEdge" },
);

builder.queryField("myMenuScans", (t) =>
  t.field({
    type: MenuScanConnection,
    description:
      "`/map/scans` — the viewer's own scans, most recently scanned first " +
      "(C3's `MenuScansCollectionActor`, §2.2). Ids from the collection, " +
      "hydrated by the `MenuScan` DataLoader (§1.5).",
    args: t.arg.connectionArgs(),
    errors: {},
    resolve: async (_root, args, context) => {
      const viewerId = context.ctx.viewerId;
      if (viewerId === null) throw new ForbiddenError("sign in to see scans");
      return connectionFromPage(
        await context
          .actor(
            MenuScansCollectionActorDescriptor,
            viewerCollectionActorId(viewerId),
          )
          .list(toPageArgs(args)),
      );
    },
  }),
);

builder.queryField("myDiscoveries", (t) =>
  t.field({
    type: MatchSuggestionConnection,
    description:
      "`/discoveries` — pending match suggestions from the viewer's **own** " +
      "menu scans, most confident first (C3's " +
      "`MatchSuggestionsCollectionActor`). §2.2 originally scoped this to " +
      '"places the viewer has interacted with", i.e. other people\'s scans; ' +
      "that is withdrawn, because scans are owner-only (§2.1) and a " +
      "suggestion discloses who scanned which menu where.",
    args: t.arg.connectionArgs(),
    errors: {},
    resolve: async (_root, args, context) => {
      const viewerId = context.ctx.viewerId;
      if (viewerId === null) {
        throw new ForbiddenError("sign in to see discoveries");
      }
      return connectionFromPage(
        await context
          .actor(
            MatchSuggestionsCollectionActorDescriptor,
            viewerCollectionActorId(viewerId),
          )
          .list(toPageArgs(args)),
      );
    },
  }),
);

builder.mutationField("createMenuScan", (t) =>
  t.field({
    type: MenuScanType,
    description:
      "Records the upload and queues its extraction in the same transaction " +
      "(§1.4). Returns immediately with `processingStatus: pending`; the " +
      "extraction, the menu filing and the match run are three outbox rows. " +
      "Idempotent on `menuScanId`: pass your own to make a retry free.",
    errors: {},
    args: {
      menuScanId: t.arg.id({ required: false }),
      input: t.arg({ type: CreateMenuScanInputType, required: true }),
    },
    resolve: (_root, args, context) => {
      const hint = args.input.placeHint;
      const location =
        hint?.longitude == null || hint?.latitude == null
          ? null
          : { lng: hint.longitude, lat: hint.latitude };
      return context
        .actor(
          MenuScanActorDescriptor,
          args.menuScanId == null ? randomUUID() : String(args.menuScanId),
        )
        .create({
          originalImageId: String(args.input.originalImageId),
          processedImageId:
            args.input.processedImageId == null
              ? null
              : String(args.input.processedImageId),
          placeHint:
            hint == null
              ? null
              : {
                  placeId: hint.placeId == null ? null : String(hint.placeId),
                  estimatedPlaceId:
                    hint.estimatedPlaceId == null
                      ? null
                      : String(hint.estimatedPlaceId),
                  location,
                },
        });
    },
  }),
);

builder.mutationField("actOnMenuScanSuggestion", (t) =>
  t.field({
    type: ActOnSuggestionPayload,
    description:
      "Accept or reject one AI match. Scan owner only. Accepting an item " +
      "also queues `PlaceActor.verifyMenuItemMatch`, and accepting a recipe " +
      "`PlaceActor.linkMenuItemRecipe`, so the place's menu learns what the " +
      "line is (§1.7).",
    errors: {},
    args: {
      menuScanId: t.arg.id({
        required: true,
        description:
          "§2.1: `/discoveries` acts by suggestion id, so the projection " +
          "carries `menuScanId` for the resolver to route with.",
      }),
      input: t.arg({ type: ActOnSuggestionInputType, required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(MenuScanActorDescriptor, String(args.menuScanId))
        .actOnSuggestion({
          suggestionId: String(args.input.suggestionId),
          action: args.input.action,
        }),
  }),
);
