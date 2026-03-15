"use client";

import { graphql, type ItemTypeValue } from "@cellar-assistant/shared";
import { Stack, Typography } from "@mui/joy";
import { defaultTo, isNil, isNotNil, nth, without } from "ramda";
import { useQuery } from "urql";
import { CellarItemsFilter } from "@/components/cellar/CellarItemsFilter";
import { VirtualGrid } from "@/components/common/VirtualGrid";
import { ItemCard, type ItemCardItem } from "@/components/item/ItemCard";
import {
  beerItemCardFragment,
  coffeeItemCardFragment,
  spiritItemCardFragment,
  wineItemCardFragment,
} from "@/components/item/ItemCard/fragments";
import { buildItemSubtitle, formatItemType, getItemType } from "@/utilities";
import { useTypesFilterState } from "@/utilities/hooks";

const favoritesQuery = graphql(
  `
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
  `,
  [
    beerItemCardFragment,
    wineItemCardFragment,
    spiritItemCardFragment,
    coffeeItemCardFragment,
  ],
);

interface FavoritesClientProps {
  userId: string;
}

export function FavoritesClient({ userId }: FavoritesClientProps) {
  const { types, setTypes } = useTypesFilterState();

  const favoritesWhereClause: Record<string, Record<string, string[]>> = {};
  if (isNotNil(types)) {
    const itemTypes = types as string[];
    favoritesWhereClause.type = { _in: itemTypes };
  }

  const [{ data }] = useQuery({
    query: favoritesQuery,
    variables: {
      userId,
      where: favoritesWhereClause,
    },
  });

  let items: { item: ItemCardItem; type: ItemTypeValue }[] = [];
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
            subtitle: buildItemSubtitle(result),
            displayImageId: result.item_images[0]?.file_id,
            placeholder: result.item_images[0]?.placeholder,
            score: result.reviews_aggregate?.aggregate?.avg?.score,
            reviewCount: result.reviews_aggregate?.aggregate?.count,
            favoriteCount: result.item_favorites_aggregate.aggregate?.count,
            favoriteId: nth(0, result.item_favorites)?.id,
            reviewed: defaultTo(0, result.user_reviews.aggregate?.count) > 0,
          },
        } as { item: ItemCardItem; type: ItemTypeValue };
      })
      .filter(isNotNil);
  }

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ justifyContent: "space-between", alignItems: "center" }}
      >
        <Typography level="title-lg">Favorites</Typography>
        <Stack direction="row" spacing={2}>
          <CellarItemsFilter types={types} onTypesChange={setTypes} />
        </Stack>
      </Stack>
      <VirtualGrid
        items={items}
        cacheKey={`favorites-${types?.join(",") ?? "all"}`}
        getItemKey={(x) => x.item.id}
        gridBreakpoints={{ xs: 6, md: 4, lg: 2 }}
        emptyMessage="No favorites found"
        renderItem={(x, onBeforeNavigate) => (
          <ItemCard
            item={x.item}
            type={x.type}
            href={`${formatItemType(x.type).toLowerCase()}s/${x.item.id}`}
            onClick={onBeforeNavigate}
          />
        )}
      />
    </Stack>
  );
}
