/**
 * X08 — "Want to try", the Save verb of D27, across items, recipes and places.
 *
 * Every field here is one `UserActor` call on the viewer's own actor: the
 * list (`Viewer.wantToTry`), the per-card state (`Item.isWantToTry`,
 * `Recipe.isWantToTry`, batched per request like `isFavorite`), and the one
 * mutation (`setWantToTry`). A place's state is `PlaceInteraction.wantToVisit`
 * (D11 revives that column), so `setWantToTry` on a place and
 * `recordPlaceInteraction(wantToVisit:)` write the same row.
 *
 * `set`, not `toggle`: the client says which state it wants, so an Undo, a
 * double tap or a retried request can never flip it the wrong way.
 */
import type {
  SetWantToTryResult,
  WantToTryEntryDto,
  WantToTryTarget,
} from "@cellar-assistant/contracts";
import {
  ForbiddenError,
  itemActorId,
  parseWantToTryKey,
  UserActorDescriptor,
  ValidationError,
  WANT_TO_TRY_KINDS,
  wantToTryKey,
} from "@cellar-assistant/contracts";
import DataLoader from "dataloader";
import type { ApiContext } from "../context.ts";
import { builder } from "./builder.ts";
import { ItemInterface, ItemTypeEnum } from "./item.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";
import { RecipeType_ } from "./recipe.ts";
import { PlaceStubType } from "./tier-list.ts";
import { Viewer } from "./viewer.ts";

const myActor = (context: ApiContext, what: string) => {
  const viewerId = context.ctx.viewerId;
  if (viewerId === null) throw new ForbiddenError(`sign in to ${what}`);
  return context.actor(UserActorDescriptor, viewerId);
};

export const WantToTryKindEnum = builder.enumType("WantToTryKind", {
  description:
    "What a Want to try names. ITEM and RECIPE are `want_to_try` rows; PLACE " +
    "is `PlaceInteraction.wantToVisit`.",
  values: WANT_TO_TRY_KINDS,
});

const WantToTryEntryType = builder
  .objectRef<WantToTryEntryDto>("WantToTryEntry")
  .implement({
    description:
      "One thing on the viewer's Want to try list. Exactly one of `item`, " +
      "`recipe` and `place` is set, as `kind` says.",
    fields: (t) => ({
      kind: t.field({
        type: WantToTryKindEnum,
        resolve: (entry) => entry.target.kind,
      }),
      key: t.string({
        description:
          "A stable id for the entry: `wine:<uuid>`, `recipe:<uuid>`, " +
          "`place:<uuid>`.",
        resolve: (entry) => wantToTryKey(entry.target),
      }),
      savedAt: t.field({
        type: "DateTime",
        description:
          "When it was saved. For a place, when its interaction row last " +
          "changed — the column carries no time of its own.",
        resolve: (entry) => entry.savedAt,
      }),
      item: t.field({
        type: ItemInterface,
        nullable: true,
        description: "Through the item DataLoader (§1.5).",
        resolve: (entry) =>
          entry.target.kind === "ITEM" ? itemActorId(entry.target.item) : null,
      }),
      recipe: t.field({
        type: RecipeType_,
        nullable: true,
        resolve: (entry) =>
          entry.target.kind === "RECIPE" ? entry.target.recipeId : null,
      }),
      place: t.field({
        type: PlaceStubType,
        nullable: true,
        resolve: (entry) =>
          entry.target.kind === "PLACE" ? { id: entry.target.placeId } : null,
      }),
    }),
  });

const WantToTryConnection = builder.connectionObject(
  { type: WantToTryEntryType, name: "WantToTryConnection" },
  { name: "WantToTryEdge" },
);

builder.objectField(Viewer, "wantToTry", (t) =>
  t.field({
    type: WantToTryConnection,
    description:
      "The viewer's Want to try list (X08): items, recipes and places, " +
      "newest first. Owner-only, like Loved.",
    args: {
      ...t.arg.connectionArgs(),
      kinds: t.arg({
        type: [WantToTryKindEnum],
        required: false,
        description:
          "Only these kinds; omitted or empty means all three. Filters " +
          "before paging, so `totalCount` follows it.",
      }),
    },
    resolve: async (viewer, args, context) =>
      connectionFromPage(
        await context
          .actor(UserActorDescriptor, viewer.id)
          // `?? null`: an omitted arg is `undefined`, which does not survive
          // `JSON.stringify` on the way to the sidecar.
          .wantToTry(toPageArgs(args), args.kinds ?? null),
      ),
  }),
);

/**
 * One batched `UserActor.wantToTryStates` per request, whatever mix of items
 * and recipes asked — keyed by `wantToTryKey`, so one loader holds both.
 *
 * A plain request-scoped DataLoader rather than `t.loadable`: each
 * `t.loadable` field gets a loader of its own, so a list mixing items and
 * recipes would cost two calls where one does.
 */
const statesByRequest = new WeakMap<ApiContext, DataLoader<string, boolean>>();

const wantToTryState = (context: ApiContext, key: string): Promise<boolean> => {
  let loader = statesByRequest.get(context);
  if (loader === undefined) {
    loader = new DataLoader<string, boolean>(async (keys) => {
      const viewerId = context.ctx.viewerId;
      if (viewerId === null) return keys.map(() => false);
      const targets = keys
        .map(parseWantToTryKey)
        .filter((target): target is WantToTryTarget => target !== null);
      const saved = new Set(
        await context
          .actor(UserActorDescriptor, viewerId)
          .wantToTryStates(targets),
      );
      return keys.map((one) => saved.has(one));
    });
    statesByRequest.set(context, loader);
  }
  return loader.load(key);
};

builder.interfaceField(ItemInterface, "isWantToTry", (t) =>
  t.boolean({
    description:
      "Whether this is on the viewer's Want to try list (X08). `false` for " +
      "an anonymous viewer. One batched `UserActor` call per request.",
    resolve: (item, _args, context) =>
      wantToTryState(context, itemActorId(item)),
  }),
);

builder.objectField(RecipeType_, "isWantToTry", (t) =>
  t.boolean({
    description:
      "Whether this recipe is on the viewer's Want to try list (X08). One " +
      "batched `UserActor` call per request, shared with `Item.isWantToTry`.",
    resolve: (recipe, _args, context) =>
      wantToTryState(context, `recipe:${recipe.id}`),
  }),
);

/* -------------------------------------------------------------------------- */
/* The mutation                                                                */
/* -------------------------------------------------------------------------- */

const WantToTryTargetInput = builder.inputType("WantToTryTargetInput", {
  description:
    "Exactly one target: `itemType` + `itemId`, or `recipeId`, or `placeId`. " +
    "Anything else is a VALIDATION error.",
  fields: (t) => ({
    itemType: t.field({ type: ItemTypeEnum, required: false }),
    itemId: t.id({ required: false }),
    recipeId: t.id({ required: false }),
    placeId: t.id({ required: false }),
  }),
});

type TargetInput = typeof WantToTryTargetInput.$inferInput;

/** The input's one target, or a `ValidationError` naming what is wrong. */
export const targetFromInput = (input: TargetInput): WantToTryTarget => {
  const has = (value: unknown): boolean =>
    value !== null && value !== undefined;
  const itemHalf = has(input.itemType) || has(input.itemId);
  const named = [itemHalf, has(input.recipeId), has(input.placeId)].filter(
    Boolean,
  ).length;
  if (named !== 1) {
    throw new ValidationError(
      "name exactly one target: itemType + itemId, recipeId or placeId",
    );
  }
  if (itemHalf) {
    if (!has(input.itemType) || !has(input.itemId)) {
      throw new ValidationError("an item needs both itemType and itemId");
    }
    return {
      kind: "ITEM",
      item: { type: input.itemType ?? "WINE", id: String(input.itemId) },
    };
  }
  if (has(input.recipeId)) {
    return { kind: "RECIPE", recipeId: String(input.recipeId) };
  }
  return { kind: "PLACE", placeId: String(input.placeId) };
};

const SetWantToTryPayload = builder
  .objectRef<SetWantToTryResult>("SetWantToTryPayload")
  .implement({
    description:
      "The state after the call. Select the target's own field " +
      "(`item { isWantToTry }`, `recipe { isWantToTry }`, `place { " +
      "myInteraction { wantToVisit } }`) and a normalised cache updates itself.",
    fields: (t) => ({
      wantToTry: t.exposeBoolean("wantToTry"),
      changed: t.exposeBoolean("changed", {
        description: "False when it already was in that state.",
      }),
      kind: t.field({
        type: WantToTryKindEnum,
        resolve: (result) => result.target.kind,
      }),
      key: t.string({ resolve: (result) => wantToTryKey(result.target) }),
      item: t.field({
        type: ItemInterface,
        nullable: true,
        resolve: (result) =>
          result.target.kind === "ITEM"
            ? itemActorId(result.target.item)
            : null,
      }),
      recipe: t.field({
        type: RecipeType_,
        nullable: true,
        resolve: (result) =>
          result.target.kind === "RECIPE" ? result.target.recipeId : null,
      }),
      place: t.field({
        type: PlaceStubType,
        nullable: true,
        resolve: (result) =>
          result.target.kind === "PLACE" ? { id: result.target.placeId } : null,
      }),
    }),
  });

builder.mutationField("setWantToTry", (t) =>
  t.field({
    type: SetWantToTryPayload,
    description:
      "Put an item, recipe or place on the viewer's Want to try list, or take " +
      "it off. Idempotent: asking for the current state changes nothing.",
    args: {
      target: t.arg({ type: WantToTryTargetInput, required: true }),
      wantToTry: t.arg.boolean({ required: true }),
    },
    errors: {},
    resolve: (_root, args, context) =>
      myActor(context, "change your Want to try list").setWantToTry(
        targetFromInput(args.target),
        args.wantToTry,
      ),
  }),
);
