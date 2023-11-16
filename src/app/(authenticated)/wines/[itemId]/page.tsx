"use client";

import { AspectRatio, Card, Grid, Sheet, Stack } from "@mui/joy";
import { useUserId } from "@nhost/nextjs";
import { graphql } from "@shared/gql";
import { ItemType } from "@shared/gql/graphql";
import { formatCountry, formatWineVariety } from "@shared/utility";
import Image from "next/image";
import { notFound } from "next/navigation";
import { isNil, isNotNil, nth } from "ramda";
import { useQuery } from "urql";
import ItemDetails from "@/components/item/ItemDetails";
import { ItemHeader } from "@/components/item/ItemHeader";
import { ItemImage } from "@/components/item/ItemImage";
import { ItemReviews } from "@/components/item/ItemReviews";
import { ItemShare } from "@/components/item/ItemShare";
import { AddReview } from "@/components/review/AddReview";
import wine1 from "@/images/wine1.png";
import { formatAsPercentage, formatVintage } from "@/utilities";

const getWineQuery = graphql(`
  query GetWinePageQuery($itemId: uuid!, $userId: uuid!) {
    wines_by_pk(id: $itemId) {
      id
      name
      created_by_id
      region
      variety
      style
      vintage
      description
      barcode_code
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

const WineDetails = ({
  params: { itemId },
}: {
  params: { itemId: string; cellarId: string };
}) => {
  const userId = useUserId();
  if (isNil(userId)) throw new Error("Bad UserId");

  const [{ data, fetching, operation }] = useQuery({
    query: getWineQuery,
    variables: { itemId, userId },
  });

  const isLoading = fetching || operation === undefined;

  const wine = data?.wines_by_pk;
  const cellars = data?.cellars;
  const displayImage = nth(0, wine?.item_images ?? []);
  if (isLoading === false && isNotNil(operation) && isNil(wine)) {
    notFound();
  }

  return (
    <Stack spacing={2}>
      <ItemHeader
        itemId={itemId}
        itemName={wine?.name}
        itemType={ItemType.Wine}
        cellars={cellars}
      />
      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          {!isLoading && isNotNil(wine) && (
            <Stack spacing={1}>
              <ItemImage
                fileId={displayImage?.file_id}
                placeholder={displayImage?.placeholder}
                fallback={wine1}
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
                  formatWineVariety(wine.variety),
                  formatCountry(wine.country),
                  wine.region,
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
