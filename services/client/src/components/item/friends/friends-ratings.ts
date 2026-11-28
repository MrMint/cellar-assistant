import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/**
 * F-154, Cellars-Pour "Friends' ratings": the read behind the sheet.
 *
 * `Item.friendsReviews` (B15C, H-127) is the reviews `friendsScore`
 * averages: one per friend, their newest, the friend set resolved on the
 * server from your own `friends` rows. So the sheet and the number beside it
 * agree, and a non-friend's review is never read at all.
 */
export const ItemFriendsRatingsQuery = graphql(
  `
  query ItemFriendsRatings($itemId: ID!, $type: ItemType!) {
    item(id: $itemId, type: $type) {
      __typename
      ... on QueryItemSuccess {
        data {
          __typename
          id
          friendsReviews(first: 100) {
            edges {
              node {
                __typename
                id
                score
                userId
                user {
                  __typename
                  id
                  displayName
                  avatarUrl
                }
              }
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

export type FriendReview = {
  readonly id: string;
  readonly score: number;
  readonly userId: string;
  readonly user: {
    readonly displayName: string;
    readonly avatarUrl: string | null;
  } | null;
};

export type FriendRatingRow = {
  readonly id: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly score: number;
  /** The friend's profile. */
  readonly href: string;
};

/** Your friends' reviews as rows, best score first, then by name. */
export function friendRatingRows(
  reviews: readonly FriendReview[],
): FriendRatingRow[] {
  return reviews
    .filter((review) => review.user !== null)
    .map((review) => ({
      id: review.id,
      name: review.user?.displayName ?? "",
      avatarUrl: review.user?.avatarUrl ?? null,
      score: review.score,
      href: `/users/${review.userId}`,
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
