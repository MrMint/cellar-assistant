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
  TierListEntryRef,
  TierListEntryType,
  TierListItemDto,
  UpdateTierListInput as UpdateTierListInputType,
} from "@cellar-assistant/contracts";
import {
  ForbiddenError,
  itemActorId,
  offsetPage,
  TIER_LIST_ENTRY_TYPES,
  TierListActorDescriptor,
  TierListsCollectionActorDescriptor,
  viewerCollectionActorId,
} from "@cellar-assistant/contracts";
import type { ApiContext } from "../context.ts";
import { builder } from "./builder.ts";
import { PermissionTypeEnum } from "./enums.ts";
import { ItemInterface } from "./item.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";
import { type PatchPolicy, patch, present } from "./patch.ts";

/* -------------------------------------------------------------------------- */
/* Enums                                                                       */
/* -------------------------------------------------------------------------- */

const TierListEntryTypeEnum = builder.enumType("TierListEntryType", {
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

export const TierListType = builder
  .loadableObjectRef<TierListDto, string>("TierList", {
    load: loadTierLists,
    toKey: (tierList) => tierList.id,
  })
  .implement({
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
      contentUpdatedAt: t.expose("contentUpdatedAt", { type: "DateTime" }),
      createdAt: t.expose("createdAt", { type: "DateTime", nullable: true }),
      updatedAt: t.expose("updatedAt", { type: "DateTime", nullable: true }),

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
      "the map's tier-list filter use.",
    args: t.arg.connectionArgs(),
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
          .list(toPageArgs(args)),
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
