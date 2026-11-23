/**
 * L04 — the recap deck and breadth stamps.
 *
 * | field | from |
 * |---|---|
 * | `Query.recap(period, timeZone)` | `RecapActor.recap` |
 * | `Query.breadthStamps` | `RecapActor.stamps` |
 *
 * Both read the **signed-in viewer's own** drink log: there is no argument
 * naming whose recap, so another user's cannot be addressed at all (L16), and
 * an anonymous caller is a typed `ForbiddenError`. Every number is a count of
 * distinct things (contracts `recap.ts`).
 */
import type {
  BreadthStampDto,
  RecapCardDto,
  RecapDto,
} from "@cellar-assistant/contracts";
import {
  BREADTH_STAMP_KINDS,
  ForbiddenError,
  RECAP_CARD_KINDS,
  RecapActorDescriptor,
  recapActorId,
} from "@cellar-assistant/contracts";
import type { ApiContext } from "../context.ts";
import { builder } from "./builder.ts";
import { ItemTypeEnum } from "./item.ts";

const requireViewer = (context: ApiContext, what: string): string => {
  const viewerId = context.ctx.viewerId;
  if (viewerId === null) throw new ForbiddenError(`sign in to ${what}`);
  return viewerId;
};

const BreadthStampKindEnum = builder.enumType("BreadthStampKind", {
  description:
    "What a breadth stamp counts: distinct styles, regions, item types or " +
    "recipes made. Never volume or frequency.",
  values: BREADTH_STAMP_KINDS,
});

const RecapCardKindEnum = builder.enumType("RecapCardKind", {
  values: RECAP_CARD_KINDS,
});

const BreadthStampType = builder
  .objectRef<BreadthStampDto>("BreadthStamp")
  .implement({
    description: "A count-of-distinct achievement from the viewer's drink log.",
    fields: (t) => ({
      kind: t.field({ type: BreadthStampKindEnum, resolve: (s) => s.kind }),
      count: t.exposeInt("count", {
        description: "How many distinct things of this kind.",
      }),
      tier: t.exposeInt("tier", {
        description: "The highest tier `count` has reached.",
      }),
    }),
  });

const RecapCardType = builder.objectRef<RecapCardDto>("RecapCard").implement({
  description:
    "One card of the deck. Cards below their data threshold are skipped, " +
    "never padded.",
  fields: (t) => ({
    kind: t.field({ type: RecapCardKindEnum, resolve: (c) => c.kind }),
    count: t.exposeInt("count"),
    newCount: t.exposeInt("newCount", { nullable: true }),
    chips: t.stringList({ resolve: (c) => [...c.chips] }),
    itemTypes: t.field({
      type: [ItemTypeEnum],
      resolve: (c) => [...c.itemTypes],
    }),
    stamp: t.field({
      type: BreadthStampType,
      nullable: true,
      resolve: (c) => c.stamp,
    }),
  }),
});

const RecapType = builder.objectRef<RecapDto>("Recap").implement({
  fields: (t) => ({
    period: t.exposeString("period", {
      description: "`YYYY-MM` or `YYYY`.",
    }),
    timeZone: t.exposeString("timeZone"),
    cards: t.field({ type: [RecapCardType], resolve: (r) => [...r.cards] }),
    stamps: t.field({
      type: [BreadthStampType],
      description: "Stamps held at the end of the period.",
      resolve: (r) => [...r.stamps],
    }),
  }),
});

builder.queryField("recap", (t) =>
  t.field({
    type: RecapType,
    description:
      "L04: the viewer's own recap deck for a month (`2026-10`) or a year " +
      "(`2026`). Signed-in only; there is no argument naming whose recap.",
    errors: {},
    args: {
      period: t.arg.string({ required: true }),
      timeZone: t.arg.string({
        required: false,
        description: "IANA zone the period is read in (default UTC).",
      }),
    },
    resolve: (_root, args, context) => {
      const viewerId = requireViewer(context, "see your recap");
      return context
        .actor(RecapActorDescriptor, recapActorId(viewerId))
        .recap({ period: args.period, timeZone: args.timeZone ?? null });
    },
  }),
);

builder.queryField("breadthStamps", (t) =>
  t.field({
    type: [BreadthStampType],
    description: "L04: the viewer's breadth stamps over their whole drink log.",
    errors: {},
    resolve: async (_root, _args, context) => {
      const viewerId = requireViewer(context, "see your stamps");
      return [
        ...(await context
          .actor(RecapActorDescriptor, recapActorId(viewerId))
          .stamps()),
      ];
    },
  }),
);
