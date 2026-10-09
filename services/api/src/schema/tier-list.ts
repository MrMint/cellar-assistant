/**
 * The tier-list aggregate's GraphQL surface — B7 (migration plan §2.1, §8.3).
 *
 * Every field here is one `TierListActor` call, same shape as `cellar.ts`:
 * `Query.tierList` names an actor id, `TierList.items` is a connection on the
 * *object* (§1.5: "child lists are paged from the owner"), and each mutation
 * is an imperative command mapped onto exactly one `TierListActorInterface`
 * method.
 *
 * ## Items and places, modelled as two sibling fields — not a union
 *
 * `TierListItemDto.entry` is `ItemRef`'s six types plus `"PLACE"` (see the
 * contracts module doc for why). There is no `PlaceActor` yet (B5), so there
 * is no batched loader a `Place` field could resolve through the way
 * `Item.ts`'s `ItemInterface` does. Rather than invent one, `TierListItem`
 * exposes:
 *
 *   - `entryType` — always present, the discriminator;
 *   - `item` — the existing `Item` interface, resolved through its DataLoader,
 *     non-null exactly when `entryType !== PLACE`;
 *   - `place` — a minimal `Place` type (id only), non-null exactly when
 *     `entryType === PLACE`.
 *
 * A GraphQL union was considered and rejected: `Item` is itself an
 * *interface* (Wine/Beer/…), and a union's members must be object types, so
 * a `TierListEntry = Item | Place` union would need the six concrete item
 * types re-exported from `item.ts` (B2's file, out of scope here) rather than
 * reused as the interface already is elsewhere in the schema. Two nullable
 * sibling fields cost nothing extra and need no changes to B2's file.
 *
 * **`Place` here is intentionally minimal** (`id` only) — B5 should extend
 * this same type with real fields when `PlaceActor` exists, not declare a
 * second `Place` type.
 */
import { randomUUID } from "node:crypto";
import type {
  AddTierListItemInput as AddTierListItemInputType,
  CreateTierListInput as CreateTierListInputType,
  DeletedTierList,
  ItemType,
  PermissionType,
  RemovedTierListItem,
  TierListDto,
  TierListEditDto,
  TierListEditHistoryDto,
  TierListEntryRef,
  TierListEntryType,
  TierListHistoryStepResult,
  TierListItemDto,
  UpdateTierListInput as UpdateTierListInputType,
} from "@cellar-assistant/contracts";
import {
  ForbiddenError,
  ItemActorDescriptor,
  itemActorId,
  offsetPage,
  TIER_LIST_EDIT_KINDS,
  TIER_LIST_ENTRY_TYPES,
  TIER_LIST_INSIGHTS_STATUSES,
  TierListActorDescriptor,
  TierListsCollectionActorDescriptor,
  viewerCollectionActorId,
} from "@cellar-assistant/contracts";
import type { ApiContext } from "../context.ts";
import { builder } from "./builder.ts";
import { CollectionSectionEnum, PermissionTypeEnum } from "./enums.ts";
import { ActorErrorReasonEnum } from "./errors.ts";
import { ItemInterface, ItemReviewType } from "./item.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";
import { type PatchPolicy, patch, present } from "./patch.ts";

/* -------------------------------------------------------------------------- */
/* Enums                                                                       */
/* -------------------------------------------------------------------------- */

export const TierListEntryTypeEnum = builder.enumType("TierListEntryType", {
  description:
    "Everything a tier list can rank: the six Item types, plus PLACE — the " +
    "value `item_type` (a Postgres enum) cannot represent, which is why " +
    "`tier_list_items.type` stays `text` (A3's finding).",
  values: TIER_LIST_ENTRY_TYPES,
});

/* -------------------------------------------------------------------------- */
/* Object types                                                                */
/* -------------------------------------------------------------------------- */

type PlaceStub = { readonly id: string };

/**
 * Deliberately minimal — see the module doc. B5 extends this type; it does
 * not declare a second one.
 */
export const PlaceStubType = builder.objectRef<PlaceStub>("Place").implement({
  description:
    "A place, by id. There is no `PlaceActor` yet (plan workstream B5), so " +
    "there is nothing here to resolve further fields through — extend this " +
    "type when B5 lands rather than declaring a new one.",
  fields: (t) => ({
    id: t.exposeID("id"),
  }),
});

const toItemRef = (
  entry: TierListEntryRef,
): { type: ItemType; id: string } => ({
  // Safe: every caller of this helper has already excluded "PLACE".
  type: entry.type as ItemType,
  id: entry.id,
});

export const TierListItemType = builder
  .objectRef<TierListItemDto>("TierListItem")
  .implement({
    description:
      "One ranked entry: an item or a place, at a band (0-5) and a " +
      "sequential position within it.",
    fields: (t) => ({
      id: t.exposeID("id"),
      tierListId: t.exposeID("tierListId"),
      band: t.exposeInt("band"),
      position: t.exposeInt("position"),
      notes: t.exposeString("notes", { nullable: true }),
      entryType: t.field({
        type: TierListEntryTypeEnum,
        resolve: (row) => row.entry.type,
      }),
      item: t.field({
        type: ItemInterface,
        nullable: true,
        description: "Non-null exactly when entryType is not PLACE.",
        resolve: (row) =>
          row.entry.type === "PLACE" ? null : itemActorId(toItemRef(row.entry)),
      }),
      place: t.field({
        type: PlaceStubType,
        nullable: true,
        description: "Non-null exactly when entryType is PLACE.",
        resolve: (row) =>
          row.entry.type === "PLACE" ? { id: row.entry.id } : null,
      }),
      createdAt: t.expose("createdAt", { type: "DateTime", nullable: true }),
      updatedAt: t.expose("updatedAt", { type: "DateTime", nullable: true }),
    }),
  });

export const TierListItemConnection = builder.connectionObject(
  { type: TierListItemType, name: "TierListItemConnection" },
  { name: "TierListItemEdge" },
);

/** One batch, N parallel `TierListActor.get` calls (§1.5). C3 feeds it ids. */
const loadTierLists = async (
  keys: readonly string[],
  context: ApiContext,
): Promise<readonly (TierListDto | Error)[]> =>
  await Promise.all(
    keys.map(async (key): Promise<TierListDto | Error> => {
      try {
        return await context.actor(TierListActorDescriptor, key).get();
      } catch (cause) {
        return cause instanceof Error ? cause : new Error(String(cause));
      }
    }),
  );

/** N07: `TierListDto.insightsStatus`, as an enum. */
const TierListInsightsStatusEnum = builder.enumType("TierListInsightsStatus", {
  description:
    "Where a tier list's generated insights stand. NOT_ENOUGH_ENTRIES: too " +
    "few entries to describe. UNAVAILABLE: this deployment has no AI for " +
    "insights. PENDING: asked for, not yet answered (see insightsRetryAt for " +
    "a scheduled refresh). FAILED: the latest attempt failed (see " +
    "insightsFailureReason). READY: aiInsights is current. IDLE: nothing " +
    "generated or asked for yet; the next change asks.",
  values: TIER_LIST_INSIGHTS_STATUSES,
});

/* -------------------------------------------------------------------------- */
/* Edit history (D4)                                                           */
/* -------------------------------------------------------------------------- */

const TierListEditKindEnum = builder.enumType("TierListEditKind", {
  description:
    "What a tier-list edit did: ADD an entry, REMOVE one, or MOVE entries " +
    "(a reorder within a band, or into another band).",
  values: TIER_LIST_EDIT_KINDS,
});

const TierListEditType = builder
  .objectRef<TierListEditDto>("TierListEdit")
  .implement({
    description:
      "One recorded edit to a tier list's entries, as Undo and Redo name it.",
    fields: (t) => ({
      seq: t.exposeInt("seq", {
        description: "Per list, from 1, in the order the edits happened.",
      }),
      kind: t.field({
        type: TierListEditKindEnum,
        resolve: (edit) => edit.kind,
      }),
      entryType: t.field({
        type: TierListEntryTypeEnum,
        nullable: true,
        description:
          "What the edited entry ranks. Null for a reorder that moved " +
          "several entries at once.",
        resolve: (edit) => edit.entry?.type ?? null,
      }),
      entryId: t.id({
        nullable: true,
        description: "The item's or place's id (not the row's).",
        resolve: (edit) => edit.entry?.id ?? null,
      }),
      entryName: t.exposeString("entryName", {
        nullable: true,
        description: "Its name as it reads now; null when unreadable.",
      }),
      fromBand: t.exposeInt("fromBand", {
        nullable: true,
        description: "The band it left; null for ADD.",
      }),
      toBand: t.exposeInt("toBand", {
        nullable: true,
        description: "The band it landed in; null for REMOVE.",
      }),
      at: t.expose("at", { type: "DateTime" }),
    }),
  });

const TierListEditHistoryType = builder
  .objectRef<TierListEditHistoryDto>("TierListEditHistory")
  .implement({
    description:
      "Where a tier list's edit history stands for its owner (D4): the edit " +
      "Undo would take back and the one Redo would put back. The log behind " +
      "it is append-only and kept for the life of the list.",
    fields: (t) => ({
      editCount: t.exposeInt("editCount", {
        description: "Edits recorded so far, undone ones included.",
      }),
      canUndo: t.boolean({ resolve: (history) => history.undo !== null }),
      canRedo: t.boolean({ resolve: (history) => history.redo !== null }),
      undo: t.field({
        type: TierListEditType,
        nullable: true,
        resolve: (history) => history.undo,
      }),
      redo: t.field({
        type: TierListEditType,
        nullable: true,
        resolve: (history) => history.redo,
      }),
    }),
  });

const TierListHistoryStepType = builder
  .objectRef<TierListHistoryStepResult>("TierListHistoryStep")
  .implement({
    description: "What an Undo or Redo did, and where the history stands now.",
    fields: (t) => ({
      applied: t.field({
        type: TierListEditType,
        resolve: (step) => step.applied,
      }),
      history: t.field({
        type: TierListEditHistoryType,
        resolve: (step) => step.history,
      }),
    }),
  });

/** Kept apart from `.implement()`, whose result no longer carries the loader. */
const TierListLoadable = builder.loadableObjectRef<TierListDto, string>(
  "TierList",
  {
    load: loadTierLists,
    toKey: (tierList) => tierList.id,
  },
);

export const TierListType = TierListLoadable.implement({
  description:
    "A ranked list of items and/or places. Visible when PUBLIC, or " +
    "FRIENDS and you are a friend of its creator, or you are its creator " +
    "— there is no co-owner concept here, unlike Cellar.",
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    description: t.exposeString("description", { nullable: true }),
    createdById: t.exposeID("createdById"),
    privacy: t.field({
      type: PermissionTypeEnum,
      resolve: (tierList) => tierList.privacy,
    }),
    listType: t.exposeString("listType", {
      description:
        "`tier_lists.list_type` — free text, settable only at creation.",
    }),
    isEditingLocked: t.exposeBoolean("isEditingLocked"),
    itemCount: t.exposeInt("itemCount"),
    aiInsights: t.field({
      type: "JSON",
      nullable: true,
      description: "`generateInsights`'s output. Null until first generated.",
      resolve: (tierList) => tierList.aiInsights,
    }),
    insightsGeneratedAt: t.expose("insightsGeneratedAt", {
      type: "DateTime",
      nullable: true,
    }),
    insightsStatus: t.field({
      type: TierListInsightsStatusEnum,
      description:
        "Where the generated insights stand (N07). Render this; do not " +
        'infer "generating" from a null `aiInsights`.',
      resolve: (tierList) => tierList.insightsStatus,
    }),
    insightsFailureReason: t.field({
      type: ActorErrorReasonEnum,
      nullable: true,
      description:
        "Why the latest attempt failed, when `insightsStatus` is FAILED " +
        "and the failure carried a reason.",
      resolve: (tierList) => tierList.insightsFailureReason,
    }),
    insightsRetryAt: t.expose("insightsRetryAt", {
      type: "DateTime",
      nullable: true,
      description:
        "When the next attempt can or will happen: a budget window on " +
        "FAILED, or the end of the once-a-day refresh limit on PENDING.",
    }),
    contentUpdatedAt: t.expose("contentUpdatedAt", { type: "DateTime" }),
    createdAt: t.expose("createdAt", { type: "DateTime", nullable: true }),
    updatedAt: t.expose("updatedAt", { type: "DateTime", nullable: true }),

    editHistory: t.field({
      type: TierListEditHistoryType,
      nullable: true,
      description:
        "D4: Undo / Redo for the list's owner. Null for anyone else who " +
        "may see the list — the history is the owner's tool.",
      resolve: async (tierList, _args, context) =>
        await context.actor(TierListActorDescriptor, tierList.id).editHistory(),
    }),

    items: t.field({
      type: TierListItemConnection,
      description: "Every ranked entry, `band desc, position asc`.",
      args: t.arg.connectionArgs(),
      resolve: async (tierList, args, context) =>
        connectionFromPage(
          await context
            .actor(TierListActorDescriptor, tierList.id)
            .items(toPageArgs(args)),
        ),
    }),
  }),
});

/**
 * X23, after `TierListType` because it reads the list through that type's
 * loader — declared inside `TierListItem`'s own fields, the two types'
 * inference would chase each other.
 */
builder.objectField(TierListItemType, "ownerReview", (t) =>
  t.field({
    type: ItemReviewType,
    nullable: true,
    description:
      "X23: the list owner's own newest review of this entry's item — " +
      "the verdict a ranked row should show on someone else's list, " +
      "where `item.myReview` is only yours. Reviews are readable by any " +
      "signed-in viewer, so this widens nothing. Null for a PLACE entry " +
      "(a place rating is private to the person who gave it), for an " +
      "anonymous viewer, and when the owner has not reviewed it.",
    resolve: async (row, _args, context) => {
      if (row.entry.type === "PLACE" || context.ctx.viewerId === null) {
        return null;
      }
      // The list through its loader: one `get` per list per request,
      // however many rows ask, and `canSeeTierList` applied again.
      const list = await TierListLoadable.getDataloader(context)
        .load(row.tierListId)
        .catch(() => null);
      if (list === null) return null;
      return await context
        .actor(ItemActorDescriptor, itemActorId(toItemRef(row.entry)))
        .reviewBy(list.createdById);
    },
  }),
);

const DeletedTierListType = builder
  .objectRef<DeletedTierList>("DeletedTierList")
  .implement({
    description: "The id of a tier list that is gone.",
    fields: (t) => ({ id: t.exposeID("id") }),
  });

const RemovedTierListItemType = builder
  .objectRef<RemovedTierListItem>("RemovedTierListItem")
  .implement({
    description: "The id of a tier-list item that is gone.",
    fields: (t) => ({ id: t.exposeID("id") }),
  });

type ReorderBandPayload = {
  readonly band: number;
  readonly items: readonly TierListItemDto[];
};

const ReorderBandPayloadType = builder
  .objectRef<ReorderBandPayload>("ReorderBandPayload")
  .implement({
    description:
      "One band's items after a reorder, renumbered to clean sequential " +
      "positions. A band that lost a member to a cross-band move is " +
      "renumbered too, in the same call, but is not itself returned here — " +
      "read it back through `TierList.items` if you need to show it.",
    fields: (t) => ({
      band: t.exposeInt("band"),
      items: t.field({
        type: TierListItemConnection,
        args: t.arg.connectionArgs(),
        resolve: (payload, args) =>
          connectionFromPage(offsetPage(payload.items, toPageArgs(args))),
      }),
    }),
  });

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

const TierListEntryRefInput = builder.inputType("TierListEntryRefInput", {
  description: "A typed reference to whatever a tier list ranks.",
  fields: (t) => ({
    type: t.field({ type: TierListEntryTypeEnum, required: true }),
    id: t.id({ required: true }),
  }),
});

const CreateTierListInput = builder.inputType("CreateTierListInput", {
  fields: (t) => ({
    name: t.string({ required: true }),
    description: t.string({ required: false }),
    privacy: t.field({ type: PermissionTypeEnum, required: false }),
    listType: t.string({
      required: false,
      description: "Defaults to `'place'`. Settable only at creation.",
    }),
  }),
});

const UpdateTierListInput = builder.inputType("UpdateTierListInput", {
  description: "Only the fields you pass are written. Creator only.",
  fields: (t) => ({
    name: t.string({ required: false }),
    description: t.string({ required: false }),
    privacy: t.field({ type: PermissionTypeEnum, required: false }),
    isEditingLocked: t.boolean({ required: false }),
  }),
});

const AddTierListItemInput = builder.inputType("AddTierListItemInput", {
  fields: (t) => ({
    entry: t.field({ type: TierListEntryRefInput, required: true }),
    band: t.int({ required: false, description: "Defaults to 0." }),
    notes: t.string({ required: false }),
    tierListItemId: t.id({
      required: false,
      description:
        "Mint it yourself to make the call idempotent (§8.4); otherwise " +
        "the server does.",
    }),
  }),
});

/* -------------------------------------------------------------------------- */
/* Argument marshalling                                                        */
/* -------------------------------------------------------------------------- */

const toEntryRef = (input: {
  type: TierListEntryType;
  id: string;
}): TierListEntryRef => ({ type: input.type, id: String(input.id) });

const toCreateInput = (input: {
  name: string;
  description?: string | null;
  privacy?: PermissionType | null;
  listType?: string | null;
}): CreateTierListInputType => ({
  name: input.name,
  description: input.description ?? null,
  ...(present(input.privacy) ? { privacy: input.privacy } : {}),
  ...(present(input.listType) ? { listType: input.listType } : {}),
});

const UPDATE_TIER_LIST = {
  name: "keep",
  description: "clearable",
  privacy: "keep",
  isEditingLocked: "keep",
} satisfies PatchPolicy<typeof UpdateTierListInput.$inferInput>;

const toAddItemInput = (input: {
  entry: { type: TierListEntryType; id: string };
  band?: number | null;
  notes?: string | null;
  tierListItemId?: string | null;
}): AddTierListItemInputType => ({
  entry: toEntryRef(input.entry),
  ...(present(input.band) ? { band: input.band } : {}),
  notes: input.notes ?? null,
  ...(present(input.tierListItemId)
    ? { tierListItemId: String(input.tierListItemId) }
    : {}),
});

/* -------------------------------------------------------------------------- */
/* Root fields                                                                 */
/* -------------------------------------------------------------------------- */

builder.queryField("tierList", (t) =>
  t.field({
    type: TierListType,
    description:
      "One tier list by id. `NotFoundError` covers both 'no such list' and " +
      "'not yours to see' (§1.6).",
    errors: {},
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      context.actor(TierListActorDescriptor, String(args.id)).get(),
  }),
);

export const TierListConnection = builder.connectionObject(
  { type: TierListType, name: "TierListConnection" },
  { name: "TierListEdge" },
);

builder.queryField("myTierLists", (t) =>
  t.field({
    type: TierListConnection,
    description:
      "`/tier-lists` — every tier list the viewer may see, most recently " +
      "changed first (C3's `TierListsCollectionActor`, §2.2). Ids from the " +
      "collection, hydrated by the `TierList` DataLoader (§1.5). The " +
      "visibility rule is `canSeeTierList`, the same one `TierListActor` and " +
      "the map's tier-list filter use. `section` narrows to one part of " +
      "that set — Yours, From friends or Discover (decision D2).",
    args: {
      ...t.arg.connectionArgs(),
      section: t.arg({
        type: CollectionSectionEnum,
        required: false,
        description:
          "Omit for every visible tier list; `MINE` for the viewer's own only.",
      }),
    },
    errors: {},
    resolve: async (_root, args, context) => {
      const viewerId = context.ctx.viewerId;
      if (viewerId === null) {
        throw new ForbiddenError("sign in to see tier lists");
      }
      return connectionFromPage(
        await context
          .actor(
            TierListsCollectionActorDescriptor,
            viewerCollectionActorId(viewerId),
          )
          .list(toPageArgs(args), args.section ?? null),
      );
    },
  }),
);

builder.mutationField("createTierList", (t) =>
  t.field({
    type: TierListType,
    description:
      "Creates a tier list. The id is minted here and the actor addressed " +
      "by it before any row exists — the provisional-id pattern every " +
      "`create` uses.",
    errors: {},
    args: { input: t.arg({ type: CreateTierListInput, required: true }) },
    resolve: (_root, args, context) =>
      context
        .actor(TierListActorDescriptor, randomUUID())
        .create(toCreateInput(args.input)),
  }),
);

builder.mutationField("updateTierList", (t) =>
  t.field({
    type: TierListType,
    description:
      "Header fields only — name, description, privacy, lock. Creator only.",
    errors: {},
    args: {
      tierListId: t.arg.id({ required: true }),
      input: t.arg({ type: UpdateTierListInput, required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(TierListActorDescriptor, String(args.tierListId))
        .update(
          patch(args.input, UPDATE_TIER_LIST) satisfies UpdateTierListInputType,
        ),
  }),
);

builder.mutationField("deleteTierList", (t) =>
  t.field({
    type: DeletedTierListType,
    description: "Creator only. Cascades its items in one statement.",
    errors: {},
    args: { tierListId: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      context.actor(TierListActorDescriptor, String(args.tierListId)).delete(),
  }),
);

builder.mutationField("addTierListItem", (t) =>
  t.field({
    type: TierListItemType,
    description:
      "Appends to the end of the given band (position computed in-turn, " +
      "no read-modify-write race). Refuses a duplicate entry.",
    errors: {},
    args: {
      tierListId: t.arg.id({ required: true }),
      input: t.arg({ type: AddTierListItemInput, required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(TierListActorDescriptor, String(args.tierListId))
        .addItem(toAddItemInput(args.input)),
  }),
);

builder.mutationField("removeTierListItem", (t) =>
  t.field({
    type: RemovedTierListItemType,
    description: "Removes the entry and renumbers the rest of its band.",
    errors: {},
    args: {
      tierListId: t.arg.id({ required: true }),
      tierListItemId: t.arg.id({ required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(TierListActorDescriptor, String(args.tierListId))
        .removeItem(String(args.tierListItemId)),
  }),
);

builder.mutationField("reorderTierListBand", (t) =>
  t.field({
    type: ReorderBandPayloadType,
    description:
      "orderedIds is the complete post-reorder membership of `band`, in " +
      "order. An id not currently in `band` is moved into it — a cross-band " +
      "drag is one call, and the band it moved out of is renumbered too, " +
      "in the same transaction.",
    errors: {},
    args: {
      tierListId: t.arg.id({ required: true }),
      band: t.arg.int({ required: true }),
      orderedIds: t.arg.idList({ required: true }),
    },
    resolve: async (_root, args, context): Promise<ReorderBandPayload> => {
      const items = await context
        .actor(TierListActorDescriptor, String(args.tierListId))
        .reorderBand(args.band, args.orderedIds.map(String));
      return { band: args.band, items };
    },
  }),
);

builder.mutationField("undoTierListEdit", (t) =>
  t.field({
    type: TierListHistoryStepType,
    description:
      "D4: takes back the latest edit not already undone (an add, a " +
      "removal, a move) and records that in the list's append-only history. " +
      "Creator only; nothing to undo is a `ConflictError`.",
    errors: {},
    args: { tierListId: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      context.actor(TierListActorDescriptor, String(args.tierListId)).undo(),
  }),
);

builder.mutationField("redoTierListEdit", (t) =>
  t.field({
    type: TierListHistoryStepType,
    description:
      "D4: puts back the latest undone edit. A new edit after an undo " +
      "clears what Redo can put back. Creator only; nothing to redo is a " +
      "`ConflictError`.",
    errors: {},
    args: { tierListId: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      context.actor(TierListActorDescriptor, String(args.tierListId)).redo(),
  }),
);
