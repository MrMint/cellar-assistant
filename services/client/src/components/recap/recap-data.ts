/**
 * L04 — the recap's two reads: the deck for a period (`/recap`, and the share
 * image route as the signed-in viewer) and the breadth stamps (Me). Both are
 * the viewer's own; neither takes a user.
 */
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql, type ResultOf } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";

export const RecapQuery = graphql(
  `
  query Recap($period: String!, $timeZone: String) {
    recap(period: $period, timeZone: $timeZone) {
      __typename
      ... on Recap {
        period
        timeZone
        cards {
          kind
          count
          newCount
          chips
          stamp {
            kind
            count
            tier
          }
        }
        stamps {
          kind
          count
          tier
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

export const BreadthStampsQuery = graphql(
  `
  query BreadthStamps {
    breadthStamps {
      __typename
      ... on QueryBreadthStampsSuccess {
        data {
          kind
          count
          tier
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

export type RecapData = Extract<
  ResultOf<typeof RecapQuery>["recap"],
  { __typename: "Recap" }
>;
export type RecapCardData = RecapData["cards"][number];
export type BreadthStampData = Extract<
  ResultOf<typeof BreadthStampsQuery>["breadthStamps"],
  { __typename: "QueryBreadthStampsSuccess" }
>["data"][number];

/** The deck, or `null` for anything else (refused, missing, unreachable). */
export const recapFromResult = (
  result: ResultOf<typeof RecapQuery> | null | undefined,
): RecapData | null => {
  const unwrapped = unwrapResult(result?.recap, "Recap");
  return unwrapped.ok ? unwrapped.data : null;
};

export const stampsFromResult = (
  result: ResultOf<typeof BreadthStampsQuery> | null | undefined,
): readonly BreadthStampData[] | null => {
  const unwrapped = unwrapResult(
    result?.breadthStamps,
    "QueryBreadthStampsSuccess",
  );
  return unwrapped.ok ? unwrapped.data.data : null;
};

/** The share image for card `index` of `period`: same-origin, owner-only. */
export const recapImagePath = (
  ownerId: string,
  period: string,
  index: number,
  timeZone: string,
): string =>
  `/api/recap/${encodeURIComponent(ownerId)}/${encodeURIComponent(period)}/${index}?tz=${encodeURIComponent(timeZone)}`;
