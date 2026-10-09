/**
 * X19 — the catalog correction loop's surface: what an item's creator can do
 * to put a wrong catalogue entry right.
 *
 * - `Item.correction` says which of the AI helpers this item supports, for its
 *   creator (null for anyone else): a label re-read needs the label photograph
 *   its onboarding kept, and both helpers run in that onboarding's actor.
 * - `rereadItemLabel` and `suggestItemDetails` are the two model calls. Both
 *   return proposals and **write nothing** — the edit form shows each value as
 *   a chip the creator taps, and its Save is the only write.
 * - `replaceItemBrand` is D8's one-tap "Wrong brand? Change it": one
 *   `ItemActor` turn, so the item never ends with both brands or neither.
 *
 * The two model calls are addressed to `ItemOnboardingActor(onboardingId)`,
 * where `onboardingId` comes from `ItemActor.correctionSource` — this process
 * holds no database handle, so it asks the item which session it came from.
 * `ItemOnboardingActor` checks again that the caller created the item through
 * that session; this resolver's check only chooses the actor.
 */
import type {
  ItemBrandDto,
  ItemCorrectionSource,
  ItemDetailSuggestions,
  ItemLabelReading,
  ItemRef,
} from "@cellar-assistant/contracts";
import {
  ConflictError,
  ForbiddenError,
  ItemActorDescriptor,
  ItemOnboardingActorDescriptor,
  itemActorId,
} from "@cellar-assistant/contracts";
import type { ApiContext } from "../context.ts";
import { builder } from "./builder.ts";
import { ItemBrandType, ItemInterface, ItemTypeEnum } from "./item.ts";

const ItemCorrectionType = builder
  .objectRef<ItemCorrectionSource>("ItemCorrection")
  .implement({
    description:
      "X19: the AI helpers the item's edit page can offer its creator.",
    fields: (t) => ({
      canRereadLabel: t.boolean({
        description:
          "The onboarding that created this item kept a label photograph, " +
          "so `rereadItemLabel` has something to read.",
        resolve: (source) => source.onboardingId !== null && source.hasLabel,
      }),
      canSuggestDetails: t.boolean({
        description:
          "`suggestItemDetails` can run for this item (it was created " +
          "through an onboarding). Hide the action when " +
          "`viewer.aiCapabilities.detailSuggestions` is false.",
        resolve: (source) => source.onboardingId !== null,
      }),
    }),
  });

builder.interfaceField(ItemInterface, "correction", (t) =>
  t.field({
    type: ItemCorrectionType,
    nullable: true,
    description:
      "X19: what the edit page can offer to correct this item — for its " +
      "creator; null for anyone else. Reads, calls no model.",
    resolve: (item, _args, context) =>
      context.actor(ItemActorDescriptor, itemActorId(item)).correctionSource(),
  }),
);

const ItemLabelReadingType = builder
  .objectRef<ItemLabelReading>("ItemLabelReading")
  .implement({
    description:
      "A fresh reading of an item's stored label photographs. Not stored, " +
      "and not applied: every value is a proposal for the edit form.",
    fields: (t) => ({
      defaults: t.field({
        type: "JSON",
        description:
          "Shaped like `ItemOnboarding.defaults`: name, description, " +
          "country, brandName and the per-type bag. A wine's vintage may be " +
          '`"NV"` — the label says non-vintage.',
        resolve: (reading) => JSON.parse(reading.defaults),
      }),
      brandName: t.exposeString("brandName", { nullable: true }),
      confidence: t.exposeFloat("confidence", {
        description: "0–1, the model's own.",
      }),
      model: t.exposeString("model"),
    }),
  });

const ItemDetailSuggestionsType = builder
  .objectRef<ItemDetailSuggestions>("ItemDetailSuggestions")
  .implement({
    description:
      "What a text model knows about this product, for the details the form " +
      "has empty. Suggestions only — never read off the bottle, never " +
      "applied without a tap, never stored.",
    fields: (t) => ({
      abstained: t.exposeBoolean("abstained", {
        description:
          "The model does not know this product well enough to say. " +
          "`defaults` is then empty. A correct and common answer.",
      }),
      note: t.exposeString("note", {
        nullable: true,
        description: "The model's one-line account of what it took this to be.",
      }),
      defaults: t.field({
        type: "JSON",
        description:
          "`country` and/or the per-type bag; closed-list values and region " +
          "only, never a number or a year.",
        resolve: (suggestions) => JSON.parse(suggestions.defaults),
      }),
      model: t.exposeString("model", { nullable: true }),
    }),
  });

const SuggestItemDetailsInput = builder.inputType("SuggestItemDetailsInput", {
  description:
    "The item as the edit form holds it now — the name may have just been " +
    "corrected. Filled details are context and are never re-suggested.",
  fields: (t) => ({
    name: t.string({ required: true }),
    brandName: t.string({ required: false }),
    country: t.string({ required: false }),
    attributes: t.field({
      type: "JSON",
      required: false,
      description: "The per-type attribute bag, by the input's field names.",
    }),
  }),
});

/** The onboarding a correction for `ref` runs in, or a typed refusal. */
const correctionOnboarding = async (
  context: ApiContext,
  ref: ItemRef,
  needsLabel: boolean,
): Promise<string> => {
  const source = await context
    .actor(ItemActorDescriptor, itemActorId(ref))
    .correctionSource();
  if (source === null) {
    throw new ForbiddenError(
      `only the creator of ${ref.type.toLowerCase()} ${ref.id} may correct it`,
    );
  }
  if (source.onboardingId === null || (needsLabel && !source.hasLabel)) {
    throw new ConflictError(
      needsLabel
        ? "this item kept no label photograph to read again — add the " +
            "details by hand, or ask for suggestions"
        : "this item was not added through an onboarding, so there is " +
            "nothing to run suggestions in",
      "NOTHING_READ",
    );
  }
  return source.onboardingId;
};

builder.mutationField("rereadItemLabel", (t) =>
  t.field({
    type: ItemLabelReadingType,
    description:
      "X19 “Re-read label”: the item's stored label photographs, read again " +
      "by the vision model. The creator only. **Slow** (the model runs in " +
      "the request, as `startItemOnboarding`'s does) and **writes nothing**.",
    errors: {},
    args: {
      type: t.arg({ type: ItemTypeEnum, required: true }),
      itemId: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, context) => {
      const item: ItemRef = { type: args.type, id: String(args.itemId) };
      const onboardingId = await correctionOnboarding(context, item, true);
      return await context
        .actor(ItemOnboardingActorDescriptor, onboardingId)
        .rereadLabel({ item });
    },
  }),
);

builder.mutationField("suggestItemDetails", (t) =>
  t.field({
    type: ItemDetailSuggestionsType,
    description:
      "X19 “Suggest details”: a text-only model pass over the item's name and " +
      "brand, for the details still empty. The creator only. May abstain; " +
      "writes nothing.",
    errors: {},
    args: {
      type: t.arg({ type: ItemTypeEnum, required: true }),
      itemId: t.arg.id({ required: true }),
      input: t.arg({ type: SuggestItemDetailsInput, required: true }),
    },
    resolve: async (_root, args, context) => {
      const item: ItemRef = { type: args.type, id: String(args.itemId) };
      const onboardingId = await correctionOnboarding(context, item, false);
      return await context
        .actor(ItemOnboardingActorDescriptor, onboardingId)
        .suggestDetails({
          item,
          name: args.input.name,
          brandName: args.input.brandName ?? null,
          country: args.input.country ?? null,
          attributes:
            (args.input.attributes as Record<string, unknown> | null) ?? null,
        });
    },
  }),
);

builder.mutationField("replaceItemBrand", (t) =>
  t.field({
    type: ItemBrandType,
    description:
      "D8 “Wrong brand? Change it”: `brandId` (from `resolveBrand`) becomes " +
      "the item's primary brand and `replacesBrandId` — the brand the page " +
      "showed — is unlinked, in one turn. The creator only. Repeating it is " +
      "a no-op, so an Undo is the same call with the two swapped. A " +
      "`brandId` that names no brand is a `NotFoundError`.",
    errors: {},
    args: {
      type: t.arg({ type: ItemTypeEnum, required: true }),
      itemId: t.arg.id({ required: true }),
      brandId: t.arg.id({ required: true }),
      replacesBrandId: t.arg.id({ required: false }),
    },
    resolve: (_root, args, context): Promise<ItemBrandDto> =>
      context
        .actor(
          ItemActorDescriptor,
          itemActorId({ type: args.type, id: String(args.itemId) }),
        )
        .replacePrimaryBrand({
          brandId: String(args.brandId),
          replacesBrandId:
            args.replacesBrandId === undefined || args.replacesBrandId === null
              ? null
              : String(args.replacesBrandId),
        }),
  }),
);
