"use client";

import { AspectRatio, Grid, Sheet, Stack } from "@mui/joy";
import beer1 from "@/app/public/beer1.png";
import Image from "next/image";
import { graphql } from "@/gql";
import { useQuery } from "urql";
import { isNotNil } from "ramda";
import ItemDetails from "@/components/item/ItemDetails";
import { formatAsPercentage, formatIsoDateString } from "@/utilities";
import ItemHeader from "@/components/item/ItemHeader";
import { ItemType } from "@/constants";

const getBeerQuery = graphql(`
  query GetBeer($itemId: uuid!) {
    beers_by_pk(id: $itemId) {
      id
      name
      created_by_id
      vintage
      style
      description
      alcohol_content_percentage
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
  if (isLoading === false && data !== undefined && isNotNil(data.beers_by_pk)) {
    beer = data.beers_by_pk;
  }

  return (
    <Stack spacing={2}>
      <ItemHeader
        itemType={ItemType.Beer}
        itemId={itemId}
        itemName={beer?.name}
        cellarId={cellarId}
        cellarName={beer?.cellar?.name}
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
        <Grid xs={12} smOffset={8}>
          <Sheet>
            {isLoading === false && beer !== undefined && (
              <ItemDetails
                title={beer.name}
                subTitlePhrases={[
                  formatIsoDateString(beer.vintage, "yyyy"),
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
