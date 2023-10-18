"use client";

import { AspectRatio, Grid, Sheet, Stack, Typography } from "@mui/joy";
import spirit1 from "@/app/public/spirit1.png";
import Image from "next/image";
import { graphql } from "@/gql";
import { useQuery } from "urql";
import { isNotNil } from "ramda";
import ItemDetails from "@/components/ItemDetails";
import { formatAsPercentage, formatIsoDateString } from "@/utilities";
import ItemHeader from "@/components/ItemHeader";

const getSpiritQuery = graphql(`
  query GetSpirit($itemId: uuid!) {
    spirits_by_pk(id: $itemId) {
      id
      name
      created_by_id
      vintage
      type
      description
      alcohol_content_percentage
      style
      cellar {
        name
      }
    }
  }
`);
const SpiritDetails = ({
  params: { itemId, cellarId },
}: {
  params: { itemId: string; cellarId: string };
}) => {
  const [{ data, fetching, operation }] = useQuery({
    query: getSpiritQuery,
    variables: { itemId },
  });
  const isLoading = fetching || operation === undefined;

  let spirit = undefined;
  if (
    isLoading === false &&
    data !== undefined &&
    isNotNil(data.spirits_by_pk)
  ) {
    spirit = data.spirits_by_pk;
  }

  return (
    <Stack spacing={2}>
      <ItemHeader
        itemId={itemId}
        itemName={spirit?.name}
        cellarId={cellarId}
        cellarName={spirit?.cellar?.name}
      />
      <Grid container spacing={2}>
        <Grid xs={4}>
          <Stack>
            <AspectRatio ratio={1}>
              <Image
                src={spirit1}
                alt="A picture of a beer bottle"
                placeholder="blur"
              />
            </AspectRatio>
          </Stack>
        </Grid>
        <Grid xs={8}>
          <Sheet>
            {isLoading === false && spirit !== undefined && (
              <ItemDetails
                title={spirit.name}
                subTitlePhrases={[
                  formatIsoDateString(spirit.vintage, "yyyy"),
                  spirit.type,
                  spirit.style,
                  formatAsPercentage(spirit.alcohol_content_percentage),
                ]}
                description={spirit.description}
              />
            )}
          </Sheet>
        </Grid>
        <Grid></Grid>
      </Grid>
    </Stack>
  );
};

export default SpiritDetails;
