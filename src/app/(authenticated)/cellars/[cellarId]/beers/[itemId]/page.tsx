"use client";

import { AspectRatio, Grid, Sheet, Stack } from "@mui/joy";
import Image from "next/image";
import { isNotNil } from "ramda";
import { useQuery } from "urql";
import { CellarItemHeader } from "@/components/item/CellarItemHeader";
import ItemDetails from "@/components/item/ItemDetails";
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
          <Stack>
            <AspectRatio ratio={1}>
              <Image
                src={beer1}
                alt="A picture of a beer bottle"
                placeholder="blur"
              />
            </AspectRatio>
          </Stack>
        </Grid>
        <Grid xs={12} sm={8}>
          <Sheet>
            {isLoading === false && beer !== undefined && (
              <ItemDetails
                title={beer.name}
                subTitlePhrases={[
                  formatVintage(beer.vintage),
                  beer.style,
                  formatAsPercentage(beer.alcohol_content_percentage),
                ]}
                description={beer.description}
              />
            )}
          </Sheet>
        </Grid>
        <Grid></Grid>
      </Grid>
    </Stack>
  );
};

export default BeerDetails;
