"use client";

import { Card, Grid, Stack } from "@mui/joy";
import { graphql } from "@shared/gql";
import { ItemType } from "@shared/gql/graphql";
import {
  addItemImageMutation,
  updateCellarBeerMutation,
} from "@shared/queries";
import { formatBeerStyle, formatCountry } from "@shared/utility";
import { isNil, isNotNil } from "ramda";
import { useCallback } from "react";
import { useClient, useQuery } from "urql";
import { CellarItemHeader } from "@/components/item/CellarItemHeader";
import ItemDetails from "@/components/item/ItemDetails";
import { ItemImage } from "@/components/item/ItemImage";
import { ItemReviews } from "@/components/item/ItemReviews";
import { ItemShare } from "@/components/item/ItemShare";
import { AddReview } from "@/components/review/AddReview";
import beer1 from "@/images/beer1.png";
import { formatAsPercentage, formatVintage } from "@/utilities";

const getBeerQuery = graphql(`
  query GetCellarBeer($itemId: uuid!) {
    cellar_beer_by_pk(id: $itemId) {
      beer {
        id
        name
        created_by_id
        vintage
        style
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
      }
      display_image {
        file_id
        placeholder
      }
      cellar {
        name
        created_by_id
      }
    }
  }
`);

const BeerDetails = ({
  params: { itemId, cellarId },
}: {
  params: { itemId: string; cellarId: string };
}) => {
  const client = useClient();
  const [{ data, fetching, operation }] = useQuery({
    query: getBeerQuery,
    variables: { itemId },
  });
  const isLoading = fetching || operation === undefined;

  const beer = data?.cellar_beer_by_pk?.beer;
  const cellar = data?.cellar_beer_by_pk?.cellar;
  const displayImage = data?.cellar_beer_by_pk?.display_image;

  const handleCaptureImage = useCallback(
    async (image: string) => {
      if (isNotNil(beer)) {
        const addImageResult = await client.mutation(addItemImageMutation, {
          input: { image, item_id: beer.id, item_type: ItemType.Beer },
        });
        if (isNil(addImageResult.error)) {
          const updateItemResult = await client.mutation(
            updateCellarBeerMutation,
            {
              beerId: itemId,
              beer: {
                display_image_id: addImageResult.data?.item_image_upload?.id,
              },
            },
          );
        }
      }
    },
    [client, beer, itemId],
  );

  return (
    <Stack spacing={2}>
      <CellarItemHeader
        itemType={ItemType.Beer}
        itemId={itemId}
        itemName={beer?.name}
        cellarId={cellarId}
        cellarName={cellar?.name}
        cellarCreatedById={cellar?.created_by_id}
      />
      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          {!isLoading && isNotNil(beer) && (
            <Stack spacing={1}>
              <ItemImage
                fileId={displayImage?.file_id}
                placeholder={displayImage?.placeholder}
                fallback={beer1}
                onCaptureImage={handleCaptureImage}
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
                  formatBeerStyle(beer.style),
                  formatCountry(beer.country),
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
