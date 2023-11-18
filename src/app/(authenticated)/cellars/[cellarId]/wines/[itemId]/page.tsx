"use client";

import { Grid, Stack } from "@mui/joy";
import { graphql } from "@shared/gql";
import { ItemType } from "@shared/gql/graphql";
import {
  addItemImageMutation,
  updateCellarItemMutation,
} from "@shared/queries";
import {
  formatCountry,
  formatWineStyle,
  formatWineVariety,
} from "@shared/utility";
import { isNil, isNotNil } from "ramda";
import { useCallback } from "react";
import { useClient, useQuery } from "urql";
import { CellarItemHeader } from "@/components/item/CellarItemHeader";
import ItemDetails from "@/components/item/ItemDetails";
import { ItemImage } from "@/components/item/ItemImage";
import { ItemRemainingSlider } from "@/components/item/ItemRemainingSlider";
import { ItemReviews } from "@/components/item/ItemReviews";
import { ItemShare } from "@/components/item/ItemShare";
import { AddReview } from "@/components/review/AddReview";
import wine1 from "@/images/wine1.png";
import { formatAsPercentage, formatVintage, parseDate } from "@/utilities";

const getWineQuery = graphql(`
  query GetCellarWine($itemId: uuid!) {
    cellar_items_by_pk(id: $itemId) {
      open_at
      empty_at
      percentage_remaining
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
        co_owners {
          user_id
        }
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

  const item = data?.cellar_items_by_pk;
  const wine = data?.cellar_items_by_pk?.wine;
  const cellar = data?.cellar_items_by_pk?.cellar;
  const displayImage = data?.cellar_items_by_pk?.display_image;

  const handleCaptureImage = useCallback(
    async (image: string) => {
      if (isNotNil(wine)) {
        const addImageResult = await client.mutation(addItemImageMutation, {
          input: { image, item_id: wine.id, item_type: ItemType.Wine },
        });
        if (isNil(addImageResult.error)) {
          const updateItemResult = await client.mutation(
            updateCellarItemMutation,
            {
              id: itemId,
              item: {
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
        cellarCoOwners={cellar?.co_owners.map((x) => x.user_id)}
        cellarCreatedById={cellar?.created_by_id}
      />
      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          {!isLoading && isNotNil(wine) && (
            <ItemImage
              fileId={displayImage?.file_id}
              placeholder={displayImage?.placeholder}
              fallback={wine1}
              onCaptureImage={handleCaptureImage}
            />
          )}
        </Grid>
        {!isLoading && isNotNil(item) && isNotNil(wine) && (
          <Grid container xs={12} sm={8}>
            <Grid xs={12} sm={12} lg={6}>
              <Stack spacing={1}>
                <ItemDetails
                  title={wine.name}
                  subTitlePhrases={[
                    formatVintage(wine.vintage),
                    formatWineStyle(wine.style),
                    formatWineVariety(wine.variety),
                    formatCountry(wine.country),
                    wine.region,
                    formatAsPercentage(wine.alcohol_content_percentage),
                  ]}
                  description={wine.description}
                />
                <ItemRemainingSlider
                  itemId={itemId}
                  percentageRemaining={item.percentage_remaining}
                  opened={parseDate(item.open_at)}
                  emptied={parseDate(item.empty_at)}
                />
                <ItemShare itemId={wine.id} itemType={ItemType.Wine} />
              </Stack>
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
