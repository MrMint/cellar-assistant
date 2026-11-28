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
  ItemRef,
  SaveDraftInput as SaveDraftInputType,
} from "@cellar-assistant/contracts";
import {
  DRAFT_IMAGE_BATCH_MAX_IDS,
  DraftsCollectionActorDescriptor,
  draftImageBatchActorId,
  ItemOnboardingActorDescriptor,
  itemActorId,
  ONBOARDING_STATUSES,
  offsetPage,
  parseItemActorId,
  REVERSE_EDGE_MAX_PARENTS,
  VINTAGE_ANSWERS,
  viewerCollectionActorId,
} from "@cellar-assistant/contracts";
import DataLoader from "dataloader";
import type { ApiContext } from "../context.ts";
import { builder } from "./builder.ts";
import { ItemInterface, ItemTypeEnum } from "./item.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";
import { Viewer } from "./viewer.ts";

const OnboardingStatusEnum = builder.enumType("OnboardingStatus", {
  description:
    "`item_onboardings.status`. Plain `text` in the database with no check " +
    "constraint, so this enum is the convention rather than an enforced " +
    "domain. `START` is the column default; `COMPLETED` is what the old " +
    "`getItemDefaults` wrote; `CONFIRMED` and `FAILED` are B2 additions for " +
    "two states the old flow had nowhere to record. `MATCHED` closes a " +
    "session whose bottle was an item the catalogue already held " +
    "(`closeItemOnboarding`): nothing was created from it. `NEEDS_DETAILS` " +
    "is a draft set aside with Finish later (`saveDraft`); `DISCARDED` is a " +
    "draft its owner deleted (`discardDraft`), listed and counted nowhere.",
  values: ONBOARDING_STATUSES,
});

/**
 * H-133 (F-71): one `draftImageUrls` call per request for every draft
 * picture the response shows (the avatar batch's shape, F-89): a page of
 * Needs details is one actor turn, not one file query per row. Keyed by the
 * request, so a loader never outlives it or crosses viewers.
 */
const draftImageBatchByRequest = new WeakMap<
  ApiContext,
  DataLoader<string, string | null>
>();

const draftImageUrlOf = (
  context: ApiContext,
  onboarding: ItemOnboardingDto,
): Promise<string | null> | null => {
  const viewerId = context.ctx.viewerId;
  if (onboarding.imageId === null || viewerId === null) return null;
  let loader = draftImageBatchByRequest.get(context);
  if (loader === undefined) {
    loader = new DataLoader<string, string | null>(
      async (onboardingIds) => {
        const targets = await context
          .actor(
            ItemOnboardingActorDescriptor,
            draftImageBatchActorId(viewerId),
          )
          .draftImageUrls({ onboardingIds });
        return onboardingIds.map((_id, index) => targets[index]?.url ?? null);
      },
      { maxBatchSize: DRAFT_IMAGE_BATCH_MAX_IDS },
    );
    draftImageBatchByRequest.set(context, loader);
  }
  return loader.load(onboarding.id);
};

const VintageAnswerEnum = builder.enumType("VintageAnswer", {
  description:
    "SV-B: a draft's answer to “which vintage?”. `NON_VINTAGE` is the " +
    "answer “No vintage”; `UNANSWERED` is no answer yet. Both read as a " +
    "NULL vintage once the item exists, which is why the draft keeps them " +
    "apart.",
  values: VINTAGE_ANSWERS,
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
      detectedItemType: t.field({
        type: ItemTypeEnum,
        nullable: true,
        description:
          "F-77: the kind the label read says this label is for, or null " +
          "when it named none. When it differs from `itemType`, `defaults` " +
          "is empty and the client can read the label again as this kind — " +
          "the kind follows the shot.",
        resolve: (onboarding) => onboarding.detectedItemType,
      }),
      aiModel: t.exposeString("aiModel", { nullable: true }),
      confidence: t.exposeFloat("confidence", {
        nullable: true,
        description: "0–1. Drives whether the client pre-fills or suggests.",
      }),
      createdAt: t.expose("createdAt", { type: "DateTime" }),
      updatedAt: t.expose("updatedAt", { type: "DateTime" }),
      cellarId: t.exposeID("cellarId", {
        nullable: true,
        description: "SV-B: the cellar a saved draft is aimed at.",
      }),
      confirmedFields: t.exposeStringList("confirmedFields", {
        description:
          "SV-B: the guessed fields the person accepted or edited (`saveDraft`, " +
          "`confirmItemOnboarding`).",
      }),
      vintageAnswer: t.field({
        type: VintageAnswerEnum,
        resolve: (onboarding) => onboarding.vintageAnswer,
      }),
      displayName: t.exposeString("displayName", {
        nullable: true,
        description: "SV-B: a saved draft's name, for its “Needs details” row.",
      }),
      displayMaker: t.exposeString("displayMaker", {
        nullable: true,
        description: "SV-B: a saved draft's maker (its brand name).",
      }),
      imageId: t.exposeID("imageId", {
        nullable: true,
        description: "SV-B: a saved draft's picture, a `files.id`.",
      }),
      imageUrl: t.string({
        nullable: true,
        description:
          "H-133 (F-71): a browser URL for `imageId`, signed with every other " +
          "draft picture in this response in one batch. Null when the draft " +
          "has no picture, or its file is not a verified upload of yours.",
        resolve: (onboarding, _args, context) =>
          draftImageUrlOf(context, onboarding),
      }),
      draftFields: t.field({
        type: "JSON",
        nullable: true,
        description:
          "SV-B: the saved draft's fields (`SaveDraftInput.fields`), to finish " +
          "it from. Null until `saveDraft`.",
        resolve: (onboarding) =>
          onboarding.draftFields === null
            ? null
            : JSON.parse(onboarding.draftFields),
      }),
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
      cellarId: t.id({
        required: false,
        description:
          "Absent: a saved draft's own cellar, if it has one. `null`: none.",
      }),
      cellarItemId: t.id({ required: false }),
      confirmedFields: t.stringList({
        required: false,
        description:
          "SV-B: the guessed fields the person accepted or edited, so " +
          "`Item.unconfirmedFields` can name the ones they never touched. " +
          "Absent keeps what a saved draft recorded.",
      }),
    }),
  },
);

const SaveDraftInput = builder.inputType("SaveDraftInput", {
  description:
    "SV-B: an unfinished bottle, kept on the account. Every saved draft is " +
    "`NEEDS_DETAILS`, floor met or not, and listed in `needsDetails` until " +
    "`confirmItemOnboarding`.",
  fields: (t) => ({
    onboardingId: t.id({
      required: true,
      description: "From `startItemOnboarding` or `openItemDraft`.",
    }),
    cellarId: t.id({
      required: false,
      description: "The cellar it is aimed at; yours to write.",
    }),
    fields: t.field({
      type: "JSON",
      required: true,
      description:
        "`{ name, description, country, brandName, attributes }`, any of " +
        "them missing — `ConfirmItemOnboardingInput`'s item fields.",
    }),
    confirmedFields: t.stringList({ required: true }),
    vintageAnswer: t.field({ type: VintageAnswerEnum, required: true }),
  }),
});

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

builder.mutationField("openItemDraft", (t) =>
  t.field({
    type: ItemOnboardingType,
    description:
      "X07: open an onboarding with nothing to read — a draft typed by hand " +
      "or carried over from a menu line — so `confirmItemOnboarding` can " +
      "create its item. No model call. Idempotent on `draftId`; the same id " +
      "with another type is a `ValidationError`.",
    errors: {},
    args: {
      draftId: t.arg.id({ required: true }),
      type: t.arg({ type: ItemTypeEnum, required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(ItemOnboardingActorDescriptor, String(args.draftId))
        .openDraft({ itemType: args.type }),
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
          // Absent and `null` differ here (SV-B): absent lets a saved draft's
          // own cellar stand; `null` files the item into no cellar.
          ...(args.input.cellarId === undefined
            ? {}
            : {
                cellarId:
                  args.input.cellarId === null
                    ? null
                    : String(args.input.cellarId),
              }),
          cellarItemId:
            args.input.cellarItemId === undefined ||
            args.input.cellarItemId === null
              ? null
              : String(args.input.cellarItemId),
          ...(args.input.confirmedFields === undefined ||
          args.input.confirmedFields === null
            ? {}
            : { confirmedFields: args.input.confirmedFields }),
        } satisfies ConfirmOnboardingInputType),
  }),
);

builder.mutationField("closeItemOnboarding", (t) =>
  t.field({
    type: ItemOnboardingType,
    description:
      "Closes a session whose bottle turned out to be an item the catalogue " +
      "already held (the quick-add, or “Is it this one? +1 bottle”): its " +
      "status becomes `MATCHED` and nothing is created. Idempotent; a " +
      "session that already `CONFIRMED` an item of its own stays `CONFIRMED`.",
    errors: {},
    args: { onboardingId: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      context
        .actor(ItemOnboardingActorDescriptor, String(args.onboardingId))
        .closeAsMatched(),
  }),
);

/* -------------------------------------------------------------------------- */
/* SV-B · MC-drafts — saved "Needs details" drafts                             */
/* -------------------------------------------------------------------------- */

builder.mutationField("saveDraft", (t) =>
  t.field({
    type: ItemOnboardingType,
    description:
      "SV-B: keep an unfinished bottle on your account, aimed at a cellar. " +
      "Yours alone: someone else's draft, or a cellar you cannot write, is a " +
      "`NotFoundError`. A filed session (`CONFIRMED`, `MATCHED`) is a " +
      "`ConflictError`. No model call.",
    errors: {},
    args: { input: t.arg({ type: SaveDraftInput, required: true }) },
    resolve: (_root, args, context) =>
      context
        .actor(ItemOnboardingActorDescriptor, String(args.input.onboardingId))
        .saveDraft({
          cellarId:
            args.input.cellarId === undefined || args.input.cellarId === null
              ? null
              : String(args.input.cellarId),
          fields: args.input.fields as SaveDraftInputType["fields"],
          confirmedFields: args.input.confirmedFields,
          vintageAnswer: args.input.vintageAnswer,
        } satisfies SaveDraftInputType),
  }),
);

builder.mutationField("discardDraft", (t) =>
  t.field({
    type: ItemOnboardingType,
    description:
      "H-133 (F-65): delete a saved draft. Its status becomes `DISCARDED`: " +
      "nothing is created, and it leaves `needsDetails`, `needsDetailsCount` " +
      "and every other draft count. Yours alone: someone else's is a " +
      "`NotFoundError`. A filed session (`CONFIRMED`, `MATCHED`) is a " +
      "`ConflictError`. Idempotent; `saveDraft` and `confirmItemOnboarding` " +
      "refuse a discarded draft.",
    errors: {},
    args: { onboardingId: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      context
        .actor(ItemOnboardingActorDescriptor, String(args.onboardingId))
        .discardDraft(),
  }),
);

const needsDetailsArgs = (cellarId: string | number | null | undefined) =>
  cellarId === undefined || cellarId === null
    ? {}
    : { cellarId: String(cellarId) };

const ItemOnboardingConnection = builder.connectionObject(
  { type: ItemOnboardingType, name: "ItemOnboardingConnection" },
  { name: "ItemOnboardingEdge" },
);

builder.queryField("needsDetails", (t) =>
  t.field({
    type: ItemOnboardingConnection,
    description:
      "SV-B: your saved “Needs details” drafts, newest first — one cellar's, " +
      "or all of yours without `cellarId`. Empty when signed out. Pages over " +
      "every draft `needsDetailsCount` counts.",
    errors: {},
    args: {
      ...t.arg.connectionArgs(),
      cellarId: t.arg.id({ required: false }),
    },
    resolve: async (_root, args, context) => {
      const viewerId = context.ctx.viewerId;
      const drafts =
        viewerId === null
          ? []
          : await context
              .actor(
                DraftsCollectionActorDescriptor,
                viewerCollectionActorId(viewerId),
              )
              .needsDetails(needsDetailsArgs(args.cellarId));
      return connectionFromPage(offsetPage(drafts, toPageArgs(args)));
    },
  }),
);

/**
 * F-74: `needsDetailsCount` is a non-null root `Int`, so a `ValidationError`
 * from the actor would null the whole response and hide `needsDetails`' own
 * error value. A `cellarId` that is no UUID names no cellar: none of the
 * viewer's drafts is aimed at it, so its count is 0, without a call.
 */
const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

builder.queryField("needsDetailsCount", (t) =>
  t.int({
    description:
      "SV-B: how many of your drafts need details — on one cellar, or in all " +
      "of yours without `cellarId`. A draft is not a cellar item, so this is " +
      "not in the cellar's item counts. 0 when signed out, and for a " +
      "`cellarId` that is not a UUID (`needsDetails` reports that one).",
    args: { cellarId: t.arg.id({ required: false }) },
    resolve: async (_root, args, context) => {
      const viewerId = context.ctx.viewerId;
      if (viewerId === null) return 0;
      if (
        args.cellarId !== undefined &&
        args.cellarId !== null &&
        !UUID_SHAPE.test(String(args.cellarId))
      ) {
        return 0;
      }
      return await context
        .actor(
          DraftsCollectionActorDescriptor,
          viewerCollectionActorId(viewerId),
        )
        .needsDetailsCount(needsDetailsArgs(args.cellarId));
    },
  }),
);

builder.objectField(Viewer, "unconfirmedBottleCount", (t) =>
  t.int({
    description:
      "F-76: Home's “n to check” — how many of your bottles (open or " +
      "sealed, not finished, in cellars you created or co-own) are of an " +
      "item you created whose `unconfirmedFields` is not empty.",
    resolve: async (viewer, _args, context) =>
      await context
        .actor(
          DraftsCollectionActorDescriptor,
          viewerCollectionActorId(viewer.id),
        )
        .unconfirmedBottleCount(),
  }),
);

/**
 * `Item.unconfirmedFields` (C3's "Check this"): one batched
 * `DraftsCollectionActor` call per `REVERSE_EDGE_MAX_PARENTS` items in a tick.
 */
const loadUnconfirmedFields = async (
  keys: string[],
  context: ApiContext,
): Promise<string[][]> => {
  const viewerId = context.ctx.viewerId;
  if (viewerId === null) return keys.map(() => []);
  const refs = keys.map(parseItemActorId);
  const valid = refs.filter((ref): ref is ItemRef => ref !== null);
  const answers = new Map<string, readonly string[]>();
  for (let start = 0; start < valid.length; start += REVERSE_EDGE_MAX_PARENTS) {
    const chunk = valid.slice(start, start + REVERSE_EDGE_MAX_PARENTS);
    const fields = await context
      .actor(DraftsCollectionActorDescriptor, viewerCollectionActorId(viewerId))
      .unconfirmedFields(chunk);
    chunk.forEach((ref, index) => {
      answers.set(itemActorId(ref), fields[index] ?? []);
    });
  }
  return keys.map((key) => [...(answers.get(key) ?? [])]);
};

builder.interfaceField(ItemInterface, "unconfirmedFields", (t) =>
  t.loadableList({
    type: "String",
    description:
      "SV-B: the fields the label read guessed that you never accepted or " +
      "edited, from the onboarding that created this item — what “Check " +
      "this” points at. Empty unless you created the item from a read.",
    resolve: (item) => itemActorId(item),
    load: loadUnconfirmedFields,
  }),
);
