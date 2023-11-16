"use client";

import { Box, Button, Grid, Stack } from "@mui/joy";
import { useUserId } from "@nhost/nextjs";
import { graphql } from "@shared/gql";
import { ItemType } from "@shared/gql/graphql";
import {
  ascend,
  descend,
  isEmpty,
  isNotNil,
  not,
  prop,
  sortBy,
  sortWith,
} from "ramda";
import { useState } from "react";
import { MdAdd } from "react-icons/md";
import { useQuery } from "urql";
import TopNavigationBar from "@/components/common/HeaderBar";
import Link from "@/components/common/Link";
import { ItemCard } from "@/components/item/ItemCard";
import withAuth from "@/hocs/withAuth";
import { formatItemType } from "@/utilities";

const cellarQuery = graphql(`
  query GetCellarItemsQuery($cellarId: uuid!, $search: vector) {
    cellars_by_pk(id: $cellarId) {
      id
      name
      created_by_id
      spirits {
        id
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
      }
      wines {
        id
        display_image {
          file_id
          placeholder
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
      }
      beers {
        id
        display_image {
          file_id
          placeholder
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

  const items =
    res.data?.cellars_by_pk?.wines
      .map((x) => ({
        id: x.id,
        name: x.wine.name,
        vintage: x.wine.vintage as string | undefined,
        displayImageId: x.display_image?.file_id,
        placeholder: x.display_image?.placeholder,
        score: x.wine.reviews_aggregate.aggregate?.avg?.score,
        reviewCount: x.wine.reviews_aggregate.aggregate?.count,
        type: ItemType.Wine,
        distance: Math.min(
          ...x.wine.item_vectors.map((y) => y.distance).filter(isNotNil),
        ),
      }))
      .concat(
        res.data?.cellars_by_pk?.beers.map((x) => ({
          id: x.id,
          vintage: undefined,
          name: x.beer.name,
          displayImageId: x.display_image?.file_id,
          placeholder: x.display_image?.placeholder,
          score: x.beer.reviews_aggregate.aggregate?.avg?.score,
          reviewCount: x.beer.reviews_aggregate.aggregate?.count,
          type: ItemType.Beer,
          distance: Math.min(
            ...x.beer.item_vectors.map((y) => y.distance).filter(isNotNil),
          ),
        })),
      )
      .concat(
        res.data?.cellars_by_pk?.spirits.map((x) => ({
          id: x.id,
          name: x.spirit.name,
          vintage: undefined,
          displayImageId: x.display_image?.file_id,
          placeholder: x.display_image?.placeholder,
          score: x.spirit.reviews_aggregate.aggregate?.avg?.score,
          reviewCount: x.spirit.reviews_aggregate.aggregate?.count,
          type: ItemType.Spirit,
          distance: Math.min(
            ...x.spirit.item_vectors.map((y) => y.distance).filter(isNotNil),
          ),
        })),
      ) ?? [];

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
              disabled={userId !== res.data?.cellars_by_pk?.created_by_id}
            >
              Add item
            </Button>
          }
        />
        <Grid container spacing={2}>
          {sortWith(
            [ascend(prop("distance")), ascend(prop("name"))],
            items,
          ).map((x) => (
            <Grid key={x.id} xs={12} sm={6} md={4} lg={3} xl={2}>
              <ItemCard
                item={{
                  id: x.id,
                  name: x.name,
                  vintage: x.vintage,
                  displayImageId: x.displayImageId,
                  placeholder: x.placeholder,
                  score: x.score,
                  reviewCount: x.reviewCount,
                }}
                type={x.type}
                href={`${formatItemType(x.type).toLowerCase()}s/${x.id}`}
              />
            </Grid>
          ))}
        </Grid>
      </Stack>
    </Box>
  );
};

export default withAuth(Items);
