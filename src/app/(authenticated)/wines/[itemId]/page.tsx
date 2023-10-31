"use client";

import { AspectRatio, Grid, Sheet, Stack } from "@mui/joy";
import wine1 from "@/images/wine1.png";
import Image from "next/image";
import { graphql } from "@/gql";
import { useQuery } from "urql";
import { isNotNil } from "ramda";
import ItemDetails from "@/components/item/ItemDetails";
import { formatAsPercentage, formatIsoDateString } from "@/utilities";
import { ItemType } from "@/constants";
import { ItemHeader } from "@/components/item/ItemHeader";

const getWineQuery = graphql(`
  query GetWinePageQuery($itemId: uuid!) {
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
    }
    cellars {
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
  const [{ data, fetching, operation }] = useQuery({
    query: getWineQuery,
    variables: { itemId },
  });

  const isLoading = fetching || operation === undefined;

  let wine = undefined;
  let cellars = undefined;

  if (isLoading === false && isNotNil(data)) {
    if (isNotNil(data.wines_by_pk) && isNotNil(data.wines_by_pk)) {
      wine = data.wines_by_pk;
    }
    if (isNotNil(data.cellars)) {
      cellars = data.cellars;
    }
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
