"use client";

import { Grid, Stack, Typography } from "@mui/joy";
import { useUserId } from "@nhost/nextjs";
import { graphql } from "@shared/gql";
import { ItemType, Item_Favorites_Bool_Exp } from "@shared/gql/graphql";
import { useRouter, useSearchParams } from "next/navigation";
import {
  always,
  cond,
  defaultTo,
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
import { formatItemType, getEnumKeys, getItemType } from "@/utilities";
import { useScrollRestore } from "@/utilities/hooks";

const friendsQuery = graphql(`
  query FriendsQuery($userId: uuid!) {
    user(id: $userId) {
      friends {
        friend_id
      }
    }
  }
`);

const favoritesQuery = graphql(`
  query FavoritesQuery($userId: uuid!, $where: item_favorites_bool_exp) {
    user(id: $userId) {
      item_favorites(where: $where) {
        beer {
          ...beerItemCardFragment
        }
        wine {
          ...wineItemCardFragment
        }
        spirit {
          ...spiritItemCardFragment
        }
        coffee {
          ...coffeeItemCardFragment
        }
      }
    }
  }
`);

const Rankings = () => {
  const userId = useUserId();
  if (isNil(userId)) throw new Error("Nil UserId");
  const router = useRouter();
  const { scrollId, setScrollId, scrollTargetRef } = useScrollRestore();
  const searchParams = new URLSearchParams(useSearchParams());
  const types = searchParams.get("types");
  const parsedTypes = isNotNil(types) ? JSON.parse(types) : undefined;

  const handleTypesChange = (t: ItemType[]) => {
    if (isEmpty(t) || t.length >= getEnumKeys(ItemType).length) {
      searchParams.delete("types");
    } else {
      searchParams.set("types", JSON.stringify(t));
    }
    router.replace(`?${searchParams}`);
  };

  const favoritesWhereClause: Item_Favorites_Bool_Exp = {};
  if (isNotNil(parsedTypes)) {
    favoritesWhereClause.type = { _in: parsedTypes };
  }

  const [{ data }] = useQuery({
    query: favoritesQuery,
    variables: {
      userId,
      where: favoritesWhereClause,
    },
  });

  let items = new Array<{ item: ItemCardItem; type: ItemType }>();
  if (isNotNil(data?.user?.item_favorites)) {
    items = data.user?.item_favorites
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
            score: result.reviews_aggregate?.aggregate?.avg?.score,
            reviewCount: result.reviews_aggregate?.aggregate?.count,
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
          <Typography level="title-lg">Favorites</Typography>
          <Stack direction="row" spacing={2}>
            <CellarItemsFilter
              types={parsedTypes}
              onTypesChange={handleTypesChange}
            />
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
