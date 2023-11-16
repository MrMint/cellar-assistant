"use client";

import { Grid, Stack } from "@mui/joy";
import { useUserId } from "@nhost/nextjs";
import { graphql } from "@shared/gql";
import { ItemType } from "@shared/gql/graphql";
import { notFound } from "next/navigation";
import { isNil, isNotNil, nth } from "ramda";
import { useQuery } from "urql";
import ItemDetails from "@/components/item/ItemDetails";
import { ItemHeader } from "@/components/item/ItemHeader";
import { ItemImage } from "@/components/item/ItemImage";
import { ItemReviews } from "@/components/item/ItemReviews";
import { ItemShare } from "@/components/item/ItemShare";
import { AddReview } from "@/components/review/AddReview";
import spirit1 from "@/images/spirit1.png";
import { formatAsPercentage, formatVintage } from "@/utilities";

const getSpiritQuery = graphql(`
  query GetSpiritPageQuery($itemId: uuid!, $userId: uuid!) {
    spirits_by_pk(id: $itemId) {
      id
      name
      created_by_id
      style
      vintage
      description
      alcohol_content_percentage
      type
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

const SpiritDetails = ({
  params: { itemId },
}: {
  params: { itemId: string; cellarId: string };
}) => {
  const userId = useUserId();
  if (isNil(userId)) throw new Error("Bad UserId");

  const [{ data, fetching, operation }] = useQuery({
    query: getSpiritQuery,
    variables: { itemId, userId },
  });

  const isLoading = fetching || operation === undefined;

  const spirit = data?.spirits_by_pk;
  const cellars = data?.cellars;
  const displayImage = nth(0, spirit?.item_images ?? []);
  if (isLoading === false && isNotNil(operation) && isNil(spirit)) {
    notFound();
  }

  return (
    <Stack spacing={2}>
      <ItemHeader
        itemId={itemId}
        itemName={spirit?.name}
        itemType={ItemType.Spirit}
        cellars={cellars}
      />
      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          {!isLoading && isNotNil(spirit) && (
            <Stack spacing={1}>
              <ItemImage
                fileId={displayImage?.file_id}
                placeholder={displayImage?.placeholder}
                fallback={spirit1}
              />
              <ItemShare itemId={spirit.id} itemType={ItemType.Spirit} />
            </Stack>
          )}
        </Grid>
        {!isLoading && isNotNil(spirit) && (
          <Grid container xs={12} sm={8}>
            <Grid xs={12} sm={12} lg={6}>
              <ItemDetails
                title={spirit.name}
                subTitlePhrases={[
                  formatVintage(spirit.vintage),
                  spirit.type,
                  spirit.style,
                  spirit.country,
                  formatAsPercentage(spirit.alcohol_content_percentage),
                ]}
                description={spirit.description}
              />
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
