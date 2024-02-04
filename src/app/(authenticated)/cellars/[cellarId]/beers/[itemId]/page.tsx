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
  formatBeerStyle,
  formatCountry,
  getIsCellarOwner,
} from "@shared/utility";
import { isNil, isNotNil, nth } from "ramda";
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
import beer1 from "@/images/beer1.png";
import { formatAsPercentage, formatVintage, parseDate } from "@/utilities";

const getBeerQuery = graphql(`
  query GetCellarBeer($itemId: uuid!, $userId: uuid!) {
    cellar_items_by_pk(id: $itemId) {
      id
      open_at
      empty_at
      percentage_remaining
      beer {
        id
        name
        created_by_id
        vintage
        style
        description
        alcohol_content_percentage
        country
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

const BeerDetails = ({
  params: { itemId, cellarId },
}: {
  params: { itemId: string; cellarId: string };
}) => {
  const client = useClient();
  const userId = useUserId();
  if (isNil(userId)) throw new Error("Nil UserId");

  const [{ data, fetching, operation }] = useQuery({
    query: getBeerQuery,
    variables: { itemId, userId },
  });
  const isLoading = fetching || operation === undefined;

  const item = data?.cellar_items_by_pk;
  const beer = data?.cellar_items_by_pk?.beer;
  const cellar = data?.cellar_items_by_pk?.cellar;
  const user = data?.user;
  const displayImage = data?.cellar_items_by_pk?.display_image;
  const isOwner = getIsCellarOwner(userId, cellar);

  const handleCaptureImage = useCallback(
    async (image: string) => {
      if (isNotNil(beer)) {
        const addImageResult = await client.mutation(addItemImageMutation, {
          input: { image, item_id: beer.id, item_type: ItemType.Beer },
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
        isOwner={isOwner}
      />
      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          {!isLoading && isNotNil(beer) && (
            <ItemImage
              fileId={displayImage?.file_id}
              placeholder={displayImage?.placeholder}
              fallback={beer1}
              onCaptureImage={handleCaptureImage}
            />
          )}
        </Grid>
        {!isLoading && isNotNil(item) && isNotNil(beer) && isNotNil(user) && (
          <Grid container xs={12} sm={8}>
            <Grid xs={12} sm={12} lg={6}>
              <Stack spacing={2}>
                <ItemDetails
                  itemId={beer.id}
                  type={ItemType.Beer}
                  favoriteId={nth(0, beer.item_favorites)?.id}
                  title={beer.name}
                  subTitlePhrases={[
                    formatVintage(beer.vintage),
                    formatBeerStyle(beer.style),
                    formatCountry(beer.country),
                    formatAsPercentage(beer.alcohol_content_percentage),
                  ]}
                  description={beer.description}
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
                <ItemShare itemId={beer.id} itemType={ItemType.Beer} />
              </Stack>
            </Grid>
            <Grid xs={12} sm={12} lg={6}>
              <Stack spacing={2}>
                <AddReview item={beer} />
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
