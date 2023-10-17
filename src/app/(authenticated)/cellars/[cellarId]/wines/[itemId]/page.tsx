"use client";

import { AspectRatio, Grid, Sheet, Stack, Typography } from "@mui/joy";
import wine1 from "@/app/public/wine1.png";
import Image from "next/image";
import { graphql } from "@/gql";
import { useQuery } from "urql";
import { format, parseISO } from "date-fns";
import { isNotNil } from "ramda";

const getWineQuery = graphql(`
  query GetWine($itemId: uuid!) {
    wines_by_pk(id: $itemId) {
      id
      name
      created_by_id
      region
      variety
      vintage
      ean_13
    }
  }
`);

const ItemDetails = ({
  params: { itemId },
}: {
  params: { itemId: string };
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
    <Grid container spacing={2}>
      <Grid xs={4}>
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
      <Grid xs={8}>
        <Sheet>
          {isLoading === false && wine !== undefined && (
            <Stack spacing={1} padding="1rem">
              <Typography level="h3">{wine.name}</Typography>
              <Typography level="body-md">
                {format(parseISO(wine.vintage), "yyyy")} {wine.variety},{" "}
                {wine.region}
              </Typography>
            </Stack>
          )}
        </Sheet>
      </Grid>
      <Grid></Grid>
    </Grid>
  );
};

export default ItemDetails;
