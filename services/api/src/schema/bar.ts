/**
 * X14 — recipes meet the cellar, on the wire (decisions D9, D18/G29, D23).
 *
 * | field | from |
 * |---|---|
 * | `RecipeIngredient.availability` | `BarActor.inventory`, once per request, judged by `ingredientAvailability` |
 * | `Recipe.makeability` | the same inventory and `recipeMakeability` |
 * | `Recipe.isLoved`, `setRecipeLove`, `lovedRecipes` | `UserActor` (D9: Love replaces the heart) |
 * | `barPantry`, `setBarPantryItem` | `UserActor` (D23) |
 * | `whatCanIMake` | `BarActor.whatCanIMake` (G29) |
 * | `Item.cocktails` | `BarActor.cocktailsFor` ("Cocktails with this" / "Use it up") |
 *
 * Every field here is the **viewer's** — their bottles, their pantry, their
 * loves. Nothing takes a user id: the actor is addressed by `ctx.viewerId`,
 * and an anonymous request gets the empty answer (or a sign-in refusal for a
 * write), never someone else's bar. The judging itself is the pure code in
 * `@cellar-assistant/contracts` (`bar.ts`), the same the browser could run.
 *
 * One inventory read per request, not per ingredient: a recipe page asks for
 * a dozen availabilities and a recipe list for a hundred, and each would
 * otherwise be a sidecar hop to the same actor, run in series (Dapr gives an
 * actor id one turn at a time). The memo is keyed by the request's own
 * `ApiContext` object in a `WeakMap`, so it lives exactly as long as the
 * request.
 */
import type {
  BarInventory,
  BarKind,
  BarPantryItemDto,
  BarRecipeMatch,
  IngredientAvailability,
  ItemCocktailsDto,
  ItemDto,
  RecipeDto,
  RecipeIngredientDto,
  RecipeMakeability,
  SetRecipeLoveResult,
  WhatCanIMakeDto,
} from "@cellar-assistant/contracts";
import {
  AVAILABILITY_SOURCES,
  AVAILABILITY_STATUSES,
  BAR_KINDS,
  BarActorDescriptor,
  barActorId,
  barKindLabel,
  EMPTY_BAR_INVENTORY,
  ForbiddenError,
  genericItemActorId,
  ItemActorDescriptor,
  ingredientAvailability,
  ingredientItemType,
  itemActorId,
  MAKEABILITY_STATUSES,
  MAX_PAGE_SIZE,
  offsetPage,
  PANTRY_KINDS,
  RecipeActorDescriptor,
  recipeMakeability,
  UserActorDescriptor,
} from "@cellar-assistant/contracts";
import type { ApiContext } from "../context.ts";
import { builder } from "./builder.ts";
import { ItemInterface } from "./item.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";

/** A judged list as a connection (§1.5: every composite list pages). */
const matchConnection = (
  matches: readonly BarRecipeMatch[],
  args: { first?: number | null; after?: string | null },
) => connectionFromPage(offsetPage(matches, toPageArgs(args)));

import {
  IngredientKindEnum,
  RecipeConnection,
  RecipeIngredientType_,
  RecipeType_,
} from "./recipe.ts";

/* -------------------------------------------------------------------------- */
/* The request's inventory                                                     */
/* -------------------------------------------------------------------------- */

const inventories = new WeakMap<ApiContext, Promise<BarInventory>>();

/** The viewer's bar, read once per request; empty for an anonymous one. */
export const viewerInventory = (context: ApiContext): Promise<BarInventory> => {
  const viewerId = context.ctx.viewerId;
  if (viewerId === null) return Promise.resolve(EMPTY_BAR_INVENTORY);
  let pending = inventories.get(context);
  if (pending === undefined) {
    pending = context
      .actor(BarActorDescriptor, barActorId(viewerId))
      .inventory();
    inventories.set(context, pending);
  }
  return pending;
};

const requireViewer = (context: ApiContext, what: string): string => {
  const viewerId = context.ctx.viewerId;
  if (viewerId === null) throw new ForbiddenError(`sign in to ${what}`);
  return viewerId;
};

/* -------------------------------------------------------------------------- */
/* Enums                                                                       */
/* -------------------------------------------------------------------------- */

const AvailabilityStatusEnum = builder.enumType("AvailabilityStatus", {
  description:
    "HAVE: a bottle in your cellars, a Bar pantry toggle, or a staple. " +
    "SUBSTITUTE: something in the same family (rye for bourbon). MISSING: " +
    "neither. UNKNOWN: the ingredient could not be placed in the bar " +
    "vocabulary, so nothing honest can be said (shown as Not tracked).",
  values: AVAILABILITY_STATUSES,
});

const AvailabilitySourceEnum = builder.enumType("AvailabilitySource", {
  values: AVAILABILITY_SOURCES,
});

const MakeabilityStatusEnum = builder.enumType("MakeabilityStatus", {
  description:
    "MAKE_NOW: nothing required is missing (substitutes allowed). ONE_AWAY: " +
    "exactly one required ingredient is (G29's One bottle away). MISSING: " +
    "two or more. Optional ingredients and garnishes are never required.",
  values: MAKEABILITY_STATUSES,
});

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

const IngredientAvailabilityType = builder
  .objectRef<IngredientAvailability>("IngredientAvailability")
  .implement({
    description:
      "Whether the viewer can cover one ingredient, and with what. Computed " +
      "from their own bottles and Bar pantry — never a guess.",
    fields: (t) => ({
      status: t.field({
        type: AvailabilityStatusEnum,
        resolve: (answer) => answer.status,
      }),
      source: t.field({
        type: AvailabilitySourceEnum,
        nullable: true,
        resolve: (answer) => answer.source,
      }),
      via: t.field({
        type: IngredientKindEnum,
        nullable: true,
        description:
          "The kind that answered — the ingredient's own, or the stand-in's.",
        resolve: (answer) => answer.via,
      }),
      label: t.string({
        nullable: true,
        description:
          "What to say: the bottle's name, or the pantry kind's label.",
        resolve: (answer) =>
          answer.bottle?.name ??
          (answer.source === "PANTRY" ? barKindLabel(answer.via) : null),
      }),
      cellarId: t.id({
        nullable: true,
        resolve: (answer) => answer.bottle?.cellarId ?? null,
      }),
      cellarItemId: t.id({
        nullable: true,
        description: "The bottle, when `source` is BOTTLE.",
        resolve: (answer) => answer.bottle?.cellarItemId ?? null,
      }),
      opened: t.boolean({
        nullable: true,
        resolve: (answer) => answer.bottle?.opened ?? null,
      }),
    }),
  });

const RecipeMakeabilityType = builder
  .objectRef<RecipeMakeability>("RecipeMakeability")
  .implement({
    description: "One recipe against the viewer's bar (G29).",
    fields: (t) => ({
      status: t.field({
        type: MakeabilityStatusEnum,
        resolve: (result) => result.status,
      }),
      missing: t.stringList({
        description: "What is missing, by name — what to buy.",
        resolve: (result) => [...result.missing],
      }),
      missingKinds: t.field({
        type: [IngredientKindEnum],
        description:
          "The kinds behind `missing`, where the bar vocabulary places them " +
          "(an unplaced ingredient has none, so this can be shorter). Two " +
          'recipes that print "Campari" and "red bitter aperitivo" miss the ' +
          "same kind — what to count when asking which bottle unlocks most.",
        resolve: (result) => [...result.missingKinds],
      }),
      substituteCount: t.exposeInt("substituteCount"),
      requiredCount: t.exposeInt("requiredCount"),
      haveCount: t.exposeInt("haveCount", {
        description: "Required ingredients covered, substitutes included.",
      }),
    }),
  });

const BarRecipeMatchType = builder
  .objectRef<BarRecipeMatch>("BarRecipeMatch")
  .implement({
    description:
      "A recipe judged against the viewer's bar — one per recipe group (the " +
      "version closest to makeable).",
    fields: (t) => ({
      recipeId: t.exposeID("recipeId"),
      recipeGroupId: t.exposeID("recipeGroupId", { nullable: true }),
      name: t.exposeString("name"),
      recipe: t.field({
        type: RecipeType_,
        resolve: (match) => match.recipeId,
      }),
      makeability: t.field({
        type: RecipeMakeabilityType,
        resolve: (match) => match.makeability,
      }),
    }),
  });

const BarRecipeMatchConnection = builder.connectionObject(
  { type: BarRecipeMatchType, name: "BarRecipeMatchConnection" },
  { name: "BarRecipeMatchEdge" },
);

const WhatCanIMakeType = builder
  .objectRef<WhatCanIMakeDto>("WhatCanIMake")
  .implement({
    description:
      "G29 / D18: cocktails the viewer can make now, and the ones one bottle " +
      "away, from their own cellars plus the Bar pantry.",
    fields: (t) => ({
      makeNow: t.field({
        type: BarRecipeMatchConnection,
        args: t.arg.connectionArgs(),
        resolve: (result, args) => matchConnection(result.makeNow, args),
      }),
      oneBottleAway: t.field({
        type: BarRecipeMatchConnection,
        args: t.arg.connectionArgs(),
        resolve: (result, args) => matchConnection(result.oneAway, args),
      }),
      makeNowCount: t.exposeInt("makeNowCount"),
      oneBottleAwayCount: t.int({ resolve: (result) => result.oneAwayCount }),
      bottleCount: t.exposeInt("bottleCount"),
      pantryCount: t.exposeInt("pantryCount"),
      scanned: t.exposeInt("scanned", {
        description: "Cocktail recipes looked at (the newest, up to a cap).",
      }),
    }),
  });

const ItemCocktailsType = builder
  .objectRef<ItemCocktailsDto>("ItemCocktails")
  .implement({
    description:
      '"Cocktails with this" for an item page — or "Use it up" when the ' +
      "viewer has an open bottle of it.",
    fields: (t) => ({
      kind: t.field({
        type: IngredientKindEnum,
        nullable: true,
        resolve: (result) => result.kind,
      }),
      kindLabel: t.string({
        nullable: true,
        resolve: (result) => barKindLabel(result.kind),
      }),
      useItUp: t.exposeBoolean("useItUp"),
      total: t.exposeInt("total"),
      recipes: t.field({
        type: BarRecipeMatchConnection,
        args: t.arg.connectionArgs(),
        resolve: (result, args) => matchConnection(result.recipes, args),
      }),
    }),
  });

const BarPantryEntryType = builder
  .objectRef<BarPantryItemDto>("BarPantryEntry")
  .implement({
    description: "One Bar pantry toggle (D23).",
    fields: (t) => ({
      kind: t.field({ type: IngredientKindEnum, resolve: (e) => e.kind }),
      label: t.string({ resolve: (e) => BAR_KINDS[e.kind].label }),
      have: t.exposeBoolean("have"),
    }),
  });

type BarPantry = { readonly have: readonly BarKind[] };

const BarPantryType = builder.objectRef<BarPantry>("BarPantry").implement({
  description:
    "D23: the viewer's Bar pantry. The toggles themselves — their order, " +
    "labels and sections — are `PANTRY_KINDS` / `PANTRY_SECTIONS` in " +
    "`@cellar-assistant/contracts`, so this carries only which are on.",
  fields: (t) => ({
    have: t.field({
      type: [IngredientKindEnum],
      description: "The toggles that are on, in pantry order.",
      resolve: (pantry) => [...pantry.have],
    }),
    kinds: t.field({
      type: [IngredientKindEnum],
      description: "Every toggle, in pantry order.",
      resolve: () => [...PANTRY_KINDS],
    }),
  }),
});
const SetRecipeLovePayload = builder
  .objectRef<SetRecipeLoveResult>("SetRecipeLovePayload")
  .implement({
    description: "The state of one Love after `setRecipeLove`.",
    fields: (t) => ({
      recipeId: t.exposeID("recipeId"),
      loved: t.exposeBoolean("loved"),
      changed: t.exposeBoolean("changed", {
        description:
          "False when the Love already was what was asked — a repeat or a retry.",
      }),
      recipe: t.field({ type: RecipeType_, resolve: (r) => r.recipeId }),
    }),
  });

/* -------------------------------------------------------------------------- */
/* Fields on existing types                                                    */
/* -------------------------------------------------------------------------- */

builder.objectField(RecipeIngredientType_, "availability", (t) =>
  t.field({
    type: IngredientAvailabilityType,
    nullable: true,
    description:
      "D9: whether the viewer has this, from their own bottles and Bar " +
      "pantry. Null for an anonymous viewer. One inventory read per request.",
    resolve: async (row: RecipeIngredientDto, _args, context) => {
      if (context.ctx.viewerId === null) return null;
      const type = ingredientItemType(row.ref);
      return ingredientAvailability(
        {
          kind: row.kind,
          item: type === null ? null : { type, id: row.ref.id },
        },
        await viewerInventory(context),
      );
    },
  }),
);

builder.objectFields(RecipeType_, (t) => ({
  makeability: t.field({
    type: RecipeMakeabilityType,
    nullable: true,
    description:
      "G29: can the viewer make this now, or is it one bottle away? Null for " +
      "an anonymous viewer, for a food recipe — the bar vocabulary is " +
      "drinks, so a dish would only ever read as missing everything — and " +
      "for a cocktail with no required ingredient, where there is nothing " +
      "to judge.",
    resolve: async (recipe: RecipeDto, _args, context) => {
      if (context.ctx.viewerId === null) return null;
      if (recipe.type !== "cocktail") return null;
      const [page, inventory] = await Promise.all([
        context
          .actor(RecipeActorDescriptor, recipe.id)
          .ingredients({ first: MAX_PAGE_SIZE, after: null }),
        viewerInventory(context),
      ]);
      const lines = page.entries.map(({ node: row }) => {
        const type = ingredientItemType(row.ref);
        return {
          row,
          kind: row.kind,
          role: row.role,
          isOptional: row.isOptional,
          item: type === null ? null : { type, id: row.ref.id },
        };
      });
      // Judge first, without names: a verdict with nothing missing, or with
      // nothing required, needs none.
      const unnamed = recipeMakeability(
        lines.map((line) => ({ ...line, name: null })),
        inventory,
      );
      if (unnamed.requiredCount === 0 || unnamed.missing.length === 0) {
        return unnamed.requiredCount === 0 ? null : unnamed;
      }
      // Then name what is missing by what the recipe calls it ("Lime juice",
      // "Crème de violette") — the same words What can I make uses, which
      // reads them from the same rows — rather than by its vocabulary label
      // ("Limes") or "An ingredient". Only the missing required lines are
      // read, so this is a read or two, not one per ingredient.
      const names = await Promise.all(
        lines.map(async (line) => {
          if (line.isOptional || line.role === "garnish") return null;
          const status = ingredientAvailability(line, inventory).status;
          if (status === "HAVE" || status === "SUBSTITUTE") return null;
          try {
            if (line.row.ref.type === "GENERIC") {
              const generic = await context
                .actor(ItemActorDescriptor, genericItemActorId(line.row.ref.id))
                .getGeneric();
              return generic.name;
            }
            if (line.item !== null) {
              const item = await context
                .actor(ItemActorDescriptor, itemActorId(line.item))
                .get();
              return item.name;
            }
          } catch {
            // Unreadable (gone, or hidden): fall back to the kind's label.
          }
          return null;
        }),
      );
      const result = recipeMakeability(
        lines.map((line, index) => ({ ...line, name: names[index] ?? null })),
        inventory,
      );
      // Nothing required (no ingredients yet, or only garnishes and
      // optional lines) is not "You can make this": there is nothing to
      // vouch for, so there is no verdict.
      return result.requiredCount === 0 ? null : result;
    },
  }),
  isLoved: t.loadable({
    type: "Boolean",
    description:
      "D9: Love replaces the old heart. `false` for an anonymous viewer. One " +
      "batched `UserActor` call per request.",
    resolve: (recipe: RecipeDto) => recipe.id,
    load: async (keys: string[], context: ApiContext) => {
      const viewerId = context.ctx.viewerId;
      if (viewerId === null) return keys.map(() => false);
      const loved = new Set(
        await context
          .actor(UserActorDescriptor, viewerId)
          .recipeLoveStates(keys),
      );
      return keys.map((key) => loved.has(key));
    },
  }),
}));

builder.interfaceField(ItemInterface, "cocktails", (t) =>
  t.field({
    type: ItemCocktailsType,
    nullable: true,
    description:
      'X14: "Cocktails with this" — recipes that use this item or any bottle ' +
      "of its kind, each judged against the viewer's bar; `useItUp` when they " +
      "have an open bottle of it. Null for an anonymous viewer.",
    resolve: (item: ItemDto, _args, context) => {
      const viewerId = context.ctx.viewerId;
      if (viewerId === null) return null;
      return context
        .actor(BarActorDescriptor, barActorId(viewerId))
        .cocktailsFor({ type: item.type, id: item.id });
    },
  }),
);

/* -------------------------------------------------------------------------- */
/* Queries                                                                     */
/* -------------------------------------------------------------------------- */

builder.queryField("whatCanIMake", (t) =>
  t.field({
    type: WhatCanIMakeType,
    description:
      "G29: Make now · One bottle away, from the viewer's own cellars and Bar " +
      "pantry. Signed-in only; there is no argument naming whose bar.",
    errors: {},
    args: {
      limit: t.arg.int({
        required: false,
        description: "Rows per section (1–200, default 50).",
      }),
    },
    resolve: (_root, args, context) => {
      const viewerId = requireViewer(context, "see what you can make");
      return context
        .actor(BarActorDescriptor, barActorId(viewerId))
        .whatCanIMake({ limit: args.limit ?? null });
    },
  }),
);

builder.queryField("barPantry", (t) =>
  t.field({
    type: BarPantryType,
    description:
      "D23: the viewer's Bar pantry toggles. Cellar bottles are not here — " +
      "they count automatically.",
    errors: {},
    resolve: async (_root, _args, context) => {
      const viewerId = requireViewer(context, "see your Bar pantry");
      return {
        have: await context.actor(UserActorDescriptor, viewerId).barPantry(),
      };
    },
  }),
);

builder.queryField("lovedRecipes", (t) =>
  t.field({
    type: RecipeConnection,
    description: "D9: the viewer's loved recipes, newest Love first.",
    errors: {},
    args: t.arg.connectionArgs(),
    resolve: async (_root, args, context) => {
      const viewerId = requireViewer(context, "see your loved recipes");
      return connectionFromPage(
        await context
          .actor(UserActorDescriptor, viewerId)
          .lovedRecipes(toPageArgs(args)),
      );
    },
  }),
);

builder.queryField("myRecipes", (t) =>
  t.field({
    type: RecipeConnection,
    description:
      "X15: the recipes the viewer wrote, newest change first. `drafts: " +
      "true` for AI drafts waiting on review, `false` for published ones, " +
      "omitted for both. At most 200.",
    errors: {},
    args: {
      ...t.arg.connectionArgs(),
      drafts: t.arg.boolean({ required: false }),
    },
    resolve: async (_root, args, context) => {
      const viewerId = requireViewer(context, "see your recipes");
      return connectionFromPage(
        await context
          .actor(UserActorDescriptor, viewerId)
          .myRecipes(toPageArgs(args), args.drafts ?? null),
      );
    },
  }),
);

/* -------------------------------------------------------------------------- */
/* Mutations                                                                   */
/* -------------------------------------------------------------------------- */

builder.mutationField("setBarPantryItem", (t) =>
  t.field({
    type: BarPantryEntryType,
    description:
      "D23: turn one Bar pantry toggle on or off. Only the pantry kinds; a " +
      "spirit is a cellar bottle, not a toggle.",
    errors: {},
    args: {
      kind: t.arg({ type: IngredientKindEnum, required: true }),
      have: t.arg.boolean({ required: true }),
    },
    resolve: async (_root, args, context) => {
      const viewerId = requireViewer(context, "change your Bar pantry");
      return context
        .actor(UserActorDescriptor, viewerId)
        .setBarPantryItem({ kind: args.kind, have: args.have });
    },
  }),
);

builder.mutationField("setRecipeLove", (t) =>
  t.field({
    type: SetRecipeLovePayload,
    description:
      "D9: Love a recipe (`loved: true`), or take the Love back. Idempotent: " +
      "asking for the current state changes nothing, so a retried request " +
      "cannot flip it back (it replaced the flipping `toggleRecipeLove`).",
    errors: {},
    args: {
      recipeId: t.arg.id({ required: true }),
      loved: t.arg.boolean({ required: true }),
    },
    resolve: (_root, args, context) => {
      const viewerId = requireViewer(context, "love a recipe");
      return context
        .actor(UserActorDescriptor, viewerId)
        .setRecipeLove(String(args.recipeId), args.loved);
    },
  }),
);
