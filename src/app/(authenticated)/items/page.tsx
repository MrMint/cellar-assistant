"use client";

import { graphql } from "@/gql";
import withAuth from "@/hocs/withAuth";
import { Card, Grid, Typography } from "@mui/joy";
import { useSubscription } from "urql";

const itemsSub = graphql(`
  subscription GetItemsStream {
    items {
      id
      name
      type
    }
  }
`);

const handleSubscription = (messages = [], response: { items: [] }) => {
  return [response.items, ...messages];
};

const Items = () => {
  const [res] = useSubscription({ query: itemsSub });

  return (
    <div>
      <Grid container spacing={2} sx={{ flexGrow: 1 }}>
        {res?.data?.items.map((x) => (
          <Grid key={x.id} xs={6} md={4}>
            <Card>
              <Typography level="title-lg">{x.name}</Typography>
              <Typography level="body-sm">April 24 to May 02, 2021</Typography>
            </Card>
          </Grid>
        ))}
      </Grid>
    </div>
  );
};

export default withAuth(Items);
