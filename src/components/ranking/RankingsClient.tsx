"use client";

import type {
  Item_Score_Bool_Exp_Bool_Exp,
  ItemTypeValue,
} from "@cellar-assistant/shared";
import { Grid, Stack, Typography } from "@mui/joy";
import { defaultTo, isNil, isNotNil, nth, without } from "ramda";
import { useQuery } from "urql";
import { CellarItemsFilter } from "@/components/cellar/CellarItemsFilter";
import { ItemCard, type ItemCardItem } from "@/components/item/ItemCard";
import {
  RankingsFilter,
  RankingsFilterValue,
} from "@/components/ranking/RankingsFilter";
import { formatItemType, getItemType } from "@/utilities";
import {
  useReviewersFilterState,
  useScrollPositionRestore,
  useTypesFilterState,
} from "@/utilities/hooks";
import { GetRankingFriendsQuery, GetRankingsQuery } from "./fragments";

interface RankingsClientProps {
  userId: string;
}

export const RankingsClient = ({ userId }: RankingsClientProps) => {
  if (isNil(userId)) throw new Error("Nil UserId");
  const { sentinelRef, saveScrollPosition } = useScrollPositionRestore();
  const { types, setTypes } = useTypesFilterState();
  const { reviewers, setReviewers } = useReviewersFilterState();

  const [{ data: friendData }] = useQuery({
    query: GetRankingFriendsQuery,
    variables: { userId },
  });

  const reviewWhereClause: Item_Score_Bool_Exp_Bool_Exp = {};
  if (isNotNil(types)) {
    reviewWhereClause.type = { _in: types };
  }

  let reviewersFilter: string[] = [];
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
    query: GetRankingsQuery,
    variables: {
      userId,
      reviewers: `{${reviewersFilter.join(", ")}}`,
      where: reviewWhereClause,
    },
    pause: isNil(friendData),
  });

  let items: { item: ItemCardItem; type: ItemTypeValue }[] = [];
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
        } as { item: ItemCardItem; type: ItemTypeValue };
      })
      .filter(isNotNil);
  }
  return (
    <>
      <div ref={sentinelRef} style={{ height: 0, overflow: "hidden" }} />
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
          <Grid key={x.item.id} xs={6} md={4} lg={2}>
            <ItemCard
              item={x.item}
              type={x.type}
              href={`${formatItemType(x.type).toLowerCase()}s/${x.item.id}`}
              onClick={saveScrollPosition}
            />
          </Grid>
        ))}
      </Grid>
    </>
  );
};
