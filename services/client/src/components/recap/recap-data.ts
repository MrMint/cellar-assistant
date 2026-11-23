/**
 * L04 — the recap's two reads: the deck for a period (`/recap`, and the share
 * image route as the signed-in viewer) and the breadth stamps (Me). Both are
 * the viewer's own; neither takes a user.
 */
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql, type ResultOf } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import type { RecapCardView } from "./recap-copy";

const RecapCardFieldsFragment = graphql(`
  fragment RecapCardFields on RecapCard @_unmask {
    kind
    count
    newCount
    chips
  }
`);

const BreadthStampSetFragment = graphql(`
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

export type RecapData = Extract<
  ResultOf<typeof RecapQuery>["recap"],
  { __typename: "Recap" }
>;
type StampSet = RecapData["stamps"];
export type BreadthStampData = NonNullable<StampSet["styles"]>;

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
