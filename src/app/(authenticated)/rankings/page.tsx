"use client";

import { Grid, Stack, Typography } from "@mui/joy";
import { useUserId } from "@nhost/nextjs";
import { graphql } from "@shared/gql";
import { ItemType, Item_Score_Bool_Exp_Bool_Exp } from "@shared/gql/graphql";
import { useRouter, useSearchParams } from "next/navigation";
import {
  always,
  cond,
  equals,
  isEmpty,
  isNil,
  isNotNil,
  nth,
  without,
} from "ramda";
import { useQuery } from "urql";
import { CellarItemsFilter } from "@/components/cellar/CellarItemsFilter";
import { ItemCard, ItemCardItem } from "@/components/item/ItemCard";
import {
  RankingsFilter,
  RankingsFilterValue,
} from "@/components/ranking/RankingsFilter";
import { formatItemType, getEnumKeys } from "@/utilities";

const getItemType = (
  typename: "beers" | "wines" | "spirits" | "coffees",
): ItemType =>
  cond([
    [equals("beers"), always(ItemType.Beer)],
    [equals("spirits"), always(ItemType.Spirit)],
    [equals("wines"), always(ItemType.Wine)],
    [equals("coffees"), always(ItemType.Coffee)],
  ])(typename);

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
        item_images(limit: 1) {
          file_id
          placeholder
        }
      }
      wine {
        id
        name
        vintage
        item_images(limit: 1) {
          file_id
          placeholder
        }
      }
      spirit {
        id
        name
        vintage
        item_images(limit: 1) {
          file_id
          placeholder
        }
      }
      coffee {
        id
        name
        item_images(limit: 1) {
          file_id
          placeholder
        }
      }
    }
  }
`);

const Rankings = ({
  searchParams: { reviewers, types },
}: {
  searchParams: { reviewers?: string; types?: string };
}) => {
  const userId = useUserId();
  if (isNil(userId)) throw new Error("Nil UserId");
  const router = useRouter();
  const searchParams = new URLSearchParams(useSearchParams());
  const parsedReviewers = isNotNil(reviewers)
    ? (JSON.parse(reviewers) as RankingsFilterValue[])
    : undefined;
  const parsedTypes = isNotNil(types)
    ? (JSON.parse(types) as ItemType[])
    : undefined;

  const handleReviewersChange = (reviewers: RankingsFilterValue[]) => {
    if (isEmpty(reviewers)) {
      searchParams.delete("reviewers");
    } else {
      searchParams.set("reviewers", JSON.stringify(reviewers));
    }
    router.replace(`?${searchParams}`);
  };

  const handleTypesChange = (types: ItemType[]) => {
    if (isEmpty(types) || types.length >= getEnumKeys(ItemType).length) {
      searchParams.delete("types");
    } else {
      searchParams.set("types", JSON.stringify(types));
    }
    router.replace(`?${searchParams}`);
  };

  const [{ data: friendData }] = useQuery({
    query: friendsQuery,
    variables: { userId },
  });

  let reviewersFilter = new Array<string>();
  if (parsedReviewers?.includes(RankingsFilterValue.ME)) {
    reviewersFilter = reviewersFilter.concat([userId]);
  }
  const reviewWhereClause: Item_Score_Bool_Exp_Bool_Exp = {};
  if (isNotNil(parsedTypes)) {
    reviewWhereClause.type = { _in: parsedTypes };
  }

  if (
    isNotNil(friendData) &&
    isNotNil(friendData.user) &&
    parsedReviewers?.includes(RankingsFilterValue.FRIENDS)
  ) {
    reviewersFilter = reviewersFilter.concat(
      friendData.user.friends.map((x) => x.friend_id),
    );
  }

  const [{ data }] = useQuery({
    query: rankingQuery,
    variables: {
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
          without([undefined, null], [x.beer, x.wine, x.spirit]),
        );
        if (isNil(result)) return undefined;
        return {
          type: getItemType(result.__typename),
          item: {
            id: result.id,
            name: result.name,
            vintage: result.vintage,
            displayImageId: result.item_images[0]?.file_id,
            placeholder: result.item_images[0]?.placeholder,
            score: x.score,
            reviewCount: x.count,
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
            <RankingsFilter
              types={parsedReviewers}
              onTypesChange={handleReviewersChange}
            />
            <CellarItemsFilter
              types={parsedTypes}
              onTypesChange={handleTypesChange}
            />
          </Stack>
        </Stack>
      </Grid>
      {items.map((x) => (
        <Grid key={x.item.id} xs={6} md={4} lg={2}>
          <ItemCard
            item={x.item}
            type={x.type}
            href={`${formatItemType(x.type).toLowerCase()}s/${x.item.id}`}
          />
        </Grid>
      ))}
    </Grid>
  );
};

export default Rankings;
