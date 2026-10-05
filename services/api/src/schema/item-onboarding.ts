/**
 * `ItemOnboarding` — B2 (migration plan §2.1 `ItemOnboardingActor`, §8.5).
 *
 * Replaces the six `*_defaults` Hasura actions and the `getItemDefaults`
 * function with two mutations and one query, all on one actor keyed by the
 * onboarding id.
 *
 * **`startItemOnboarding` is slow on purpose.** §8.5 names it one of only two
 * request-driven long operations in the system (the other is place creation):
 * the user is waiting on a model, so the call is allowed to take up to 120
 * seconds, and the actor key confines that wait to one onboarding rather than
 * to a user or an item. Set the API's actor-invocation timeout accordingly.
 *
 * `confirmItemOnboarding` fans out to four actors — see the actor's module doc
 * for which two are synchronous and which two go through the outbox — and is
 * idempotent end to end: calling it twice yields one item, one brand and one
 * cellar item.
 */
import { randomUUID } from "node:crypto";
import type {
  ConfirmOnboardingInput as ConfirmOnboardingInputType,
  ConfirmOnboardingResult,
  ItemOnboardingDto,
} from "@cellar-assistant/contracts";
import {
  ItemOnboardingActorDescriptor,
  itemActorId,
  ONBOARDING_STATUSES,
} from "@cellar-assistant/contracts";
import { builder } from "./builder.ts";
import { ItemInterface, ItemTypeEnum } from "./item.ts";

const OnboardingStatusEnum = builder.enumType("OnboardingStatus", {
  description:
    "`item_onboardings.status`. Plain `text` in the database with no check " +
    "constraint, so this enum is the convention rather than an enforced " +
    "domain. `START` is the column default; `COMPLETED` is what the old " +
    "`getItemDefaults` wrote; `CONFIRMED` and `FAILED` are B2 additions for " +
    "two states the old flow had nowhere to record.",
  values: ONBOARDING_STATUSES,
});

export const ItemOnboardingType = builder
  .objectRef<ItemOnboardingDto>("ItemOnboarding")
  .implement({
    description:
      "One label-scan session. Visible to its owner and nobody else — not " +
      "friends, not the public (§2.1).",
    fields: (t) => ({
      id: t.exposeID("id"),
      userId: t.exposeID("userId"),
      status: t.field({
        type: OnboardingStatusEnum,
        resolve: (onboarding) => onboarding.status,
      }),
      itemType: t.field({
        type: ItemTypeEnum,
        resolve: (onboarding) => onboarding.itemType,
      }),
      barcode: t.exposeString("barcode", { nullable: true }),
      barcodeType: t.exposeString("barcodeType", { nullable: true }),
      frontLabelImageId: t.exposeID("frontLabelImageId", { nullable: true }),
      backLabelImageId: t.exposeID("backLabelImageId", { nullable: true }),
      defaults: t.field({
        type: "JSON",
        nullable: true,
        description:
          "The model's proposal. Its per-type shape belongs to the prompt, " +
          "not to this schema — the actor stores it verbatim.",
        resolve: (onboarding) =>
          onboarding.defaults === null ? null : JSON.parse(onboarding.defaults),
      }),
      aiModel: t.exposeString("aiModel", { nullable: true }),
      confidence: t.exposeFloat("confidence", {
        nullable: true,
        description: "0–1. Drives whether the client pre-fills or suggests.",
      }),
      createdAt: t.expose("createdAt", { type: "DateTime" }),
      updatedAt: t.expose("updatedAt", { type: "DateTime" }),
    }),
  });

const ConfirmOnboardingResultType = builder
  .objectRef<ConfirmOnboardingResult>("ConfirmedItemOnboarding")
  .implement({
    description:
      "What `confirmItemOnboarding` set in motion. The item, brand link and " +
      "cellar item are written by the outbox, so the ids here name rows that " +
      "are being created rather than rows that already exist — deliberately, " +
      "because they are deterministic and therefore safe to name early.",
    fields: (t) => ({
      onboardingId: t.exposeID("onboardingId"),
      itemId: t.id({
        description: "Deterministic: the same confirm always names this id.",
        resolve: (result) => result.item.id,
      }),
      itemType: t.field({
        type: ItemTypeEnum,
        resolve: (result) => result.item.type,
      }),
      item: t.field({
        type: ItemInterface,
        nullable: true,
        description:
          "Null until the outbox has delivered `ItemActor.create`. Poll " +
          "`item(type:, id:)` with the ids above rather than this, if you " +
          "need to wait for it.",
        resolve: (result) => itemActorId(result.item),
      }),
      brandId: t.exposeID("brandId", { nullable: true }),
      cellarItemId: t.exposeID("cellarItemId", { nullable: true }),
      barcode: t.exposeString("barcode", { nullable: true }),
    }),
  });

const StartItemOnboardingInput = builder.inputType("StartItemOnboardingInput", {
  fields: (t) => ({
    itemType: t.field({ type: ItemTypeEnum, required: true }),
    frontLabelImageId: t.id({
      required: false,
      description:
        "A `files.id`. Both label images are optional — a " +
        "barcode-only onboarding has neither.",
    }),
    backLabelImageId: t.id({ required: false }),
    barcode: t.string({ required: false }),
    barcodeType: t.string({ required: false }),
  }),
});

const ConfirmItemOnboardingInput = builder.inputType(
  "ConfirmItemOnboardingInput",
  {
    description:
      "The fields the user accepted, plus where the bottle goes. Every " +
      "downstream call is idempotent, so re-sending this is safe.",
    fields: (t) => ({
      itemId: t.id({
        required: false,
        description:
          "Mint it to pin the idempotency key yourself; otherwise the actor " +
          "derives it deterministically from the onboarding id.",
      }),
      name: t.string({ required: true }),
      description: t.string({ required: false }),
      country: t.string({ required: false }),
      attributes: t.field({
        type: "JSON",
        required: false,
        description:
          "The per-type attribute bag, same fields `CreateItemInput` carries " +
          "for this `itemType`.",
      }),
      brandName: t.string({
        required: false,
        description:
          "Resolved through `BrandRegistryActor` (find-or-create by " +
          "`lower(trim(name))`), never written directly.",
      }),
      cellarId: t.id({ required: false }),
      cellarItemId: t.id({ required: false }),
    }),
  },
);

builder.queryField("itemOnboarding", (t) =>
  t.field({
    type: ItemOnboardingType,
    description: "Yours alone. `NotFoundError` covers both cases (§1.6).",
    errors: {},
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      context.actor(ItemOnboardingActorDescriptor, String(args.id)).get(),
  }),
);

builder.mutationField("startItemOnboarding", (t) =>
  t.field({
    type: ItemOnboardingType,
    description:
      "Creates the onboarding and runs the label extraction. **Slow by " +
      "design** — the model call happens inside this actor's turn (§8.5), " +
      "which is why onboarding has an actor of its own. Idempotent: a retry " +
      "after a completed extraction returns the stored defaults without " +
      "calling the model again.",
    errors: {},
    args: {
      onboardingId: t.arg.id({ required: false }),
      input: t.arg({ type: StartItemOnboardingInput, required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(
          ItemOnboardingActorDescriptor,
          args.onboardingId === undefined || args.onboardingId === null
            ? randomUUID()
            : String(args.onboardingId),
        )
        .start({
          itemType: args.input.itemType,
          frontLabelImageId:
            args.input.frontLabelImageId === undefined ||
            args.input.frontLabelImageId === null
              ? null
              : String(args.input.frontLabelImageId),
          backLabelImageId:
            args.input.backLabelImageId === undefined ||
            args.input.backLabelImageId === null
              ? null
              : String(args.input.backLabelImageId),
          barcode: args.input.barcode ?? null,
          barcodeType: args.input.barcodeType ?? null,
        }),
  }),
);

builder.mutationField("itemOnboardingDefaults", (t) =>
  t.field({
    type: ItemOnboardingType,
    description:
      "The stored proposal, without re-running the model. A mutation only " +
      "because §8.3 keeps the command vocabulary on `Mutation`; it writes " +
      "nothing.",
    errors: {},
    args: { onboardingId: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      context
        .actor(ItemOnboardingActorDescriptor, String(args.onboardingId))
        .defaults(),
  }),
);

builder.mutationField("confirmItemOnboarding", (t) =>
  t.field({
    type: ConfirmOnboardingResultType,
    description:
      "Turns an accepted proposal into an item, a brand link and a cellar " +
      "item. Delivered twice, it yields one of each (§8.4).",
    errors: {},
    args: {
      onboardingId: t.arg.id({ required: true }),
      input: t.arg({ type: ConfirmItemOnboardingInput, required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(ItemOnboardingActorDescriptor, String(args.onboardingId))
        .confirm({
          itemId:
            args.input.itemId === undefined || args.input.itemId === null
              ? null
              : String(args.input.itemId),
          name: args.input.name,
          description: args.input.description ?? null,
          country: args.input.country ?? null,
          attributes:
            (args.input.attributes as Record<string, unknown> | null) ?? null,
          brandName: args.input.brandName ?? null,
          cellarId:
            args.input.cellarId === undefined || args.input.cellarId === null
              ? null
              : String(args.input.cellarId),
          cellarItemId:
            args.input.cellarItemId === undefined ||
            args.input.cellarItemId === null
              ? null
              : String(args.input.cellarItemId),
        } satisfies ConfirmOnboardingInputType),
  }),
);
