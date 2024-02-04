"use client";

import { Grid, Stack } from "@mui/joy";
import { useUserId } from "@nhost/nextjs";
import { graphql } from "@shared/gql";
import { ItemType } from "@shared/gql/graphql";
import {
  addItemImageMutation,
  updateCellarItemMutation,
} from "@shared/queries";
import { formatCountry, formatEnum, getIsCellarOwner } from "@shared/utility";
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
import coffee1 from "@/images/coffee1.png";
import { parseDate } from "@/utilities";

const getCoffeeQuery = graphql(`
  query GetCellarCoffee($itemId: uuid!, $userId: uuid!) {
    cellar_items_by_pk(id: $itemId) {
      id
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

const CoffeeDetails = ({
  params: { itemId, cellarId },
}: {
  params: { itemId: string; cellarId: string };
}) => {
  const client = useClient();
  const userId = useUserId();
  if (isNil(userId)) throw new Error("Nil UserId");
  const [{ data, fetching, operation }] = useQuery({
    query: getCoffeeQuery,
    variables: { itemId, userId },
  });
  const isLoading = fetching || operation === undefined;

  const item = data?.cellar_items_by_pk;
  const coffee = data?.cellar_items_by_pk?.coffee;
  const cellar = data?.cellar_items_by_pk?.cellar;
  const user = data?.user;
  const displayImage = data?.cellar_items_by_pk?.display_image;
  const isOwner = getIsCellarOwner(userId, cellar);

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
        isOwner={isOwner}
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
        {!isLoading && isNotNil(item) && isNotNil(coffee) && isNotNil(user) && (
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
                <ItemShare itemId={coffee.id} itemType={ItemType.Coffee} />
              </Stack>
            </Grid>
            <Grid xs={12} sm={12} lg={6}>
              <Stack spacing={2}>
                <AddReview item={coffee} />
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
