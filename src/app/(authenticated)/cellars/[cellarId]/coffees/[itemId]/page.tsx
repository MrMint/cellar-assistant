"use client";

import { Grid, Stack } from "@mui/joy";
import { graphql } from "@shared/gql";
import { ItemType } from "@shared/gql/graphql";
import {
  addItemImageMutation,
  updateCellarItemMutation,
} from "@shared/queries";
import { formatCountry, formatEnum } from "@shared/utility";
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
import coffee1 from "@/images/coffee1.png";
import { parseDate } from "@/utilities";

const getCoffeeQuery = graphql(`
  query GetCellarCoffee($itemId: uuid!) {
    cellar_items_by_pk(id: $itemId) {
      open_at
      empty_at
      percentage_remaining
      coffee {
        id
        name
        created_by_id
        description
        country
        process
        roast_level
        species
        cultivar
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

const CoffeeDetails = ({
  params: { itemId, cellarId },
}: {
  params: { itemId: string; cellarId: string };
}) => {
  const client = useClient();
  const [{ data, fetching, operation }] = useQuery({
    query: getCoffeeQuery,
    variables: { itemId },
  });
  const isLoading = fetching || operation === undefined;

  const item = data?.cellar_items_by_pk;
  const coffee = data?.cellar_items_by_pk?.coffee;
  const cellar = data?.cellar_items_by_pk?.cellar;
  const displayImage = data?.cellar_items_by_pk?.display_image;

  const handleCaptureImage = useCallback(
    async (image: string) => {
      if (isNotNil(coffee)) {
        const addImageResult = await client.mutation(addItemImageMutation, {
          input: { image, item_id: coffee.id, item_type: ItemType.Coffee },
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
    [client, coffee, itemId],
  );

  return (
    <Stack spacing={2}>
      <CellarItemHeader
        itemType={ItemType.Coffee}
        itemId={itemId}
        itemName={coffee?.name}
        cellarId={cellarId}
        cellarName={cellar?.name}
        cellarCreatedById={cellar?.created_by_id}
        cellarCoOwners={cellar?.co_owners.map((x) => x.user_id)}
      />
      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          {!isLoading && isNotNil(coffee) && (
            <ItemImage
              fileId={displayImage?.file_id}
              placeholder={displayImage?.placeholder}
              fallback={coffee1}
              onCaptureImage={handleCaptureImage}
            />
          )}
        </Grid>
        {!isLoading && isNotNil(item) && isNotNil(coffee) && (
          <Grid container xs={12} sm={8}>
            <Grid xs={12} sm={12} lg={6}>
              <Stack spacing={1}>
                <ItemDetails
                  title={coffee.name}
                  subTitlePhrases={[
                    formatEnum(coffee.roast_level),
                    formatCountry(coffee.country),
                    formatEnum(coffee.species),
                    formatEnum(coffee.cultivar),
                  ]}
                  description={coffee.description}
                />
                <ItemRemainingSlider
                  itemId={itemId}
                  percentageRemaining={item.percentage_remaining}
                  opened={parseDate(item.open_at)}
                  emptied={parseDate(item.empty_at)}
                />
                <ItemShare itemId={coffee.id} itemType={ItemType.Coffee} />
              </Stack>
            </Grid>
            <Grid xs={12} sm={12} lg={6}>
              <Stack spacing={2}>
                <AddReview coffeeId={coffee.id} />
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
