"use client";

import { Box, Button, Grid, Stack } from "@mui/joy";
import { useUserId } from "@nhost/nextjs";
import { graphql } from "@shared/gql";
import { ItemType } from "@shared/gql/graphql";
import {
  ascend,
  descend,
  isEmpty,
  isNil,
  isNotNil,
  not,
  path,
  prop,
  sortBy,
  sortWith,
} from "ramda";
import { useState } from "react";
import { MdAdd } from "react-icons/md";
import { useQuery } from "urql";
import TopNavigationBar from "@/components/common/HeaderBar";
import Link from "@/components/common/Link";
import { ItemCard, ItemCardItem } from "@/components/item/ItemCard";
import withAuth from "@/hocs/withAuth";
import { formatItemType } from "@/utilities";

type Item = {
  item: ItemCardItem;
  distance: number;
  type: ItemType;
};
const cellarQuery = graphql(`
  query GetCellarItemsQuery($cellarId: uuid!, $search: vector) {
    cellars_by_pk(id: $cellarId) {
      id
      name
      created_by_id
      co_owners {
        user_id
      }
      items(where: { empty_at: { _is_null: true } }) {
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
      }
    }
  }
`);

const getSearchVectorQuery = graphql(`
  query GetSearchVectorQuery($search: String!) {
    create_search_vector(search: $search)
  }
`);

const Items = ({ params: { cellarId } }: { params: { cellarId: string } }) => {
  const userId = useUserId();
  if (isNil(userId)) throw new Error("Invalid user id");

  const [searchString, setSearchString] = useState("");
  const [searchVectorResponse] = useQuery({
    query: getSearchVectorQuery,
    variables: { search: searchString },
    pause: isEmpty(searchString),
  });
  const [res] = useQuery({
    query: cellarQuery,
    variables: {
      cellarId,
      search: not(isEmpty(searchString))
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

        default:
          throw Error("unexpected item type");
      }
    }) ?? [];

  return (
    <Box>
      <Stack spacing={2}>
        <TopNavigationBar
          isSearching={isSearching}
          onSearchChange={setSearchString}
          breadcrumbs={[
            { url: "/cellars", text: "Cellars" },
            {
              url: `items`,
              text: res.data?.cellars_by_pk?.name ?? "loading...",
            },
          ]}
          endComponent={
            <Button
              component={Link}
              href={"items/add"}
              startDecorator={<MdAdd />}
              disabled={not(canAdd)}
            >
              Add item
            </Button>
          }
        />
        <Grid container spacing={2}>
          {sortWith(
            [ascend(prop("distance")), ascend((x) => x.item.name)],
            items,
          ).map((x) => (
            <Grid key={x.item.id} xs={12} sm={6} md={4} lg={3} xl={2}>
              <ItemCard
                item={x.item}
                type={x.type}
                href={`${formatItemType(x.type).toLowerCase()}s/${x.item.id}`}
              />
            </Grid>
          ))}
        </Grid>
      </Stack>
    </Box>
  );
};

export default withAuth(Items);
