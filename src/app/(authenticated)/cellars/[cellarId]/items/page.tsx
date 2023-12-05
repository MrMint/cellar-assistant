"use client";

import { Box, Button, Grid, Stack } from "@mui/joy";
import { useUserId } from "@nhost/nextjs";
import { graphql } from "@shared/gql";
import { Cellar_Items_Bool_Exp, ItemType } from "@shared/gql/graphql";
import { useRouter, useSearchParams } from "next/navigation";
import { ascend, isEmpty, isNil, isNotNil, not, prop, sortWith } from "ramda";
import { useEffect, useRef } from "react";
import { MdAdd } from "react-icons/md";
import { useQuery } from "urql";
import { CellarItemsFilter } from "@/components/cellar/CellarItemsFilter";
import { HeaderBar } from "@/components/common/HeaderBar";
import Link from "@/components/common/Link";
import { ItemCard, ItemCardItem } from "@/components/item/ItemCard";
import withAuth from "@/hocs/withAuth";
import { formatItemType, getEnumKeys } from "@/utilities";
import { useHash } from "@/utilities/hooks";

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
  ) {
    cellars_by_pk(id: $cellarId) {
      id
      name
      created_by_id
      co_owners {
        user_id
      }
      items(where: $itemsWhereClause) {
        id
        type
        display_image {
          file_id
          placeholder
        }
        spirit {
          name
          vintage
          item_vectors {
            distance(args: { search: $search })
          }
          reviews_aggregate {
            aggregate {
              count
              avg {
                score
              }
            }
          }
        }
        wine {
          name
          vintage
          item_vectors {
            distance(args: { search: $search })
          }
          reviews_aggregate {
            aggregate {
              count
              avg {
                score
              }
            }
          }
        }
        beer {
          name
          item_vectors {
            distance(args: { search: $search })
          }
          reviews_aggregate {
            aggregate {
              count
              avg {
                score
              }
            }
          }
        }
        coffee {
          name
          item_vectors {
            distance(args: { search: $search })
          }
          reviews_aggregate {
            aggregate {
              count
              avg {
                score
              }
            }
          }
        }
      }
    }
  }
`);

const getSearchVectorQuery = graphql(`
  query GetSearchVectorQuery($search: String!) {
    create_search_vector(text: $search)
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
  const hash = useHash();
  const scrollTargetRef = useRef<HTMLDivElement>(null);

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
    variables: { search: search ?? "" },
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

  const items =
    res.data?.cellars_by_pk?.items.map((x) => {
      switch (x.type) {
        case "BEER":
          if (isNil(x.beer)) throw Error();
          return {
            item: {
              id: x.id,
              name: x.beer.name,
              displayImageId: x.display_image?.file_id,
              placeholder: x.display_image?.placeholder,
              score: x.beer.reviews_aggregate.aggregate?.avg?.score,
              reviewCount: x.beer.reviews_aggregate.aggregate?.count,
            } as ItemCardItem,
            type: ItemType.Beer,
            distance: Math.min(
              ...x.beer.item_vectors.map((y) => y.distance).filter(isNotNil),
            ),
          } as Item;
        case "WINE":
          if (isNil(x.wine)) throw Error();
          return {
            item: {
              id: x.id,
              name: x.wine.name,
              vintage: x.wine.vintage,
              displayImageId: x.display_image?.file_id,
              placeholder: x.display_image?.placeholder,
              score: x.wine.reviews_aggregate.aggregate?.avg?.score,
              reviewCount: x.wine.reviews_aggregate.aggregate?.count,
            } as ItemCardItem,
            type: ItemType.Wine,
            distance: Math.min(
              ...x.wine.item_vectors.map((y) => y.distance).filter(isNotNil),
            ),
          } as Item;
        case "SPIRIT":
          if (isNil(x.spirit)) throw Error();
          return {
            item: {
              id: x.id,
              name: x.spirit.name,
              vintage: x.spirit.vintage,
              displayImageId: x.display_image?.file_id,
              placeholder: x.display_image?.placeholder,
              score: x.spirit.reviews_aggregate.aggregate?.avg?.score,
              reviewCount: x.spirit.reviews_aggregate.aggregate?.count,
            } as ItemCardItem,
            type: ItemType.Spirit,
            distance: Math.min(
              ...x.spirit.item_vectors.map((y) => y.distance).filter(isNotNil),
            ),
          } as Item;
        case "COFFEE":
          if (isNil(x.coffee)) throw Error();
          return {
            item: {
              id: x.id,
              name: x.coffee.name,
              displayImageId: x.display_image?.file_id,
              placeholder: x.display_image?.placeholder,
              score: x.coffee.reviews_aggregate.aggregate?.avg?.score,
              reviewCount: x.coffee.reviews_aggregate.aggregate?.count,
            } as ItemCardItem,
            type: ItemType.Coffee,
            distance: Math.min(
              ...x.coffee.item_vectors.map((y) => y.distance).filter(isNotNil),
            ),
          } as Item;
        default:
          throw Error("unexpected item type");
      }
    }) ?? [];

  // Scroll to element on navigate back
  useEffect(() => {
    if (isNotNil(scrollTargetRef.current)) {
      scrollTargetRef.current.scrollIntoView();
    }
  }, []);
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
              ref={hash === x.item.id ? scrollTargetRef : null}
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
                onClick={() => {
                  // TODO switch to simple hash update when nextjs fixes bug
                  // https://github.com/vercel/next.js/issues/56112
                  // window.location.hash = x.item.id;
                  window.history.replaceState(
                    window.history.state,
                    "",
                    `#${x.item.id}`,
                  );
                }}
              />
            </Grid>
          ))}
        </Grid>
      </Stack>
    </Box>
  );
};

export default withAuth(Items);
