"use client";

import { Card, Grid, Sheet, Stack } from "@mui/joy";
import { isNil, isNotNil } from "ramda";
import { useCallback } from "react";
import { useClient, useQuery } from "urql";
import { CellarItemHeader } from "@/components/item/CellarItemHeader";
import ItemDetails from "@/components/item/ItemDetails";
import { ItemImage } from "@/components/item/ItemImage";
import { ItemReviews } from "@/components/item/ItemReviews";
import { AddReview } from "@/components/review/AddReview";
import { graphql } from "@/gql";
import { ItemType } from "@/gql/graphql";
import spirit1 from "@/images/spirit1.png";
import { addItemImageMutation, updateCellarSpiritMutation } from "@/queries";
import { formatAsPercentage, formatVintage } from "@/utilities";

const getSpiritQuery = graphql(`
  query GetSpirit($itemId: uuid!) {
    cellar_spirit_by_pk(id: $itemId) {
      spirit {
        id
        name
        created_by_id
        vintage
        type
        description
        alcohol_content_percentage
        style
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
const SpiritDetails = ({
  params: { itemId, cellarId },
}: {
  params: { itemId: string; cellarId: string };
}) => {
  const client = useClient();
  const [{ data, fetching, operation }] = useQuery({
    query: getSpiritQuery,
    variables: { itemId },
  });
  const isLoading = fetching || operation === undefined;

  const spirit = data?.cellar_spirit_by_pk?.spirit;
  const cellar = data?.cellar_spirit_by_pk?.cellar;
  const displayImage = data?.cellar_spirit_by_pk?.display_image;

  const handleCaptureImage = useCallback(
    async (image: string) => {
      if (isNotNil(spirit)) {
        const addImageResult = await client.mutation(addItemImageMutation, {
          input: { image, item_id: spirit.id, item_type: ItemType.Spirit },
        });
        if (isNil(addImageResult.error)) {
          const updateItemResult = await client.mutation(
            updateCellarSpiritMutation,
            {
              spiritId: itemId,
              spirit: {
                display_image_id: addImageResult.data?.item_image_upload?.id,
              },
            },
          );
        }
      }
    },
    [client, spirit, itemId],
  );

  return (
    <Stack spacing={2}>
      <CellarItemHeader
        itemId={itemId}
        itemName={spirit?.name}
        itemType={ItemType.Spirit}
        cellarId={cellarId}
        cellarName={cellar?.name}
        cellarCreatedById={cellar?.created_by_id}
      />
      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          {!isLoading && (
            <ItemImage
              fileId={displayImage?.file_id}
              placeholder={displayImage?.placeholder}
              fallback={spirit1}
              onCaptureImage={handleCaptureImage}
            />
          )}
        </Grid>
        {!isLoading && isNotNil(spirit) && (
          <Grid container xs={12} sm={8}>
            <Grid xs={12} sm={12} lg={6}>
              <Card>
                <ItemDetails
                  title={spirit.name}
                  subTitlePhrases={[
                    formatVintage(spirit.vintage),
                    spirit.type,
                    spirit.style,
                    formatAsPercentage(spirit.alcohol_content_percentage),
                  ]}
                  description={spirit.description}
                />
              </Card>
            </Grid>
            <Grid xs={12} sm={12} lg={6}>
              <Stack spacing={2}>
                <AddReview spiritId={spirit.id} />
                <ItemReviews reviews={spirit.reviews} />
              </Stack>
            </Grid>
          </Grid>
        )}
      </Grid>
    </Stack>
  );
};

export default SpiritDetails;
