"use client";

import { Button, Card, Grid, Modal, Stack } from "@mui/joy";
import { usePathname } from "next/navigation";
import { isNil, isNotNil } from "ramda";
import { useCallback } from "react";
import QRCode from "react-qr-code";
import { useClient, useQuery } from "urql";
import { CellarItemHeader } from "@/components/item/CellarItemHeader";
import ItemDetails from "@/components/item/ItemDetails";
import { ItemImage } from "@/components/item/ItemImage";
import { ItemReviews } from "@/components/item/ItemReviews";
import { ItemShare } from "@/components/item/ItemShare";
import { AddReview } from "@/components/review/AddReview";
import { graphql } from "@/gql";
import { ItemType } from "@/gql/graphql";
import wine1 from "@/images/wine1.png";
import { addItemImageMutation, updateCellarWineMutation } from "@/queries";
import { formatAsPercentage, formatVintage } from "@/utilities";

const getWineQuery = graphql(`
  query GetCellarWine($itemId: uuid!) {
    cellar_wine_by_pk(id: $itemId) {
      wine {
        id
        name
        created_by_id
        region
        variety
        vintage
        style
        country
        description
        barcode_code
        alcohol_content_percentage
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

const WineDetails = ({
  params: { itemId, cellarId },
}: {
  params: { itemId: string; cellarId: string };
}) => {
  const client = useClient();
  const [{ data, fetching, operation }] = useQuery({
    query: getWineQuery,
    variables: { itemId },
  });

  const isLoading = fetching || operation === undefined;

  const wine = data?.cellar_wine_by_pk?.wine;
  const cellar = data?.cellar_wine_by_pk?.cellar;
  const displayImage = data?.cellar_wine_by_pk?.display_image;

  const handleCaptureImage = useCallback(
    async (image: string) => {
      if (isNotNil(wine)) {
        const addImageResult = await client.mutation(addItemImageMutation, {
          input: { image, item_id: wine.id, item_type: ItemType.Wine },
        });
        if (isNil(addImageResult.error)) {
          const updateItemResult = await client.mutation(
            updateCellarWineMutation,
            {
              wineId: itemId,
              wine: {
                display_image_id: addImageResult.data?.item_image_upload?.id,
              },
            },
          );
        }
      }
    },
    [client, wine, itemId],
  );

  return (
    <Stack spacing={2}>
      <CellarItemHeader
        itemId={itemId}
        itemName={wine?.name}
        itemType={ItemType.Wine}
        cellarId={cellarId}
        cellarName={cellar?.name}
        cellarCreatedById={cellar?.created_by_id}
      />
      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          {!isLoading && isNotNil(wine) && (
            <Stack spacing={1}>
              <ItemImage
                fileId={displayImage?.file_id}
                placeholder={displayImage?.placeholder}
                fallback={wine1}
                onCaptureImage={handleCaptureImage}
              />
              <ItemShare itemId={wine.id} itemType={ItemType.Wine} />
            </Stack>
          )}
        </Grid>
        {!isLoading && isNotNil(wine) && (
          <Grid container xs={12} sm={8}>
            <Grid xs={12} sm={12} lg={6}>
              <ItemDetails
                title={wine.name}
                subTitlePhrases={[
                  formatVintage(wine.vintage),
                  wine.variety,
                  wine.region,
                  wine.country,
                  formatAsPercentage(wine.alcohol_content_percentage),
                ]}
                description={wine.description}
              />
            </Grid>
            <Grid xs={12} sm={12} lg={6}>
              <Stack spacing={2}>
                <AddReview wineId={wine.id} />
                <ItemReviews reviews={wine.reviews} />
              </Stack>
            </Grid>
          </Grid>
        )}
      </Grid>
    </Stack>
  );
};

export default WineDetails;
