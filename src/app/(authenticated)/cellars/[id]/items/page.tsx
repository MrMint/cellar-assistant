"use client";

import { graphql } from "@/gql";
import withAuth from "@/hocs/withAuth";
import { Box, Card, Grid, Typography } from "@mui/joy";
import { useQuery, useSubscription } from "urql";

const itemsSub = graphql(`
  query GetItemsQuery($cellarId: uuid!) {
    beers(where: { cellar_id: { _eq: $cellarId } }) {
      id
      name
    }
    items(where: { cellar_id: { _eq: $cellarId } }) {
      id
      name
    }
  }
`);

const Items = ({ params: { id } }: { params: { id: string } }) => {
  const [res] = useQuery({
    query: itemsSub,
    variables: { cellarId: id },
  });

  return (
    <Box sx={{ padding: "1rem" }}>
      <Grid container spacing={2} sx={{ flexGrow: 1 }}>
        {res?.data?.beers.map((x) => (
          <Grid key={x.id} xs={6} md={4}>
            <Card>
              <Typography level="title-lg">{x.name}</Typography>
              <Typography level="body-sm">April 24 to May 02, 2021</Typography>
            </Card>
          </Grid>
        ))}
        {res?.data?.items.map((x) => (
          <Grid key={x.id} xs={6} md={4}>
            <Card>
              <Typography level="title-lg">{x.name}</Typography>
              <Typography level="body-sm">April 24 to May 02, 2021</Typography>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default withAuth(Items);
