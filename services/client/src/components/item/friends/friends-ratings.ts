import { graphql } from "@/lib/api/graphql";

/**
 * F-154, Cellars-Pour "Friends' ratings": the reads behind the sheet.
 *
 * The API has no "friends' reviews of this item" field: `Item.friendsScore`
 * is an average and a count, and `ItemReview.user` says nothing of
 * friendship. So the sheet joins two reads it already has, each at its
 * 100-row cap: your friends (`myFriends`) and the item's reviews. A friend
 * whose review falls past the first 100 is not listed (the server hand-off:
 * an `Item.friendsReviews` connection would make this one read).
 */
export const ItemFriendsRatingsFriendsQuery = graphql(`
  query ItemFriendsRatingsFriends {
    myFriends(first: 100) {
      __typename
      ... on FriendConnection {
        edges {
          node {
            user {
              id
            }
          }
        }
      }
    }
  }
`);

export const ItemFriendsRatingsReviewsQuery = graphql(`
  query ItemFriendsRatingsReviews($itemId: ID!, $type: ItemType!) {
    item(id: $itemId, type: $type) {
      __typename
      ... on QueryItemSuccess {
        data {
          __typename
          id
          reviews(first: 100) {
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
    }
  }
`);

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

/** Your friends' reviews among `reviews`, best score first, then by name. */
export function friendRatingRows(
  reviews: readonly FriendReview[],
  friendIds: ReadonlySet<string>,
): FriendRatingRow[] {
  return reviews
    .filter((review) => friendIds.has(review.userId) && review.user !== null)
    .map((review) => ({
      id: review.id,
      name: review.user?.displayName ?? "",
      avatarUrl: review.user?.avatarUrl ?? null,
      score: review.score,
      href: `/users/${review.userId}`,
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
