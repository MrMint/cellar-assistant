"use client";

import { AspectRatio, Grid, Sheet, Stack } from "@mui/joy";
import wine1 from "@/images/wine1.png";
import Image from "next/image";
import { graphql } from "@/gql";
import { useQuery } from "urql";
import { isNotNil } from "ramda";
import ItemDetails from "@/components/item/ItemDetails";
import { formatAsPercentage, formatIsoDateString } from "@/utilities";
import ItemHeader from "@/components/item/ItemHeader";
import { ItemType } from "@/constants";

const getWineQuery = graphql(`
  query GetWine($itemId: uuid!) {
    wines_by_pk(id: $itemId) {
      id
      name
      created_by_id
      region
      variety
      vintage
      description
      barcode_code
      alcohol_content_percentage
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
  if (isLoading === false && data !== undefined && isNotNil(data.wines_by_pk)) {
    wine = data.wines_by_pk;
  }

  return (
    <Stack spacing={2}>
      <ItemHeader
        itemId={itemId}
        itemName={wine?.name}
        itemType={ItemType.Wine}
        cellarId={cellarId}
        cellarName={wine?.cellar?.name}
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
                  formatIsoDateString(wine.vintage, "yyyy"),
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
