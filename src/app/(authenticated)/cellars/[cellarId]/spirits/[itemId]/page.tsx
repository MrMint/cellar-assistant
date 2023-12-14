"use client";

import { Grid, Stack } from "@mui/joy";
import { useUserId } from "@nhost/nextjs";
import { graphql } from "@shared/gql";
import { ItemType } from "@shared/gql/graphql";
import {
  addItemImageMutation,
  updateCellarItemMutation,
} from "@shared/queries";
import {
  formatCountry,
  formatSpiritType,
  getIsCellarOwner,
} from "@shared/utility";
import { isNil, isNotNil } from "ramda";
import { useCallback } from "react";
import { useClient, useQuery } from "urql";
import { CellarItemHeader } from "@/components/item/CellarItemHeader";
import { ItemCheckIns } from "@/components/item/ItemCheckIns";
import ItemDetails from "@/components/item/ItemDetails";
import { ItemImage } from "@/components/item/ItemImage";
import { ItemRemainingSlider } from "@/components/item/ItemRemainingSlider";
import { ItemReviews } from "@/components/item/ItemReviews";
import { ItemShare } from "@/components/item/ItemShare";
import { AddReview } from "@/components/review/AddReview";
import spirit1 from "@/images/spirit1.png";
import { formatAsPercentage, formatVintage, parseDate } from "@/utilities";

const getSpiritQuery = graphql(`
  query GetSpirit($itemId: uuid!, $userId: uuid!) {
    cellar_items_by_pk(id: $itemId) {
      id
      open_at
      empty_at
      percentage_remaining
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
        co_owners {
          user_id
        }
      }
      check_ins(order_by: { created_at: desc }) {
        id
        createdAt: created_at
        user {
          id
          displayName
          avatarUrl
        }
      }
    }
    user(id: $userId) {
      id
      displayName
      avatarUrl
      friends(order_by: { friend: { displayName: desc } }) {
        friend {
          id
          displayName
          avatarUrl
        }
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
  const userId = useUserId();
  if (isNil(userId)) throw new Error("Nil UserId");

  const [{ data, fetching, operation }] = useQuery({
    query: getSpiritQuery,
    variables: { itemId, userId },
  });
  const isLoading = fetching || operation === undefined;

  const item = data?.cellar_items_by_pk;
  const spirit = data?.cellar_items_by_pk?.spirit;
  const cellar = data?.cellar_items_by_pk?.cellar;
  const user = data?.user;
  const displayImage = data?.cellar_items_by_pk?.display_image;
  const isOwner = getIsCellarOwner(userId, cellar);

  const handleCaptureImage = useCallback(
    async (image: string) => {
      if (isNotNil(spirit)) {
        const addImageResult = await client.mutation(addItemImageMutation, {
          input: { image, item_id: spirit.id, item_type: ItemType.Spirit },
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
        isOwner={isOwner}
      />
      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          {!isLoading && isNotNil(spirit) && (
            <ItemImage
              fileId={displayImage?.file_id}
              placeholder={displayImage?.placeholder}
              fallback={spirit1}
              onCaptureImage={handleCaptureImage}
            />
          )}
        </Grid>
        {!isLoading && isNotNil(item) && isNotNil(spirit) && isNotNil(user) && (
          <Grid container xs={12} sm={8}>
            <Grid xs={12} sm={12} lg={6}>
              <Stack spacing={2}>
                <ItemDetails
                  title={spirit.name}
                  subTitlePhrases={[
                    formatVintage(spirit.vintage),
                    formatSpiritType(spirit.type),
                    spirit.style,
                    formatCountry(spirit.country),
                    formatAsPercentage(spirit.alcohol_content_percentage),
                  ]}
                  description={spirit.description}
                />
                {isNotNil(item.open_at) && (
                  <ItemCheckIns
                    checkIns={item.check_ins}
                    itemId={item.id}
                    friends={user.friends.map((x) => x.friend)}
                    user={user}
                  />
                )}
                <ItemRemainingSlider
                  itemId={itemId}
                  isCellarOwner={isOwner}
                  percentageRemaining={item.percentage_remaining}
                  opened={parseDate(item.open_at)}
                  emptied={parseDate(item.empty_at)}
                />
                <ItemShare itemId={spirit.id} itemType={ItemType.Spirit} />
              </Stack>
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
