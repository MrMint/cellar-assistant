"use client";

import { AspectRatio, Grid, Sheet, Stack, Typography } from "@mui/joy";
import beer1 from "@/app/public/beer1.png";
import Image from "next/image";
import { graphql } from "@/gql";
import { useQuery } from "urql";
import { format, parseISO } from "date-fns";
import { isNotNil } from "ramda";

const getBeerQuery = graphql(`
  query GetBeer($itemId: uuid!) {
    beers_by_pk(id: $itemId) {
      id
      name
      created_by_id
      vintage
      style
    }
  }
`);

const ItemDetails = ({
  params: { itemId },
}: {
  params: { itemId: string };
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
    <Grid container spacing={2}>
      <Grid xs={4}>
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
      <Grid xs={8}>
        <Sheet>
          {isLoading === false && beer !== undefined && (
            <Stack spacing={1} padding="1rem">
              <Typography level="h3">{beer.name}</Typography>
              <Typography level="body-md">
                {isNotNil(beer.vintage) &&
                  format(parseISO(beer.vintage), "yyyy")}{" "}
                {beer.style}
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
