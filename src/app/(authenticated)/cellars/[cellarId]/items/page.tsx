"use client";

import { Box, Button, Grid, Stack } from "@mui/joy";
import { useUserId } from "@nhost/nextjs";
import { graphql } from "@shared/gql";
import { Cellar_Items_Bool_Exp, ItemType } from "@shared/gql/graphql";
import { getSearchVectorQuery } from "@shared/queries";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ascend,
  defaultTo,
  isEmpty,
  isNil,
  isNotNil,
  not,
  nth,
  prop,
  sortWith,
  without,
} from "ramda";
import { MdAdd } from "react-icons/md";
import { useQuery } from "urql";
import { CellarItemsFilter } from "@/components/cellar/CellarItemsFilter";
import { HeaderBar } from "@/components/common/HeaderBar";
import { Link } from "@/components/common/Link";
import { ItemCard, ItemCardItem } from "@/components/item/ItemCard";
import withAuth from "@/hocs/withAuth";
import { formatItemType, getEnumKeys, getItemType } from "@/utilities";
import { useScrollRestore } from "@/utilities/hooks";

type Item = {
  item: ItemCardItem;
  distance: number;
  type: ItemType;
};

const cellarQuery = graphql(`
  query GetCellarItemsQuery(
    $cellarId: uuid!
    $itemsWhereClause: cellar_items_bool_exp
    $search: vector
    $userId: uuid!
  ) {
    cellars_by_pk(id: $cellarId) {
      id
      name
      created_by_id
      co_owners {
        user_id
      }
      item_counts: items_aggregate(where: { empty_at: { _is_null: true } }) {
        beers: aggregate {
          count(columns: [beer_id])
        }
        wines: aggregate {
          count(columns: [wine_id])
        }
        spirits: aggregate {
          count(columns: [spirit_id])
        }
        coffees: aggregate {
          count(columns: [coffee_id])
        }
      }
      items(where: $itemsWhereClause) {
        id
        type
        display_image {
          file_id
          placeholder
        }
        beer {
          ...beerItemCardFragment
          item_vectors {
            distance(args: { search: $search })
          }
        }
        wine {
          ...wineItemCardFragment
          item_vectors {
            distance(args: { search: $search })
          }
        }
        spirit {
          ...spiritItemCardFragment
          item_vectors {
            distance(args: { search: $search })
          }
        }
        coffee {
          ...coffeeItemCardFragment
          item_vectors {
            distance(args: { search: $search })
          }
        }
      }
    }
  }
`);

const Items = ({
  params: { cellarId },
  searchParams: { search, types },
}: {
  params: { cellarId: string };
  searchParams: { search?: string; types?: string };
}) => {
  const userId = useUserId();
  if (isNil(userId)) throw new Error("Invalid user id");
  const parsedTypes = isNotNil(types) ? JSON.parse(types) : undefined;
  const router = useRouter();
  const searchParams = new URLSearchParams(useSearchParams());
  const { scrollId, setScrollId, scrollTargetRef } = useScrollRestore();

  const handleSearchChange = (search: string) => {
    if (isEmpty(search)) {
      searchParams.delete("search");
    } else {
      searchParams.set("search", search);
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

  const [searchVectorResponse] = useQuery({
    query: getSearchVectorQuery,
    variables: { text: search ?? "" },
    pause: isEmpty(search ?? ""),
  });

  const itemsWhereClause: Cellar_Items_Bool_Exp = {
    empty_at: { _is_null: true },
  };

  if (isNotNil(parsedTypes)) {
    itemsWhereClause.type = { _in: parsedTypes };
  }

  const [res] = useQuery({
    query: cellarQuery,
    variables: {
      userId,
      cellarId,
      itemsWhereClause,
      search: not(isEmpty(search ?? ""))
        ? JSON.stringify(searchVectorResponse?.data?.create_search_vector)
        : undefined,
    },
  });

  const isSearching = searchVectorResponse.fetching || res.fetching;
  const canAdd =
    res?.data?.cellars_by_pk?.created_by_id === userId ||
    res?.data?.cellars_by_pk?.co_owners
      ?.map((x) => x.user_id)
      .includes(userId) === true;

  const counts = {
    wines: res.data?.cellars_by_pk?.item_counts?.wines?.count,
    beers: res.data?.cellars_by_pk?.item_counts?.beers?.count,
    spirits: res.data?.cellars_by_pk?.item_counts?.spirits?.count,
    coffees: res.data?.cellars_by_pk?.item_counts?.coffees?.count,
  };

  const items =
    res.data?.cellars_by_pk?.items
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
          distance: Math.min(
            ...result.item_vectors.map((y) => y.distance).filter(isNotNil),
          ),
          item: {
            id: x.id,
            itemId: result.id,
            name: result.name,
            vintage: result.vintage ?? undefined,
            displayImageId: result.item_images[0]?.file_id,
            placeholder: result.item_images[0]?.placeholder,
            score: result.reviews_aggregate.aggregate?.avg?.score,
            reviewCount: result.reviews_aggregate.aggregate?.count,
            favoriteCount: result.item_favorites_aggregate.aggregate?.count,
            favoriteId: nth(0, result.item_favorites)?.id,
            reviewed: defaultTo(0, result.user_reviews.aggregate?.count) > 0,
          } satisfies ItemCardItem,
        };
      })
      .filter(isNotNil) ?? [];

  return (
    <Box>
      <Stack spacing={2}>
        <HeaderBar
          defaultSearchValue={search}
          isSearching={isSearching}
          onSearchChange={handleSearchChange}
          breadcrumbs={[
            { url: "/cellars", text: "Cellars" },
            {
              url: `items`,
              text: res.data?.cellars_by_pk?.name ?? "loading...",
            },
          ]}
          endComponent={
            <Stack direction="row" spacing={2}>
              <CellarItemsFilter
                types={parsedTypes}
                onTypesChange={handleTypesChange}
                counts={counts}
              />
              <Button
                component={Link}
                href={"items/add"}
                startDecorator={<MdAdd />}
                disabled={not(canAdd)}
              >
                Add item
              </Button>
            </Stack>
          }
        />
        <Grid container spacing={2}>
          {sortWith(
            [ascend(prop("distance")), ascend((x) => x.item.name)],
            items,
          ).map((x) => (
            <Grid
              ref={scrollId === x.item.id ? scrollTargetRef : null}
              id={x.item.id}
              key={x.item.id}
              xs={items.length > 6 ? 6 : 12}
              sm={6}
              md={4}
              lg={3}
              xl={2}
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
      </Stack>
    </Box>
  );
};

export default withAuth(Items);
