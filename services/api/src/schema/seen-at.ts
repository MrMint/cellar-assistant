/**
 * L10 (wave C seenat) · `Item.seenAt`: the places an item was seen on a
 * scanned menu or logged at, as far as the viewer may see them. Every rule is
 * the actor's (`ItemActor.seenAt`, composing `canSeePlace` and
 * `canSeeCheckInDetails`); this module only shapes the answer. A signed-out
 * viewer gets `[]` without a call, the same answer as an item seen nowhere.
 */
import type { SeenAtDto } from "@cellar-assistant/contracts";
import {
  ItemActorDescriptor,
  itemActorId,
  SEEN_AT_KINDS,
  SEEN_AT_MAX,
} from "@cellar-assistant/contracts";
import { builder } from "./builder.ts";
import { ItemInterface } from "./item.ts";
import { connectionFromPage } from "./pagination.ts";
import { LngLatInput } from "./place.ts";
import { PlaceStubType } from "./tier-list.ts";

const SeenAtKindEnum = builder.enumType("SeenAtKind", {
  description:
    "Why a place is in an item's Seen at: your own log there, a menu " +
    "scanned there, or a friend's log there (strongest first).",
  values: SEEN_AT_KINDS,
});

const SeenAtPlaceType = builder.objectRef<SeenAtDto>("SeenAtPlace").implement({
  description: "One place in an item's Seen at, with its strongest reason.",
  fields: (t) => ({
    place: t.field({
      type: PlaceStubType,
      resolve: (row) => ({ id: row.placeId }),
    }),
    placeName: t.exposeString("placeName"),
    kind: t.field({ type: SeenAtKindEnum, resolve: (row) => row.kind }),
    at: t.expose("at", {
      type: "DateTime",
      nullable: true,
      description: "When the menu was scanned, or the log made.",
    }),
    friendName: t.exposeString("friendName", {
      nullable: true,
      description: "FRIEND_LOG only: whose log it was.",
    }),
    distanceMeters: t.exposeFloat("distanceMeters", {
      nullable: true,
      description: "From `near`; null without it.",
    }),
  }),
});

const SeenAtConnection = builder.connectionObject(
  { type: SeenAtPlaceType, name: "SeenAtConnection" },
  { name: "SeenAtEdge" },
);

/** The whole answer is one page: the actor caps it at `SEEN_AT_MAX`. */
const onePage = (rows: readonly SeenAtDto[]) =>
  connectionFromPage({
    entries: rows.map((node, index) => ({ cursor: `offset:${index}`, node })),
    hasNextPage: false,
    hasPreviousPage: false,
    totalCount: rows.length,
  });

builder.interfaceField(ItemInterface, "seenAt", (t) =>
  t.field({
    type: SeenAtConnection,
    description:
      "L10: where this item was seen — on a menu scanned at a place you may " +
      "see, in your own logs, or in friends' logs they share with you. One " +
      "row per place; nearest first with `near`, newest first without. A " +
      "place or log you may not see is left out, never refused.",
    args: {
      near: t.arg({ type: LngLatInput, required: false }),
      first: t.arg.int({
        required: false,
        description: `At most ${SEEN_AT_MAX}.`,
      }),
    },
    resolve: async (item, args, context) => {
      if (context.ctx.viewerId === null) return onePage([]);
      return onePage(
        await context.actor(ItemActorDescriptor, itemActorId(item)).seenAt({
          near: args.near ?? null,
          first: args.first ?? null,
        }),
      );
    },
  }),
);
