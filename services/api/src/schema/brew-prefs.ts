/**
 * ux-c L08 — Steep (tea) and Brew (coffee) guides: the viewer's own numbers.
 *
 * The guide itself is a deterministic "typical" table the client draws
 * (ruling L3: no model-estimated number anywhere). What lives here is only
 * the user's override of it, one `item_brew_prefs` row per item, written and
 * read by `UserActor` — the viewer's own actor, never anybody else's. The
 * actor answers another user's prefs exactly like an item that does not
 * exist (L6); the api never even addresses one, because the key is always
 * `ctx.viewerId`.
 */
import type {
  BrewPrefsDto,
  ItemDto,
  ItemType,
  SetBrewPrefsInput,
} from "@cellar-assistant/contracts";
import {
  BREW_PREF_ITEM_TYPES,
  ForbiddenError,
  itemActorId,
  UserActorDescriptor,
} from "@cellar-assistant/contracts";
import type { ApiContext } from "../context.ts";
import { builder } from "./builder.ts";
import { ItemInterface, ItemTypeEnum } from "./item.ts";

const myActor = (context: ApiContext, what: string) => {
  const viewerId = context.ctx.viewerId;
  if (viewerId === null) throw new ForbiddenError(`sign in to ${what}`);
  return context.actor(UserActorDescriptor, viewerId);
};

const isBrewType = (type: string): boolean =>
  (BREW_PREF_ITEM_TYPES as readonly string[]).includes(type);

const BrewPrefsType = builder.objectRef<BrewPrefsDto>("BrewPrefs").implement({
  description:
    "Your own steep or brew numbers for one tea or coffee (ux-c L08). Each " +
    "overrides the guide's typical row; null keeps the typical number.",
  fields: (t) => ({
    waterTempC: t.exposeInt("waterTempC", {
      nullable: true,
      description: "Water temperature, °C (1–100).",
    }),
    steepSeconds: t.exposeInt("steepSeconds", {
      nullable: true,
      description: "First steep, or the whole brew, in seconds.",
    }),
    doseGrams: t.exposeFloat("doseGrams", {
      nullable: true,
      description: "Leaf or ground coffee, grams.",
    }),
    waterMl: t.exposeFloat("waterMl", {
      nullable: true,
      description: "Water, millilitres.",
    }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});

builder.interfaceField(ItemInterface, "myBrewPrefs", (t) =>
  t.field({
    type: BrewPrefsType,
    nullable: true,
    description:
      "ux-c L08: your steep (tea) or brew (coffee) overrides for this item, " +
      "or null — none saved, another item type, or signed out.",
    resolve: (item: ItemDto, _args, context) => {
      const viewerId = context.ctx.viewerId;
      if (viewerId === null || !isBrewType(item.type)) return null;
      return context
        .actor(UserActorDescriptor, viewerId)
        .brewPrefs({ type: item.type, id: item.id });
    },
  }),
);

type BrewPrefsResult = {
  readonly item: { readonly type: ItemType; readonly id: string };
  readonly prefs: BrewPrefsDto | null;
};

const SetBrewPrefsPayload = builder
  .objectRef<BrewPrefsResult>("SetBrewPrefsPayload")
  .implement({
    description:
      "What you have saved now. Select `item { myBrewPrefs { … } }` and a " +
      "normalised cache updates itself.",
    fields: (t) => ({
      prefs: t.field({
        type: BrewPrefsType,
        nullable: true,
        resolve: (result) => result.prefs,
      }),
      item: t.field({
        type: ItemInterface,
        resolve: (result) => itemActorId(result.item),
      }),
    }),
  });

builder.mutationField("setBrewPrefs", (t) =>
  t.field({
    type: SetBrewPrefsPayload,
    description:
      "ux-c L08: save your own steep or brew numbers for a tea or coffee — " +
      "all four at once, replacing what you had; all four null goes back to " +
      "typical. An item that does not exist answers NOT_FOUND.",
    errors: {},
    // Scalar arguments, not an input object: this replaces the whole row —
    // all four numbers are the caller's full answer, null meaning "typical"
    // — so there is no partial update whose nulls need a patch policy
    // (`patch-policy.test.ts` guards input objects for exactly that).
    args: {
      itemType: t.arg({ type: ItemTypeEnum, required: true }),
      itemId: t.arg.id({ required: true }),
      waterTempC: t.arg.int({
        required: false,
        description: "°C, 1–100. Null or absent: typical.",
      }),
      steepSeconds: t.arg.int({
        required: false,
        description: "Seconds, > 0. Null or absent: typical.",
      }),
      doseGrams: t.arg.float({
        required: false,
        description: "Grams, > 0. Null or absent: typical.",
      }),
      waterMl: t.arg.float({
        required: false,
        description: "Millilitres, > 0. Null or absent: typical.",
      }),
    },
    resolve: async (_root, args, context): Promise<BrewPrefsResult> => {
      const item = {
        type: args.itemType as ItemType,
        id: String(args.itemId),
      };
      const input: SetBrewPrefsInput = {
        item,
        waterTempC: args.waterTempC ?? null,
        steepSeconds: args.steepSeconds ?? null,
        doseGrams: args.doseGrams ?? null,
        waterMl: args.waterMl ?? null,
      };
      const prefs = await myActor(
        context,
        "save your brew numbers",
      ).setBrewPrefs(input);
      return { item, prefs };
    },
  }),
);
