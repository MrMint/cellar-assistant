"use client";

import { AspectRatio, Grid, Sheet, Stack, Typography } from "@mui/joy";
import spirit1 from "@/app/public/spirit1.png";
import Image from "next/image";
import { graphql } from "@/gql";
import { useQuery } from "urql";
import { format, parseISO } from "date-fns";
import { isNotNil, without } from "ramda";
import { Spirit_Type_Enum } from "@/gql/graphql";
import ItemDetails from "@/components/ItemDetails";
import { formatAsPercentage, formatIsoDateString } from "@/utilities";

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
    }
  }
`);
const SpiritDetails = ({
  params: { itemId },
}: {
  params: { itemId: string };
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
  );
};

export default SpiritDetails;
