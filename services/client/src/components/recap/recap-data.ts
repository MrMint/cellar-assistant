/**
 * L04 — the recap's two reads: the deck for a period (`/recap`, and the share
 * image route as the signed-in viewer) and the breadth stamps (Me). Both are
 * the viewer's own; neither takes a user.
 */
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql, type ResultOf } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import {
  type RecapCardView,
  type RecapTotals,
  recapEndStats,
} from "./recap-copy";

export const RecapCardFieldsFragment = graphql(`
  fragment RecapCardFields on RecapCard @_unmask {
    kind
    count
    newCount
    chips
  }
`);

export const BreadthStampSetFragment = graphql(`
  fragment BreadthStampSetFields on BreadthStamps @_unmask {
    __typename
    styles {
      kind
      count
      tier
    }
    regions {
      kind
      count
      tier
    }
    types {
      kind
      count
      tier
    }
    recipes {
      kind
      count
      tier
    }
  }
`);

export const RecapQuery = graphql(
  `
  query Recap($period: String!, $timeZone: String) {
    recap(period: $period, timeZone: $timeZone) {
      __typename
      ... on Recap {
        period
        timeZone
        totals {
          checkIns
          ratings
          bottlesAdded
        }
        cards {
          newToYou {
            ...RecapCardFields
          }
          types {
            ...RecapCardFields
          }
          styles {
            ...RecapCardFields
          }
          regions {
            ...RecapCardFields
          }
          recipes {
            ...RecapCardFields
          }
          topRated {
            ...RecapCardFields
          }
          earned {
            ...BreadthStampSetFields
          }
        }
        stamps {
          ...BreadthStampSetFields
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment, RecapCardFieldsFragment, BreadthStampSetFragment],
);

export const BreadthStampsQuery = graphql(
  `
  query BreadthStamps {
    breadthStamps {
      __typename
      ...BreadthStampSetFields
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment, BreadthStampSetFragment],
);

/**
 * MC-recap: the periods with a recap, newest first. Months and years are two
 * reads (one `kind` each), merged by `recapPeriodList`.
 */
export const RecapPeriodsQuery = graphql(
  `
  query RecapPeriods($timeZone: String!) {
    months: recapPeriods(kind: MONTH, timeZone: $timeZone) {
      __typename
      ... on QueryRecapPeriodsSuccess {
        data
      }
      ...ActorErrorFields
    }
    years: recapPeriods(kind: YEAR, timeZone: $timeZone) {
      __typename
      ... on QueryRecapPeriodsSuccess {
        data
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/** The months and years with a recap, or `null` while unread or refused. */
export const periodsFromResult = (
  result: ResultOf<typeof RecapPeriodsQuery> | null | undefined,
): { months: string[]; years: string[] } | null => {
  const months = unwrapResult(result?.months, "QueryRecapPeriodsSuccess");
  const years = unwrapResult(result?.years, "QueryRecapPeriodsSuccess");
  return months.ok && years.ok
    ? { months: [...months.data.data], years: [...years.data.data] }
    : null;
};

export type RecapData = Extract<
  ResultOf<typeof RecapQuery>["recap"],
  { __typename: "Recap" }
>;
type StampSet = RecapData["stamps"];
export type BreadthStampData = NonNullable<StampSet["styles"]>;
export type RecapTotalsData = RecapData["totals"];

/** A stamp set's earned stamps, in `BREADTH_STAMP_KINDS` order. */
export const stampsOf = (
  set: StampSet | null | undefined,
): BreadthStampData[] =>
  set == null
    ? []
    : [set.styles, set.regions, set.types, set.recipes].flatMap((stamp) =>
        stamp == null ? [] : [stamp],
      );

/**
 * The deck in its one order — new to you, kinds, styles, regions, recipes,
 * top rated, then a card per stamp earned in the period — shared by the deck
 * and the share-image route, so card N is the same card on both.
 */
export const deckOf = (recap: RecapData): RecapCardView[] => {
  const c = recap.cards;
  const cards: RecapCardView[] = [
    c.newToYou,
    c.types,
    c.styles,
    c.regions,
    c.recipes,
    c.topRated,
  ].flatMap((card) =>
    card == null
      ? []
      : [
          {
            kind: card.kind,
            count: card.count,
            newCount: card.newCount ?? null,
            chips: card.chips,
            stamp: null,
          },
        ],
  );
  for (const stamp of stampsOf(c.earned)) {
    cards.push({
      kind: "STAMP",
      count: stamp.count,
      newCount: null,
      chips: [],
      stamp,
    });
  }
  return cards;
};

/** The deck, or `null` for anything else (refused, missing, unreachable). */
export const recapFromResult = (
  result: ResultOf<typeof RecapQuery> | null | undefined,
): RecapData | null => {
  const unwrapped = unwrapResult(result?.recap, "Recap");
  return unwrapped.ok ? unwrapped.data : null;
};

/**
 * Where the deck's read stands (CR-7). Only a recap that came back is a deck
 * (an empty one is the honest "too little logged"); a transport error or a
 * refusal is `failed`, never mistaken for an empty month.
 */
export type RecapStatus = "loading" | "failed" | "ready";

export const recapStatus = (read: {
  fetching: boolean;
  error?: unknown;
  data?: ResultOf<typeof RecapQuery> | null;
}): RecapStatus => {
  if (recapFromResult(read.data) !== null) return "ready";
  if (read.fetching) return "loading";
  if (read.error !== undefined || read.data !== undefined) return "failed";
  return "loading";
};

/** The viewer's stamps, or `null` on any refusal. */
export const stampsFromResult = (
  result: ResultOf<typeof BreadthStampsQuery> | null | undefined,
): BreadthStampData[] | null => {
  const unwrapped = unwrapResult(result?.breadthStamps, "BreadthStamps");
  return unwrapped.ok ? stampsOf(unwrapped.data) : null;
};

/** The share image for card `index` of `period`: same-origin, owner-only. */
export const recapImagePath = (
  ownerId: string,
  period: string,
  index: number,
  timeZone: string,
): string =>
  `/api/recap/${encodeURIComponent(ownerId)}/${encodeURIComponent(period)}/${index}?tz=${encodeURIComponent(timeZone)}`;

/** The end card's face: the deck's counts as tiles, and the period's totals. */
export type RecapEndView = {
  readonly kind: "END";
  readonly stats: readonly { readonly value: number; readonly label: string }[];
  readonly totals: RecapTotals;
};

/** What a share image draws: one of the deck's cards, or the end card. */
export type RecapShareFace = RecapCardView | RecapEndView;

/**
 * Face `index` of the shareable deck: the cards in `deckOf` order, then the
 * end card (SR-5). `undefined` past the end, or for an empty deck, which has
 * no end card to share.
 */
export const shareFaceAt = (
  recap: RecapData,
  index: number,
): RecapShareFace | undefined => {
  const deck = deckOf(recap);
  if (index < deck.length) return deck[index];
  if (index > deck.length || deck.length === 0) return undefined;
  return {
    kind: "END",
    stats: recapEndStats(deck),
    totals: {
      checkIns: recap.totals.checkIns,
      ratings: recap.totals.ratings,
      bottlesAdded: recap.totals.bottlesAdded,
    },
  };
};
