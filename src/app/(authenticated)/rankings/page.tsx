"use client";

import { Grid, Stack, Typography } from "@mui/joy";
import { useUserId } from "@nhost/nextjs";
import { graphql } from "@shared/gql";
import { ItemType, Item_Score_Bool_Exp_Bool_Exp } from "@shared/gql/graphql";
import { useRouter, useSearchParams } from "next/navigation";
import { defaultTo, isEmpty, isNil, isNotNil, nth, without } from "ramda";
import { startTransition, useOptimistic } from "react";
import { useQuery } from "urql";
import { CellarItemsFilter } from "@/components/cellar/CellarItemsFilter";
import { ItemCard, ItemCardItem } from "@/components/item/ItemCard";
import {
  RankingsFilter,
  RankingsFilterValue,
} from "@/components/ranking/RankingsFilter";
import { formatItemType, getItemType } from "@/utilities";
import {
  useReviewersFilterState,
  useScrollRestore,
  useTypesFilterState,
} from "@/utilities/hooks";

const friendsQuery = graphql(`
  query FriendsQuery($userId: uuid!) {
    user(id: $userId) {
      friends {
        friend_id
      }
    }
  }
`);

const rankingQuery = graphql(`
  query RankingQuery(
    $userId: uuid!
    $reviewers: String!
    $where: item_score_bool_exp_bool_exp
  ) {
    item_scores(
      args: { reviewers: $reviewers }
      order_by: { score: desc, count: desc }
      where: $where
      limit: 200
    ) {
      score
      count
      beer {
        id
        name
        vintage
        __typename
        item_favorites(where: { user_id: { _eq: $userId } }) {
          id
        }
        user_reviews: reviews_aggregate(
          where: { user_id: { _eq: $userId } }
          limit: 1
        ) {
          aggregate {
            count
          }
        }
        item_favorites_aggregate {
          ...favoriteFragment
        }
        item_images(limit: 1) {
          ...imageFragment
        }
      }
      wine {
        id
        name
        vintage
        __typename
        item_favorites(where: { user_id: { _eq: $userId } }) {
          id
        }
        user_reviews: reviews_aggregate(
          where: { user_id: { _eq: $userId } }
          limit: 1
        ) {
          aggregate {
            count
          }
        }
        item_favorites_aggregate {
          ...favoriteFragment
        }
        item_images(limit: 1) {
          ...imageFragment
        }
      }
      spirit {
        id
        name
        vintage
        __typename
        item_favorites(where: { user_id: { _eq: $userId } }) {
          id
        }
        user_reviews: reviews_aggregate(
          where: { user_id: { _eq: $userId } }
          limit: 1
        ) {
          aggregate {
            count
          }
        }
        item_favorites_aggregate {
          ...favoriteFragment
        }
        item_images(limit: 1) {
          ...imageFragment
        }
      }
      coffee {
        id
        name
        __typename
        item_favorites(where: { user_id: { _eq: $userId } }) {
          id
        }
        user_reviews: reviews_aggregate(
          where: { user_id: { _eq: $userId } }
          limit: 1
        ) {
          aggregate {
            count
          }
        }
        item_favorites_aggregate {
          ...favoriteFragment
        }
        item_images(limit: 1) {
          ...imageFragment
        }
      }
    }
  }
  fragment favoriteFragment on item_favorites_aggregate {
    aggregate {
      count
    }
  }
  fragment imageFragment on item_image {
    file_id
    placeholder
  }
`);

const Rankings = () => {
  const userId = useUserId();
  if (isNil(userId)) throw new Error("Nil UserId");
  const { scrollId, setScrollId, scrollTargetRef } = useScrollRestore();
  const { types, setTypes } = useTypesFilterState();
  const { reviewers, setReviewers } = useReviewersFilterState();

  const [{ data: friendData }] = useQuery({
    query: friendsQuery,
    variables: { userId },
  });

  const reviewWhereClause: Item_Score_Bool_Exp_Bool_Exp = {};
  if (isNotNil(types)) {
    reviewWhereClause.type = { _in: types };
  }

  let reviewersFilter = new Array<string>();
  if (reviewers?.includes(RankingsFilterValue.ME)) {
    reviewersFilter = reviewersFilter.concat([userId]);
  }
  if (
    isNotNil(friendData) &&
    isNotNil(friendData.user) &&
    reviewers?.includes(RankingsFilterValue.FRIENDS)
  ) {
    reviewersFilter = reviewersFilter.concat(
      friendData.user.friends.map((x) => x.friend_id),
    );
  }

  const [{ data }] = useQuery({
    query: rankingQuery,
    variables: {
      userId,
      reviewers: `{${reviewersFilter.join(", ")}}`,
      where: reviewWhereClause,
    },
    pause: isNil(friendData),
  });

  let items = new Array<{ item: ItemCardItem; type: ItemType }>();
  if (isNotNil(data)) {
    items = data.item_scores
      .map((x) => {
        const result = nth(
          0,
          without(
            [undefined, null],
            [
              x.beer,
              x.wine,
              x.spirit,
              isNotNil(x.coffee)
                ? { ...x.coffee, vintage: undefined }
                : undefined,
            ],
          ),
        );
        if (isNil(result)) return undefined;
        return {
          type: getItemType(result.__typename),
          item: {
            id: result.id,
            itemId: result.id,
            name: result.name,
            vintage: result.vintage,
            displayImageId: result.item_images[0]?.file_id,
            placeholder: result.item_images[0]?.placeholder,
            score: x.score,
            reviewCount: x.count,
            favoriteCount: result.item_favorites_aggregate.aggregate?.count,
            favoriteId: nth(0, result.item_favorites)?.id,
            reviewed: defaultTo(0, result.user_reviews.aggregate?.count) > 0,
          },
        } as { item: ItemCardItem; type: ItemType };
      })
      .filter(isNotNil);
  }
  return (
    <Grid container spacing={2}>
      <Grid xs={12}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ justifyContent: "space-between", alignItems: "center" }}
        >
          <Typography level="title-lg">Rankings</Typography>
          <Stack direction="row" spacing={2}>
            <RankingsFilter types={reviewers} onTypesChange={setReviewers} />
            <CellarItemsFilter types={types} onTypesChange={setTypes} />
          </Stack>
        </Stack>
      </Grid>
      {items.map((x) => (
        <Grid
          ref={scrollId === x.item.id ? scrollTargetRef : undefined}
          key={x.item.id}
          xs={6}
          md={4}
          lg={2}
        >
          <ItemCard
            item={x.item}
            type={x.type}
            href={`${formatItemType(x.type).toLowerCase()}s/${x.item.id}`}
            onClick={() => setScrollId(x.item.id)}
          />
        </Grid>
      ))}
    </Grid>
  );
};

export default Rankings;
