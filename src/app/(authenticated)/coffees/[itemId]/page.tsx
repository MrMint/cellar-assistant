"use client";

import { Grid, Stack } from "@mui/joy";
import { useUserId } from "@nhost/nextjs";
import { graphql } from "@shared/gql";
import { Coffees, ItemType } from "@shared/gql/graphql";
import { formatCountry, formatEnum } from "@shared/utility";
import { notFound } from "next/navigation";
import { isNil, isNotNil, nth } from "ramda";
import { useQuery } from "urql";
import { ItemCellars } from "@/components/item/ItemCellars";
import ItemDetails from "@/components/item/ItemDetails";
import { ItemHeader } from "@/components/item/ItemHeader";
import { ItemImage } from "@/components/item/ItemImage";
import { ItemReviews } from "@/components/item/ItemReviews";
import { ItemShare } from "@/components/item/ItemShare";
import { AddReview } from "@/components/review/AddReview";
import coffee1 from "@/images/coffee1.png";

const getCoffeeQuery = graphql(`
  query GetCoffeePageQuery($itemId: uuid!, $userId: uuid!) {
    coffees_by_pk(id: $itemId) {
      id
      name
      created_by_id
      description
      country
      process
      roast_level
      species
      cultivar
      item_favorites(where: { user_id: { _eq: $userId } }) {
        id
      }
      item_favorites_aggregate {
        aggregate {
          count
        }
      }
      reviews(limit: 10, order_by: { created_at: desc }) {
        id
        user {
          id
          avatarUrl
          displayName
        }
        score
        text
        createdAt: created_at
      }
      item_images(limit: 1) {
        file_id
        placeholder
      }
      cellar_items(
        where: { empty_at: { _is_null: true } }
        distinct_on: cellar_id
      ) {
        cellar {
          id
          name
          createdBy {
            id
            displayName
            avatarUrl
          }
          co_owners {
            user {
              id
              displayName
              avatarUrl
            }
          }
        }
      }
    }
    cellars(where: { created_by_id: { _eq: $userId } }) {
      id
      name
    }
  }
`);

const CoffeeDetails = ({
  params: { itemId },
}: {
  params: { itemId: string; cellarId: string };
}) => {
  const userId = useUserId();
  if (isNil(userId)) throw new Error("Bad UserId");

  const [{ data, fetching, operation }] = useQuery({
    query: getCoffeeQuery,
    variables: { itemId, userId },
  });

  const isLoading = fetching || operation === undefined;

  const coffee = data?.coffees_by_pk;
  const cellars = data?.cellars;
  const itemCellars = data?.coffees_by_pk?.cellar_items;
  const displayImage = nth(0, coffee?.item_images ?? []);
  if (isLoading === false && isNotNil(operation) && isNil(coffee)) {
    notFound();
  }

  return (
    <Stack spacing={2}>
      <ItemHeader
        itemId={itemId}
        itemName={coffee?.name}
        itemType={ItemType.Coffee}
        cellars={cellars}
      />
      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          {!isLoading && isNotNil(coffee) && (
            <Stack spacing={1}>
              <ItemImage
                fileId={displayImage?.file_id}
                placeholder={displayImage?.placeholder}
                fallback={coffee1}
              />
              <ItemShare itemId={coffee.id} itemType={ItemType.Coffee} />
            </Stack>
          )}
        </Grid>
        {!isLoading && isNotNil(coffee) && isNotNil(itemCellars) && (
          <Grid container xs={12} sm={8}>
            <Grid xs={12} sm={12} lg={6}>
              <Stack spacing={2}>
                <ItemDetails
                  itemId={coffee.id}
                  type={ItemType.Coffee}
                  favoriteId={nth(0, coffee.item_favorites)?.id}
                  title={coffee.name}
                  subTitlePhrases={[
                    formatEnum(coffee.roast_level),
                    formatCountry(coffee.country),
                    formatEnum(coffee.species),
                    formatEnum(coffee.cultivar),
                  ]}
                  description={coffee.description}
                />
                <ItemCellars
                  cellars={itemCellars.map((x) => ({
                    ...x.cellar,
                    co_owners: x.cellar.co_owners.map((y) => y.user),
                  }))}
                />
              </Stack>
            </Grid>
            <Grid xs={12} sm={12} lg={6}>
              <Stack spacing={2}>
                <AddReview item={coffee as unknown as Coffees} />
                <ItemReviews reviews={coffee.reviews} />
              </Stack>
            </Grid>
          </Grid>
        )}
      </Grid>
    </Stack>
  );
};

export default CoffeeDetails;
