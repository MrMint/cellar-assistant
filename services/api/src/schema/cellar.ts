/**
 * The cellar aggregate's GraphQL surface — B1 (migration plan §2.1, §8.3).
 *
 * Every field here is one `CellarActor` call. There is no database in this
 * process and no `where` DSL in this schema: `Query.cellar` names an actor id,
 * and each mutation is an imperative command (§8.3, "no `insert_`, `update_`,
 * `delete_` prefixes, no `_by_pk`, no `_aggregate`") that maps onto exactly one
 * method of `CellarActorInterface`.
 *
 * Three shapes are worth pointing at:
 *
 * - **`CellarItem.item` is the `Item` interface, resolved by id.** The resolver
 *   returns `itemActorId(cellarItem.item)` and `plugin-dataloader` batches the
 *   page's ids into parallel `ItemActor.get` calls (§1.5) — the six-column
 *   polymorphic foreign key never surfaces, here or in the DTO.
 * - **`Cellar.items` and `Cellar.checkIns` are connections on the *object*,
 *   not root fields.** §1.5: "Child lists are paged from the owner:
 *   `CellarActor.items(ctx, page)`." There is no `checkIns` root field; the
 *   item-scoped one belongs to `CheckInsCollectionActor` in C3.
 * - **`bulkCheckIn` returns a connection, not a list.** `schema.test.ts`
 *   refuses any composite list that is not a connection's `edges` (§1.5), and
 *   a mutation payload is not exempt from "there is no unbounded read".
 *
 * Visibility is decided in the actor and nowhere near here (§1.6). A cellar
 * the viewer may not see comes back as `NotFoundError` on the result union,
 * which is the same answer as a cellar that does not exist — deliberately.
 */
import { randomUUID } from "node:crypto";
import type {
  AddCellarItemInput as AddCellarItemInputType,
  CellarDto,
  CellarItemDto,
  CellarItemSource,
  CheckInDto,
  CollectionStatsDto,
  CreateCellarInput as CreateCellarInputType,
  DeletedCellar,
  ItemRef,
  ItemType,
  ItemTypeCountsDto,
  PermissionType,
  RemovedCellarItem,
  UpdateCellarInput as UpdateCellarInputType,
  UpdateCellarItemInput as UpdateCellarItemInputType,
} from "@cellar-assistant/contracts";
import {
  CELLAR_ITEM_SORTS,
  CELLAR_ITEM_SOURCES,
  CELLAR_ITEM_STATUSES,
  CellarActorDescriptor,
  CellarsCollectionActorDescriptor,
  ForbiddenError,
  itemActorId,
  offsetPage,
  viewerCollectionActorId,
} from "@cellar-assistant/contracts";
import type { ApiContext } from "../context.ts";
import { builder } from "./builder.ts";
import { PermissionTypeEnum } from "./enums.ts";
import { ItemInterface, ItemTypeEnum } from "./item.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";
import { type PatchPolicy, patch, present } from "./patch.ts";
import { Viewer } from "./viewer.ts";

/* -------------------------------------------------------------------------- */
/* Enums                                                                       */
/* -------------------------------------------------------------------------- */

const CellarItemSortEnum = builder.enumType("CellarItemSort", {
  description:
    "In-cellar ordering. The actor holds every row (§2.1), so these sort a " +
    "cached list rather than issuing a query.",
  values: CELLAR_ITEM_SORTS,
});

const CellarItemStatusEnum = builder.enumType("CellarItemStatus", {
  description:
    "Which bottles a cellar list holds. ACTIVE (not emptied) is the default: " +
    "the old UI hid empty bottles from every cellar list (UI parity decision 4).",
  values: CELLAR_ITEM_STATUSES,
});

/**
 * Six named counts rather than a `[{type, count}]` list: §1.5 refuses any
 * composite list that is not a connection's `edges`, and these are exactly the
 * six the old cards read (UI parity G1).
 */
export const ItemTypeCountsType = builder
  .objectRef<ItemTypeCountsDto>("ItemTypeCounts")
  .implement({
    description: "A count per item type, and their sum.",
    fields: (t) => ({
      total: t.exposeInt("total"),
      wine: t.int({ resolve: (counts) => counts.byType.WINE }),
      beer: t.int({ resolve: (counts) => counts.byType.BEER }),
      spirit: t.int({ resolve: (counts) => counts.byType.SPIRIT }),
      coffee: t.int({ resolve: (counts) => counts.byType.COFFEE }),
      sake: t.int({ resolve: (counts) => counts.byType.SAKE }),
      tea: t.int({ resolve: (counts) => counts.byType.TEA }),
    }),
  });

const CollectionStatsType = builder
  .objectRef<CollectionStatsDto>("CollectionStats")
  .implement({
    description:
      "The viewer's own collection: cellars they created or co-own, and the " +
      "distinct items with a bottle in one of them. Never other people's " +
      "cellars, however visible (UI parity G36).",
    fields: (t) => ({
      cellarCount: t.exposeInt("cellarCount"),
      itemCounts: t.field({
        type: ItemTypeCountsType,
        description:
          "Distinct items per type, whatever their bottles' state — what the " +
          "old /search line counted.",
        resolve: (stats) => stats.itemCounts,
      }),
    }),
  });

const CellarItemSourceEnum = builder.enumType("CellarItemSource", {
  description: "`cellar_items.source_type` — how the bottle got here.",
  values: CELLAR_ITEM_SOURCES,
});

/* -------------------------------------------------------------------------- */
/* Object types                                                                */
/* -------------------------------------------------------------------------- */

export const CheckInType = builder.objectRef<CheckInDto>("CheckIn").implement({
  description:
    "One drink from one cellar item. `userId` is who it is *about* — " +
    "`bulkCheckIn` writes rows on behalf of friends.",
  fields: (t) => ({
    id: t.exposeID("id"),
    userId: t.exposeID("userId"),
    cellarItemId: t.exposeID("cellarItemId"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});

export const CheckInConnection = builder.connectionObject(
  { type: CheckInType, name: "CheckInConnection" },
  { name: "CheckInEdge" },
);

export const CellarItemType = builder
  .objectRef<CellarItemDto>("CellarItem")
  .implement({
    description:
      "A bottle in a cellar: the item, plus what has happened to it.",
    fields: (t) => ({
      id: t.exposeID("id"),
      cellarId: t.exposeID("cellarId"),
      createdBy: t.exposeID("createdBy", {
        description: "Who put it in the cellar.",
      }),
      item: t.field({
        type: ItemInterface,
        description:
          "Resolved through the shared item DataLoader — one batched " +
          "`ItemActor.get` per page, not one per row (§1.5).",
        resolve: (cellarItem) => itemActorId(cellarItem.item),
      }),
      openAt: t.expose("openAt", { type: "DateTime", nullable: true }),
      emptyAt: t.expose("emptyAt", { type: "DateTime", nullable: true }),
      percentageRemaining: t.exposeFloat("percentageRemaining"),
      displayImageId: t.exposeID("displayImageId", { nullable: true }),
      sourceType: t.field({
        type: CellarItemSourceEnum,
        nullable: true,
        resolve: (cellarItem) => cellarItem.sourceType,
      }),
      sourcePlaceId: t.exposeID("sourcePlaceId", { nullable: true }),
      sourceMenuItemId: t.exposeID("sourceMenuItemId", { nullable: true }),
      distance: t.exposeFloat("distance", {
        nullable: true,
        description:
          "Cosine distance to `semanticQuery` (0–2). Null on any other page.",
      }),
      createdAt: t.expose("createdAt", { type: "DateTime" }),
      updatedAt: t.expose("updatedAt", { type: "DateTime" }),
    }),
  });

export const CellarItemConnection = builder.connectionObject(
  { type: CellarItemType, name: "CellarItemConnection" },
  { name: "CellarItemEdge" },
);

/**
 * One batch, N parallel `CellarActor.get` calls — §1.5's "Pothos resolves ids
 * through a DataLoader that batches into parallel entity-actor calls".
 *
 * C3's `CellarsCollectionActor` returns a page of cellar ids, and this is what
 * turns them into cellars. A per-key failure comes back as an `Error` rather
 * than being thrown, so one cellar that vanished between the list and the
 * fan-out does not fail the whole page — and `CellarActor.get` re-checks
 * visibility itself, so the collection's filter is not the only gate.
 */
const loadCellars = async (
  keys: readonly string[],
  context: ApiContext,
): Promise<readonly (CellarDto | Error)[]> =>
  await Promise.all(
    keys.map(async (key): Promise<CellarDto | Error> => {
      try {
        return await context.actor(CellarActorDescriptor, key).get();
      } catch (cause) {
        return cause instanceof Error ? cause : new Error(String(cause));
      }
    }),
  );

export const CellarType = builder
  .loadableObjectRef<CellarDto, string>("Cellar", {
    load: loadCellars,
    toKey: (cellar) => cellar.id,
  })
  .implement({
    description:
      "A collection. Visible when it is PUBLIC, or FRIENDS and you are a " +
      "friend of its creator, or you are its creator or a co-owner (§1.6).",
    fields: (t) => ({
      id: t.exposeID("id"),
      name: t.exposeString("name"),
      privacy: t.field({
        type: PermissionTypeEnum,
        resolve: (cellar) => cellar.privacy,
      }),
      createdById: t.exposeID("createdById"),
      coOwnerIds: t.exposeIDList("coOwnerIds", {
        description:
          "`cellar_owners`, excluding the creator — they own it by creating it.",
      }),
      itemCount: t.exposeInt("itemCount", {
        description: "Every bottle, emptied ones included.",
      }),
      itemCounts: t.field({
        type: ItemTypeCountsType,
        description:
          "Non-empty bottles per item type (UI parity G1). Bottles, not " +
          "distinct items: two bottles of one wine count 2.",
        resolve: (cellar) => cellar.itemCounts,
      }),
      createdAt: t.expose("createdAt", { type: "DateTime" }),
      updatedAt: t.expose("updatedAt", { type: "DateTime" }),

      items: t.field({
        type: CellarItemConnection,
        description: "What is in the cellar.",
        args: {
          ...t.arg.connectionArgs(),
          sort: t.arg({ type: CellarItemSortEnum, required: false }),
          semanticQuery: t.arg.string({
            required: false,
            description:
              "Free text. Orders by cosine distance to the phrase's embedding, " +
              "ties by name; overrides `sort`.",
          }),
          types: t.arg({
            type: [ItemTypeEnum],
            required: false,
            description:
              "Only these item types; omitted or empty means all six. Filters " +
              "before paging, so `totalCount` follows it.",
          }),
          status: t.arg({
            type: CellarItemStatusEnum,
            required: false,
            defaultValue: "ACTIVE",
            description:
              "Filters before paging, like `types`. Defaults to ACTIVE: empty " +
              "bottles are hidden unless asked for.",
          }),
        },
        resolve: async (cellar, args, context) =>
          connectionFromPage(
            await context.actor(CellarActorDescriptor, cellar.id).items({
              page: toPageArgs(args),
              // `?? null`, not the raw value: an omitted Pothos arg is
              // `undefined`, and `undefined` does not survive `JSON.stringify`
              // on the way to the sidecar — the actor would receive a
              // two-key object where it expects three.
              sort: args.sort ?? null,
              semanticQuery: args.semanticQuery ?? null,
              types: args.types ?? null,
              // An explicit `status: null` is read as the default rather than
              // as "no filter", which ALL already spells.
              status: args.status ?? "ACTIVE",
            }),
          ),
      }),

      checkIns: t.field({
        type: CheckInConnection,
        description:
          "This cellar's check-in history. Gated on the cellar's own " +
          "visibility, not on friendship with each drinker — see " +
          "`CellarActor`'s module doc for why the item-scoped list (C3) " +
          "differs.",
        args: t.arg.connectionArgs(),
        resolve: async (cellar, args, context) =>
          connectionFromPage(
            await context
              .actor(CellarActorDescriptor, cellar.id)
              .checkIns(toPageArgs(args)),
          ),
      }),
    }),
  });

const DeletedCellarType = builder
  .objectRef<DeletedCellar>("DeletedCellar")
  .implement({
    description: "The id of a cellar that is gone.",
    fields: (t) => ({ id: t.exposeID("id") }),
  });

const RemovedCellarItemType = builder
  .objectRef<RemovedCellarItem>("RemovedCellarItem")
  .implement({
    description: "The id of a cellar item that is gone.",
    fields: (t) => ({ id: t.exposeID("id") }),
  });

type BulkCheckInPayload = {
  readonly cellarItemId: string;
  readonly checkIns: readonly CheckInDto[];
};

const BulkCheckInPayloadType = builder
  .objectRef<BulkCheckInPayload>("BulkCheckInPayload")
  .implement({
    description: "The rows `bulkCheckIn` wrote, one per user id.",
    fields: (t) => ({
      cellarItemId: t.exposeID("cellarItemId"),
      checkIns: t.field({
        type: CheckInConnection,
        // A connection rather than `[CheckIn!]!` because §1.5 has no exception
        // for mutation payloads; the actor caps `userIds` at one page.
        args: t.arg.connectionArgs(),
        resolve: (payload, args) =>
          connectionFromPage(offsetPage(payload.checkIns, toPageArgs(args))),
      }),
    }),
  });

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

const ItemRefInput = builder.inputType("ItemRefInput", {
  description: "A typed reference to an item: which table, and which row.",
  fields: (t) => ({
    type: t.field({ type: ItemTypeEnum, required: true }),
    id: t.id({ required: true }),
  }),
});

const CreateCellarInput = builder.inputType("CreateCellarInput", {
  fields: (t) => ({
    name: t.string({ required: true }),
    privacy: t.field({ type: PermissionTypeEnum, required: false }),
    coOwnerIds: t.idList({
      required: false,
      description: "Co-owners besides you. You are filtered out if listed.",
    }),
  }),
});

const UpdateCellarInput = builder.inputType("UpdateCellarInput", {
  description:
    "Only the fields you pass are written. `coOwnerIds` is the complete new " +
    "set, not a delta — omit it to leave owners alone, pass [] to clear them " +
    "(null is a ValidationError). " +
    "Changing it requires being the creator, not merely an owner.",
  fields: (t) => ({
    name: t.string({ required: false }),
    privacy: t.field({ type: PermissionTypeEnum, required: false }),
    coOwnerIds: t.idList({ required: false }),
  }),
});

const AddCellarItemInput = builder.inputType("AddCellarItemInput", {
  fields: (t) => ({
    item: t.field({ type: ItemRefInput, required: true }),
    cellarItemId: t.id({
      required: false,
      description:
        "Mint it yourself to make the call idempotent (§8.4); otherwise the " +
        "server does.",
    }),
    percentageRemaining: t.float({ required: false }),
    displayImageId: t.id({ required: false }),
    openAt: t.field({ type: "DateTime", required: false }),
    emptyAt: t.field({ type: "DateTime", required: false }),
    sourceType: t.field({ type: CellarItemSourceEnum, required: false }),
    sourcePlaceId: t.id({ required: false }),
    sourceMenuItemId: t.id({ required: false }),
  }),
});

const UpdateCellarItemInput = builder.inputType("UpdateCellarItemInput", {
  fields: (t) => ({
    percentageRemaining: t.float({ required: false }),
    displayImageId: t.id({ required: false }),
    openAt: t.field({ type: "DateTime", required: false }),
    emptyAt: t.field({ type: "DateTime", required: false }),
  }),
});

/* -------------------------------------------------------------------------- */
/* Argument marshalling                                                        */
/* -------------------------------------------------------------------------- */

const toItemRef = (input: { type: ItemType; id: string }): ItemRef => ({
  type: input.type,
  id: String(input.id),
});

const toCreateInput = (input: {
  name: string;
  privacy?: PermissionType | null;
  coOwnerIds?: readonly string[] | null;
}): CreateCellarInputType => ({
  name: input.name,
  ...(present(input.privacy) ? { privacy: input.privacy } : {}),
  ...(present(input.coOwnerIds)
    ? { coOwnerIds: input.coOwnerIds.map(String) }
    : {}),
});

const UPDATE_CELLAR = {
  name: "keep",
  privacy: "keep",
  // The list replaces the co-owner set wholesale, so `[]` is how you clear
  // it. A nullable list input does accept an explicit `null`, distinct from
  // absent, but the actor has no meaning for it (`normaliseOwners` expects a
  // list), so it is refused rather than silently read as "leave it".
  coOwnerIds: { policy: "reject", map: (ids) => ids.map(String) },
} satisfies PatchPolicy<typeof UpdateCellarInput.$inferInput>;

const toAddItemInput = (input: {
  item: { type: ItemType; id: string };
  cellarItemId?: string | null;
  percentageRemaining?: number | null;
  displayImageId?: string | null;
  openAt?: string | null;
  emptyAt?: string | null;
  sourceType?: CellarItemSource | null;
  sourcePlaceId?: string | null;
  sourceMenuItemId?: string | null;
}): AddCellarItemInputType => ({
  item: toItemRef(input.item),
  ...(present(input.cellarItemId)
    ? { cellarItemId: String(input.cellarItemId) }
    : {}),
  ...(present(input.percentageRemaining)
    ? { percentageRemaining: input.percentageRemaining }
    : {}),
  displayImageId: input.displayImageId ?? null,
  openAt: input.openAt ?? null,
  emptyAt: input.emptyAt ?? null,
  sourceType: input.sourceType ?? null,
  sourcePlaceId: input.sourcePlaceId ?? null,
  sourceMenuItemId: input.sourceMenuItemId ?? null,
});

const UPDATE_CELLAR_ITEM = {
  percentageRemaining: "keep",
  displayImageId: "clearable",
  openAt: "clearable",
  emptyAt: "clearable",
} satisfies PatchPolicy<typeof UpdateCellarItemInput.$inferInput>;

/* -------------------------------------------------------------------------- */
/* Root fields                                                                 */
/* -------------------------------------------------------------------------- */

builder.queryField("cellar", (t) =>
  t.field({
    type: CellarType,
    description:
      "One cellar by id. `NotFoundError` covers both 'no such cellar' and " +
      "'not yours to see' — they are indistinguishable on purpose (§1.6).",
    errors: {},
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      context.actor(CellarActorDescriptor, String(args.id)).get(),
  }),
);

export const CellarConnection = builder.connectionObject(
  { type: CellarType, name: "CellarConnection" },
  { name: "CellarEdge" },
);

builder.queryField("myCellars", (t) =>
  t.field({
    type: CellarConnection,
    description:
      "`/cellars` — every cellar the viewer may see: their own, ones they " +
      "co-own, and other people's that are PUBLIC or FRIENDS-and-a-friend " +
      "(C3's `CellarsCollectionActor`, §2.2). The collection returns ids; " +
      "the `Cellar` DataLoader batches them into parallel `CellarActor.get` " +
      "calls (§1.5).",
    args: t.arg.connectionArgs(),
    errors: {},
    resolve: async (_root, args, context) => {
      const viewerId = context.ctx.viewerId;
      if (viewerId === null) throw new ForbiddenError("sign in to see cellars");
      const page = await context
        .actor(
          CellarsCollectionActorDescriptor,
          viewerCollectionActorId(viewerId),
        )
        .list(toPageArgs(args));
      return connectionFromPage(page);
    },
  }),
);

builder.mutationField("createCellar", (t) =>
  t.field({
    type: CellarType,
    description:
      "Creates a cellar. The id is minted here and the actor addressed by it " +
      "before any row exists — the provisional-id pattern every `create` uses.",
    errors: {},
    args: { input: t.arg({ type: CreateCellarInput, required: true }) },
    resolve: (_root, args, context) =>
      context
        .actor(CellarActorDescriptor, randomUUID())
        .create(toCreateInput(args.input)),
  }),
);

builder.mutationField("updateCellar", (t) =>
  t.field({
    type: CellarType,
    description:
      "Renames, re-privacies and re-owners a cellar in one transaction.",
    errors: {},
    args: {
      cellarId: t.arg.id({ required: true }),
      input: t.arg({ type: UpdateCellarInput, required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(CellarActorDescriptor, String(args.cellarId))
        .update(
          patch(args.input, UPDATE_CELLAR) satisfies UpdateCellarInputType,
        ),
  }),
);

builder.mutationField("deleteCellar", (t) =>
  t.field({
    type: DeletedCellarType,
    description:
      "The creator's alone. `ConflictError` if the cellar still holds items.",
    errors: {},
    args: { cellarId: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      context.actor(CellarActorDescriptor, String(args.cellarId)).delete(),
  }),
);

builder.mutationField("addItemToCellar", (t) =>
  t.field({
    type: CellarItemType,
    errors: {},
    args: {
      cellarId: t.arg.id({ required: true }),
      input: t.arg({ type: AddCellarItemInput, required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(CellarActorDescriptor, String(args.cellarId))
        .addItem(toAddItemInput(args.input)),
  }),
);

builder.mutationField("updateCellarItem", (t) =>
  t.field({
    type: CellarItemType,
    errors: {},
    args: {
      cellarId: t.arg.id({ required: true }),
      cellarItemId: t.arg.id({ required: true }),
      input: t.arg({ type: UpdateCellarItemInput, required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(CellarActorDescriptor, String(args.cellarId))
        .updateItem(
          String(args.cellarItemId),
          patch(
            args.input,
            UPDATE_CELLAR_ITEM,
          ) satisfies UpdateCellarItemInputType,
        ),
  }),
);

builder.mutationField("removeItemFromCellar", (t) =>
  t.field({
    type: RemovedCellarItemType,
    description: "Removes the bottle and the check-ins that point at it.",
    errors: {},
    args: {
      cellarId: t.arg.id({ required: true }),
      cellarItemId: t.arg.id({ required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(CellarActorDescriptor, String(args.cellarId))
        .removeItem(String(args.cellarItemId)),
  }),
);

builder.mutationField("setCellarItemPercentage", (t) =>
  t.field({
    type: CellarItemType,
    errors: {},
    args: {
      cellarId: t.arg.id({ required: true }),
      cellarItemId: t.arg.id({ required: true }),
      percentageRemaining: t.arg.float({ required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(CellarActorDescriptor, String(args.cellarId))
        .setItemPercentage(String(args.cellarItemId), args.percentageRemaining),
  }),
);

builder.mutationField("openCellarItem", (t) =>
  t.field({
    type: CellarItemType,
    description: "Idempotent: an already-open bottle keeps its `openAt`.",
    errors: {},
    args: {
      cellarId: t.arg.id({ required: true }),
      cellarItemId: t.arg.id({ required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(CellarActorDescriptor, String(args.cellarId))
        .openItem(String(args.cellarItemId)),
  }),
);

builder.mutationField("emptyCellarItem", (t) =>
  t.field({
    type: CellarItemType,
    description: "Idempotent, and implies open.",
    errors: {},
    args: {
      cellarId: t.arg.id({ required: true }),
      cellarItemId: t.arg.id({ required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(CellarActorDescriptor, String(args.cellarId))
        .emptyItem(String(args.cellarItemId)),
  }),
);

builder.mutationField("checkIn", (t) =>
  t.field({
    type: CheckInType,
    description:
      "Records that you drank from this bottle. Requires the cellar to be " +
      "visible to you.",
    errors: {},
    args: {
      cellarId: t.arg.id({ required: true }),
      cellarItemId: t.arg.id({ required: true }),
      checkInId: t.arg.id({
        required: false,
        description: "Mint it yourself to make the call idempotent (§8.4).",
      }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(CellarActorDescriptor, String(args.cellarId))
        .checkIn(
          String(args.cellarItemId),
          args.checkInId === null || args.checkInId === undefined
            ? undefined
            : String(args.checkInId),
        ),
  }),
);

builder.mutationField("bulkCheckIn", (t) =>
  t.field({
    type: BulkCheckInPayloadType,
    description:
      "Records the drink for you and your friends at the table. Every id " +
      "must be you or a friend of yours; one that is not rejects the call.",
    errors: {},
    args: {
      cellarId: t.arg.id({ required: true }),
      cellarItemId: t.arg.id({ required: true }),
      userIds: t.arg.idList({ required: true }),
    },
    resolve: async (_root, args, context): Promise<BulkCheckInPayload> => {
      const cellarItemId = String(args.cellarItemId);
      const written = await context
        .actor(CellarActorDescriptor, String(args.cellarId))
        .bulkCheckIn(cellarItemId, args.userIds.map(String));
      return { cellarItemId, checkIns: written };
    },
  }),
);

builder.objectField(Viewer, "collectionStats", (t) =>
  t.field({
    type: CollectionStatsType,
    description:
      "The /search landing line. Counts only cellars you created or co-own — " +
      "`myCellars` also lists other people's visible cellars, so summing it " +
      "over-counts (UI parity G36).",
    resolve: (viewer, _args, context) =>
      context
        .actor(
          CellarsCollectionActorDescriptor,
          viewerCollectionActorId(viewer.id),
        )
        .stats(),
  }),
);
