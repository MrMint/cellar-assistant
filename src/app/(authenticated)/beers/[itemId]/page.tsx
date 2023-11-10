"use client";

import { Grid, Stack } from "@mui/joy";
import { useUserId } from "@nhost/nextjs";
import { notFound } from "next/navigation";
import { isNil, isNotNil, nth } from "ramda";
import { useQuery } from "urql";
import ItemDetails from "@/components/item/ItemDetails";
import { ItemHeader } from "@/components/item/ItemHeader";
import { ItemImage } from "@/components/item/ItemImage";
import { ItemReviews } from "@/components/item/ItemReviews";
import { ItemShare } from "@/components/item/ItemShare";
import { AddReview } from "@/components/review/AddReview";
import { graphql } from "@/gql";
import { ItemType } from "@/gql/graphql";
import beer1 from "@/images/beer1.png";
import { formatAsPercentage, formatVintage } from "@/utilities";

const getBeerQuery = graphql(`
  query GetBeerPageQuery($itemId: uuid!, $userId: uuid!) {
    beers_by_pk(id: $itemId) {
      id
      name
      created_by_id
      style
      vintage
      description
      alcohol_content_percentage
      country
      reviews(limit: 10, order_by: { created_at: desc }) {
        id
        user {
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
    }
    cellars(where: { created_by_id: { _eq: $userId } }) {
      id
      name
    }
  }
`);

const BeerDetails = ({
  params: { itemId },
}: {
  params: { itemId: string; cellarId: string };
}) => {
  const userId = useUserId();
  if (isNil(userId)) throw new Error("Bad UserId");

  const [{ data, fetching, operation }] = useQuery({
    query: getBeerQuery,
    variables: { itemId, userId },
  });

  const isLoading = fetching || operation === undefined;

  const beer = data?.beers_by_pk;
  const cellars = data?.cellars;
  const displayImage = nth(0, beer?.item_images ?? []);
  if (isLoading === false && isNotNil(operation) && isNil(beer)) {
    notFound();
  }

  return (
    <Stack spacing={2}>
      <ItemHeader
        itemId={itemId}
        itemName={beer?.name}
        itemType={ItemType.Beer}
        cellars={cellars}
      />
      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          {!isLoading && isNotNil(beer) && (
            <Stack spacing={1}>
              <ItemImage
                fileId={displayImage?.file_id}
                placeholder={displayImage?.placeholder}
                fallback={beer1}
              />
              <ItemShare itemId={beer.id} itemType={ItemType.Beer} />
            </Stack>
          )}
        </Grid>
        {!isLoading && isNotNil(beer) && (
          <Grid container xs={12} sm={8}>
            <Grid xs={12} sm={12} lg={6}>
              <ItemDetails
                title={beer.name}
                subTitlePhrases={[
                  formatVintage(beer.vintage),
                  beer.country,
                  beer.style,
                  formatAsPercentage(beer.alcohol_content_percentage),
                ]}
                description={beer.description}
              />
            </Grid>
            <Grid xs={12} sm={12} lg={6}>
              <Stack spacing={2}>
                <AddReview beerId={beer.id} />
                <ItemReviews reviews={beer.reviews} />
              </Stack>
            </Grid>
          </Grid>
        )}
      </Grid>
    </Stack>
  );
};

export default BeerDetails;
