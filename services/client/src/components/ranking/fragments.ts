/**
 * `/rankings`' documents — the successor of
 * `82450ad1:src/components/ranking/fragments.ts`.
 *
 * ## No reviewer list leaves the browser
 *
 * The old `GetRankingsQuery` took `$reviewers: String!`, a uuid array the
 * client built from the viewer's id and `user.friends`, and handed it to the
 * `item_scores` native query unchecked — a profiling primitive over a social
 * graph the viewer cannot read (`migration-plan.md`, D7). `Query.rankings`
 * takes a `RankingScope` enum instead and resolves the ids inside
 * `RankingsActor`. The restored two-button filter still drives it: its four
 * states are the enum's four members (`scopeFromReviewers` in `adapter.ts`).
 *
 * The old `GetRankingFriendsQuery` read the friend ids to build that list;
 * {@link GetRankingFriendsQuery} now reads one row, only to tell "you have no
 * friends yet" from "your friends have not reviewed anything" when the grid is
 * empty — `FRIENDS` no longer falls back to everyone.
 *
 * ## One fragment instead of four
 *
 * The four per-table `Ranking{Beer,Wine,Spirit,Coffee}` fragments (and no sake
 * or tea at all, so a top-rated sake never appeared) become `item { ...ItemCard }`
 * on the `Item` interface — the same card fields every restored grid reads.
 */

import { ItemCardFragment } from "@/components/item/ItemCard/fragments";
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/** The API caps `first` at 100 on every connection; `rankings` holds 200. */
export const RANKINGS_PAGE_SIZE = 100;

/**
 * One ranked item. `score`/`reviewCount` are the scope's `AVG`/`COUNT` and
 * are what the old card showed (`x.score`, `x.count`), not the item's global
 * `score`.
 */
export const RankingEntryFragment = graphql(
  `
  fragment RankingEntry on RankingEntry {
    __typename
    itemId
    itemType
    score
    reviewCount
    item {
      ...ItemCard
    }
  }
`,
  [ItemCardFragment],
);

/** Top-rated items for a scope, by average score then review count. */
export const GetRankingsQuery = graphql(
  `
  query GetRankings(
    $scope: RankingScope!
    $types: [ItemType!]
    $first: Int!
    $after: String
  ) {
    rankings(scope: $scope, types: $types, first: $first, after: $after) {
      __typename
      ... on RankingsConnection {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          cursor
          node {
            ...RankingEntry
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [RankingEntryFragment, ActorErrorFieldsFragment],
);

/**
 * Does the viewer have any friends at all? One edge is the test —
 * `FriendConnection.totalCount` is null (A7d item 1).
 */
export const GetRankingFriendsQuery = graphql(
  `
  query GetRankingFriends {
    myFriends(first: 1) {
      __typename
      ... on FriendConnection {
        edges {
          cursor
          node {
            user {
              id
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);
