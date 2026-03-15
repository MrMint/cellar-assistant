"use client";

import type {
  Item_Score_Bool_Exp_Bool_Exp,
  ItemTypeValue,
} from "@cellar-assistant/shared";
import { Stack, Typography } from "@mui/joy";
import { defaultTo, isNil, isNotNil, nth, without } from "ramda";
import { useQuery } from "urql";
import { CellarItemsFilter } from "@/components/cellar/CellarItemsFilter";
import { VirtualGrid } from "@/components/common/VirtualGrid";
import { ItemCard, type ItemCardItem } from "@/components/item/ItemCard";
import {
  RankingsFilter,
  RankingsFilterValue,
} from "@/components/ranking/RankingsFilter";
import { buildItemSubtitle, formatItemType, getItemType } from "@/utilities";
import {
  useReviewersFilterState,
  useTypesFilterState,
} from "@/utilities/hooks";
import { GetRankingFriendsQuery, GetRankingsQuery } from "./fragments";

interface RankingsClientProps {
  userId: string;
}

export const RankingsClient = ({ userId }: RankingsClientProps) => {
  if (isNil(userId)) throw new Error("Nil UserId");
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
            subtitle: buildItemSubtitle(result),
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
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}
      >
        <Typography level="title-lg">Rankings</Typography>
        <Stack direction="row" spacing={2}>
          <RankingsFilter types={reviewers} onTypesChange={setReviewers} />
          <CellarItemsFilter types={types} onTypesChange={setTypes} />
        </Stack>
      </Stack>
      <VirtualGrid
        items={items}
        cacheKey={`rankings-${types?.join(",") ?? "all"}-${reviewers?.join(",") ?? "all"}`}
        getItemKey={(x) => x.item.id}
        gridBreakpoints={{ xs: 6, md: 4, lg: 2 }}
        emptyMessage="No rankings found"
        renderItem={(x, onBeforeNavigate) => (
          <ItemCard
            item={x.item}
            type={x.type}
            href={`${formatItemType(x.type).toLowerCase()}s/${x.item.id}`}
            onClick={onBeforeNavigate}
          />
        )}
      />
    </>
  );
};
