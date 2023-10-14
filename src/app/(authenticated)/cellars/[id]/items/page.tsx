"use client";

import { graphql } from "@/gql";
import withAuth from "@/hocs/withAuth";
import {
  AspectRatio,
  Box,
  Card,
  CardActions,
  CardOverflow,
  Grid,
  IconButton,
  Typography,
} from "@mui/joy";
import Image from "next/image";
import { useQuery } from "urql";
import beer1 from "@/app/public/beer1.png";
import { MdFavoriteBorder } from "react-icons/md";
import InteractiveCard from "@/components/InteractiveCard";

type ItemCardProps = {
  item: {
    id: string;
    name: string;
  };
  type: "BEER" | "WINE";
};

const ItemCard = ({ item, type }: ItemCardProps) => (
  <InteractiveCard>
    <CardOverflow>
      <AspectRatio ratio="2">
        {type === "BEER" && (
          <Image src={beer1} alt="An image of a beer glass" fill />
        )}
      </AspectRatio>
    </CardOverflow>
    <Typography level="title-lg">{item.name}</Typography>
    <CardActions buttonFlex="0 1 120px">
      <IconButton
        variant="outlined"
        color="neutral"
        sx={{ mr: "auto" }}
        disabled
      >
        <MdFavoriteBorder />
      </IconButton>
    </CardActions>
  </InteractiveCard>
);

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
    <Box sx={{ height: "100%", width: "100%" }}>
      <Grid container spacing={2} sx={{ flexGrow: 1 }}>
        {res?.data?.beers.map((x) => (
          <Grid key={x.id} xs={12} sm={6} md={4}>
            <ItemCard item={x} type="BEER" />
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
