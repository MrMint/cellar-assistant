/**
 * `Barcode` — B2 (migration plan §2.1 `BarcodeActor`; target-stack §7).
 *
 * Three fields, and the shape of them is the whole point of the workstream:
 *
 * - **`Query.barcode(code)`** answers the question a scanner actually has —
 *   "have we seen this before, and what is it?" — with the six-table reverse
 *   lookup already resolved into `Item`s.
 * - **`ensureBarcode`** is find-or-create. There is no `updateBarcode`, and
 *   that absence is deliberate: §2.1 says a `barcodes` row may be written
 *   "only on creation or admin", and today's Hasura permission (`filter: {}`
 *   over `[code, type]` for every signed-in user) is exactly the thing being
 *   removed. Re-typing an existing code returns `ForbiddenError` unless the
 *   caller is an admin.
 * - **`linkBarcodeItem`** points an item at a code, and refuses a caller who
 *   is not the item's creator. The item's `barcode_code` is written by
 *   `ItemActor.setBarcode` when the outbox delivers (§1.7), so the payload
 *   hands back the row id to correlate against rather than a mutated item.
 *
 * All three address `BarcodeActor(barcodeActorId(code, …))` — the canonical
 * code, never the argument as sent — so `012345678905` (UPC-A) and
 * `0012345678905` (EAN-13) reach one actor and one row, as do `abc123` and
 * `ABC123`. `ensureBarcode` passes its `type` as the symbology hint (it is
 * what tells an 8-digit UPC-E from an EAN-8); the other two have none to pass,
 * and a code a client got back from the API is already canonical, so it
 * re-canonicalises to itself (`packages/contracts/src/barcodes.ts`).
 */
import type {
  BarcodeDto,
  LinkedBarcodeItem,
} from "@cellar-assistant/contracts";
import {
  BarcodeActorDescriptor,
  barcodeActorId,
  itemActorId,
  offsetPage,
} from "@cellar-assistant/contracts";
import { builder } from "./builder.ts";
import { ItemConnection, ItemInterface, ItemTypeEnum } from "./item.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";

export const BarcodeType = builder.objectRef<BarcodeDto>("Barcode").implement({
  description:
    "A scanned code and everything pointing at it. `barcodes` is a " +
    "natural-key table that doubles as the uniqueness registry (§2.1).",
  fields: (t) => ({
    code: t.exposeString("code"),
    type: t.exposeString("type", {
      nullable: true,
      description: "`EAN13`, `UPC_A`, … free text today, not an enum.",
    }),
    items: t.field({
      type: ItemConnection,
      description:
        "What currently points at this code. Bounded by construction — a " +
        "barcode identifies one product — but a connection all the same: " +
        "§1.5 has no exception for a list the server believes is short. " +
        "Resolved through the shared item DataLoader.",
      args: t.arg.connectionArgs(),
      resolve: (barcode, args) =>
        connectionFromPage(
          offsetPage(barcode.items.map(itemActorId), toPageArgs(args)),
        ),
    }),
  }),
});

const LinkedBarcodeItemType = builder
  .objectRef<LinkedBarcodeItem>("LinkedBarcodeItem")
  .implement({
    description:
      "What `linkBarcodeItem` wrote. The item's own `barcode_code` is set " +
      "when the outbox delivers `ItemActor.setBarcode`, so this reports the " +
      "queued row rather than an already-updated item (§1.7).",
    fields: (t) => ({
      code: t.exposeString("code"),
      /**
       * The ids, beside the loaded item (A7c (5)).
       *
       * `item` alone forces a caller that only wants to navigate — the usual
       * case after a scan — to spread six inline fragments to recover the
       * pair it already knows the server has, and selecting the `itemId` it
       * expected instead was a `GRAPHQL_VALIDATION_FAILED` that gql.tada typed
       * `unknown` without `tsc` saying a word. These cost nothing: they are
       * already in the payload, whereas `item` is a DataLoader round trip.
       */
      itemId: t.id({ resolve: (linked) => linked.item.id }),
      itemType: t.field({
        type: ItemTypeEnum,
        resolve: (linked) => linked.item.type,
      }),
      item: t.field({
        type: ItemInterface,
        description:
          "The item itself, through the shared DataLoader. Prefer `itemId` " +
          "and `itemType` when you only need to address it.",
        resolve: (linked) => itemActorId(linked.item),
      }),
      outboxRowId: t.exposeID("outboxRowId", {
        nullable: true,
        description:
          "`outbox.id` of the queued `setBarcode`, or null when the item " +
          "already carried this code and nothing was enqueued.",
      }),
    }),
  });

builder.queryField("barcode", (t) =>
  t.field({
    type: BarcodeType,
    description:
      "One barcode by its code. `NotFoundError` when nobody has registered it.",
    errors: {},
    args: { code: t.arg.string({ required: true }) },
    resolve: (_root, args, context) =>
      context.actor(BarcodeActorDescriptor, barcodeActorId(args.code)).get(),
  }),
);

builder.mutationField("ensureBarcode", (t) =>
  t.field({
    type: BarcodeType,
    description:
      "Find-or-create. Naturally idempotent on the primary key. Changing " +
      "the `type` of a code that already has one is admin-only (§2.1: " +
      "'only on creation or admin').",
    errors: {},
    args: {
      code: t.arg.string({ required: true }),
      type: t.arg.string({ required: false }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(BarcodeActorDescriptor, barcodeActorId(args.code, args.type))
        .ensure({ type: args.type ?? null }),
  }),
);

builder.mutationField("linkBarcodeItem", (t) =>
  t.field({
    type: LinkedBarcodeItemType,
    description:
      "Point an item at a code. The item's creator only — this is the write " +
      "today's empty-filter `barcodes` update permission lets anybody make.",
    errors: {},
    args: {
      code: t.arg.string({ required: true }),
      itemType: t.arg({ type: ItemTypeEnum, required: true }),
      itemId: t.arg.id({ required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(BarcodeActorDescriptor, barcodeActorId(args.code))
        .linkItem({
          itemType: args.itemType,
          itemId: String(args.itemId),
        }),
  }),
);
