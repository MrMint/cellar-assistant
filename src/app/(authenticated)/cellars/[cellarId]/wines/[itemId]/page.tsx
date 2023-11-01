"use client";

import { AspectRatio, Grid, Sheet, Stack } from "@mui/joy";
import Image from "next/image";
import { isNotNil } from "ramda";
import { useQuery } from "urql";
import { CellarItemHeader } from "@/components/item/CellarItemHeader";
import ItemDetails from "@/components/item/ItemDetails";
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
      }
      cellar {
        name
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
      />
      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          <Stack>
            <AspectRatio ratio={1}>
              <Image
                src={wine1}
                alt="A picture of a wine bottle"
                placeholder="blur"
              />
            </AspectRatio>
          </Stack>
        </Grid>
        <Grid xs={12} sm={8}>
          <Sheet>
            {isLoading === false && wine !== undefined && (
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
            )}
          </Sheet>
        </Grid>
        <Grid></Grid>
      </Grid>
    </Stack>
  );
};

export default WineDetails;
