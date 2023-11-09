"use client";

import { Card, Grid, Sheet, Stack } from "@mui/joy";
import { isNotNil } from "ramda";
import { useQuery } from "urql";
import { CellarItemHeader } from "@/components/item/CellarItemHeader";
import ItemDetails from "@/components/item/ItemDetails";
import { ItemImage } from "@/components/item/ItemImage";
import { ItemReviews } from "@/components/item/ItemReviews";
import { AddReview } from "@/components/review/AddReview";
import { ItemType } from "@/constants";
import { graphql } from "@/gql";
import wine1 from "@/images/wine1.png";
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
  const [{ data, fetching, operation }] = useQuery({
    query: getWineQuery,
    variables: { itemId },
  });
  const isLoading = fetching || operation === undefined;

  let wine = undefined;
  let cellar = undefined;
  const displayImage = data?.cellar_wine_by_pk?.display_image;

  if (
    isLoading === false &&
    isNotNil(data) &&
    isNotNil(data.cellar_wine_by_pk) &&
    isNotNil(data.cellar_wine_by_pk.wine)
  ) {
    cellar = data.cellar_wine_by_pk.cellar;
    wine = data.cellar_wine_by_pk.wine;
  }

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
          {!isLoading && (
            <ItemImage
              fileId={displayImage?.file_id}
              placeholder={displayImage?.placeholder}
              fallback={wine1}
            />
          )}
        </Grid>
        {!isLoading && isNotNil(wine) && (
          <Grid container xs={12} sm={8}>
            <Grid xs={12} sm={12} lg={6}>
              <Card>
                <ItemDetails
                  title={wine.name}
                  subTitlePhrases={[
                    formatVintage(wine.vintage),
                    wine.variety,
                    wine.region,
                    formatAsPercentage(wine.alcohol_content_percentage),
                  ]}
                  description={wine.description}
                />
              </Card>
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
