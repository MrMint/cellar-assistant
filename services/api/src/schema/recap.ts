/**
 * L04 — the recap deck and breadth stamps.
 *
 * | field | from |
 * |---|---|
 * | `Query.recap(period, timeZone)` | `RecapActor.recap` |
 * | `Query.breadthStamps` | `RecapActor.stamps` |
 * | `Query.recapPeriods(kind, timeZone)` | `RecapActor.periods` |
 *
 * Both read the **signed-in viewer's own** drink log: there is no argument
 * naming whose recap, so another user's cannot be addressed at all (L16), and
 * an anonymous caller is a typed `ForbiddenError`. Every number is a count of
 * distinct things (contracts `recap.ts`).
 */
import type {
  BreadthStampDto,
  BreadthStampKind,
  RecapCardDto,
  RecapDto,
  RecapTotalsDto,
} from "@cellar-assistant/contracts";
import {
  BREADTH_STAMP_KINDS,
  ForbiddenError,
  RECAP_CARD_KINDS,
  RECAP_PERIOD_KINDS,
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

/**
 * The four stamp kinds as one object, a field each (null until earned) — not
 * a list: §1.5 allows no unbounded list read, and this one has exactly four
 * possible members.
 */
type StampSet = readonly BreadthStampDto[];
const stampOf = (set: StampSet, kind: BreadthStampKind) =>
  set.find((stamp) => stamp.kind === kind) ?? null;

const BreadthStampsType = builder
  .objectRef<StampSet>("BreadthStamps")
  .implement({
    description:
      "The viewer's breadth stamps, one field per kind; null until earned.",
    fields: (t) => ({
      styles: t.field({
        type: BreadthStampType,
        nullable: true,
        resolve: (set) => stampOf(set, "STYLES"),
      }),
      regions: t.field({
        type: BreadthStampType,
        nullable: true,
        resolve: (set) => stampOf(set, "REGIONS"),
      }),
      types: t.field({
        type: BreadthStampType,
        nullable: true,
        resolve: (set) => stampOf(set, "TYPES"),
      }),
      recipes: t.field({
        type: BreadthStampType,
        nullable: true,
        resolve: (set) => stampOf(set, "RECIPES"),
      }),
    }),
  });

const RecapCardType = builder.objectRef<RecapCardDto>("RecapCard").implement({
  description:
    "One card of the deck. Cards below their data threshold are skipped " +
    "(null), never padded.",
  fields: (t) => ({
    kind: t.field({ type: RecapCardKindEnum, resolve: (c) => c.kind }),
    count: t.exposeInt("count"),
    newCount: t.exposeInt("newCount", { nullable: true }),
    chips: t.stringList({ resolve: (c) => [...c.chips] }),
    itemTypes: t.field({
      type: [ItemTypeEnum],
      resolve: (c) => [...c.itemTypes],
    }),
  }),
});

type CardSet = readonly RecapCardDto[];
const cardOf = (set: CardSet, kind: RecapCardDto["kind"]) =>
  set.find((card) => card.kind === kind) ?? null;
const cardField =
  (kind: RecapCardDto["kind"]) =>
  (set: CardSet): RecapCardDto | null =>
    cardOf(set, kind);

/**
 * The deck as one object, a field per card kind (null when skipped), plus the
 * stamps earned inside the period. A fixed shape rather than a list (§1.5);
 * the client orders it (`deckOf`).
 */
const RecapCardsType = builder.objectRef<CardSet>("RecapCards").implement({
  fields: (t) => ({
    newToYou: t.field({
      type: RecapCardType,
      nullable: true,
      resolve: cardField("NEW_TO_YOU"),
    }),
    types: t.field({
      type: RecapCardType,
      nullable: true,
      resolve: cardField("TYPES"),
    }),
    styles: t.field({
      type: RecapCardType,
      nullable: true,
      resolve: cardField("STYLES"),
    }),
    regions: t.field({
      type: RecapCardType,
      nullable: true,
      resolve: cardField("REGIONS"),
    }),
    recipes: t.field({
      type: RecapCardType,
      nullable: true,
      resolve: cardField("RECIPES"),
    }),
    topRated: t.field({
      type: RecapCardType,
      nullable: true,
      resolve: cardField("TOP_RATED"),
    }),
    earned: t.field({
      type: BreadthStampsType,
      description: "Stamps whose tier was crossed inside the period.",
      resolve: (set) =>
        set.flatMap((card) =>
          card.kind === "STAMP" && card.stamp !== null ? [card.stamp] : [],
        ),
    }),
  }),
});

const RecapPeriodKindEnum = builder.enumType("RecapPeriodKind", {
  description: "The granularity of a recap period: `YYYY-MM` or `YYYY`.",
  values: RECAP_PERIOD_KINDS,
});

const RecapTotalsType = builder
  .objectRef<RecapTotalsDto>("RecapTotals")
  .implement({
    description:
      "MC-recap / L4: what the viewer did in the period. Their own rows only.",
    fields: (t) => ({
      checkIns: t.exposeInt("checkIns", {
        description: "Drink-log entries about the viewer, dated in the period.",
      }),
      ratings: t.exposeInt("ratings", {
        description:
          "The viewer's item ratings (stars) created or changed in the period.",
      }),
      bottlesAdded: t.exposeInt("bottlesAdded", {
        description:
          "Bottles the viewer added, in any cellar; never a co-owner's.",
      }),
    }),
  });

const RecapType = builder.objectRef<RecapDto>("Recap").implement({
  fields: (t) => ({
    period: t.exposeString("period", {
      description: "`YYYY-MM` or `YYYY`.",
    }),
    timeZone: t.exposeString("timeZone"),
    totals: t.field({ type: RecapTotalsType, resolve: (r) => r.totals }),
    cards: t.field({ type: RecapCardsType, resolve: (r) => r.cards }),
    stamps: t.field({
      type: BreadthStampsType,
      description: "Stamps held at the end of the period.",
      resolve: (r) => r.stamps,
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
    type: BreadthStampsType,
    description: "L04: the viewer's breadth stamps over their whole drink log.",
    errors: {},
    resolve: (_root, _args, context) => {
      const viewerId = requireViewer(context, "see your stamps");
      return context
        .actor(RecapActorDescriptor, recapActorId(viewerId))
        .stamps();
    },
  }),
);

builder.queryField("recapPeriods", (t) =>
  t.field({
    type: ["String"],
    description:
      "MC-recap: the viewer's periods with any activity, newest first, in " +
      "`recap(period)`'s format (`YYYY-MM` or `YYYY`). Signed-in only.",
    errors: {},
    args: {
      kind: t.arg({ type: RecapPeriodKindEnum, required: true }),
      timeZone: t.arg.string({
        required: true,
        description: "IANA zone the periods are read in.",
      }),
    },
    resolve: async (_root, args, context) => {
      const viewerId = requireViewer(context, "see your recaps");
      return [
        ...(await context
          .actor(RecapActorDescriptor, recapActorId(viewerId))
          .periods({ kind: args.kind, timeZone: args.timeZone })),
      ];
    },
  }),
);
