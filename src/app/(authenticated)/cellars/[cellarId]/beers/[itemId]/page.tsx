"use client";

import { Card, Grid, Stack } from "@mui/joy";
import { isNotNil } from "ramda";
import { useQuery } from "urql";
import { CellarItemHeader } from "@/components/item/CellarItemHeader";
import ItemDetails from "@/components/item/ItemDetails";
import { ItemImage } from "@/components/item/ItemImage";
import { ItemReviews } from "@/components/item/ItemReviews";
import { AddReview } from "@/components/review/AddReview";
import { ItemType } from "@/constants";
import { graphql } from "@/gql";
import beer1 from "@/images/beer1.png";
import { formatAsPercentage, formatVintage } from "@/utilities";

const getBeerQuery = graphql(`
  query GetCellarBeer($itemId: uuid!) {
    cellar_beer_by_pk(id: $itemId) {
      beer {
        id
        name
        created_by_id
        vintage
        style
        description
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
      }
    }
  }
`);

const BeerDetails = ({
  params: { itemId, cellarId },
}: {
  params: { itemId: string; cellarId: string };
}) => {
  const [{ data, fetching, operation }] = useQuery({
    query: getBeerQuery,
    variables: { itemId },
  });
  const isLoading = fetching || operation === undefined;

  let beer = undefined;
  let cellar = undefined;
  const displayImage = data?.cellar_beer_by_pk?.display_image;

  if (
    isLoading === false &&
    isNotNil(data) &&
    isNotNil(data.cellar_beer_by_pk) &&
    isNotNil(data.cellar_beer_by_pk.beer)
  ) {
    cellar = data.cellar_beer_by_pk.cellar;
    beer = data.cellar_beer_by_pk.beer;
  }

  return (
    <Stack spacing={2}>
      <CellarItemHeader
        itemType={ItemType.Beer}
        itemId={itemId}
        itemName={beer?.name}
        cellarId={cellarId}
        cellarName={cellar?.name}
      />
      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          <ItemImage
            fileId={displayImage?.file_id}
            placeholder={displayImage?.placeholder}
            fallback={beer1}
          />
        </Grid>
        {isLoading === false && beer !== undefined && (
          <Grid container xs={12} sm={8}>
            <Grid xs={12} sm={12} lg={6}>
              <Card>
                <ItemDetails
                  title={beer.name}
                  subTitlePhrases={[
                    formatVintage(beer.vintage),
                    beer.style,
                    formatAsPercentage(beer.alcohol_content_percentage),
                  ]}
                  description={beer.description}
                />
              </Card>
            </Grid>
            <Grid xs={12} sm={12} lg={6}>
              <Stack spacing={2}>
                <AddReview beerId={beer.id} />
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
