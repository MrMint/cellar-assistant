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
import wine1 from "@/app/public/wine1.png";
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
      {type === "BEER" && (
        <AspectRatio ratio="1" maxHeight={300}>
          <Image
            src={beer1}
            alt="An image of a beer glass"
            fill
            placeholder="blur"
          />
        </AspectRatio>
      )}
      {type === "WINE" && (
        <AspectRatio ratio="1" maxHeight={300}>
          <Image
            src={wine1}
            alt="An image of a wine bottle"
            fill
            placeholder="blur"
          />
        </AspectRatio>
      )}
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
    wines(where: { cellar_id: { _eq: $cellarId } }) {
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
          <Grid key={x.id} xs={12} sm={6} md={4} lg={3}>
            <ItemCard item={x} type="BEER" />
          </Grid>
        ))}
        {res?.data?.wines.map((x) => (
          <Grid key={x.id} xs={12} sm={6} md={4} lg={3}>
            <ItemCard item={x} type="WINE" />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default withAuth(Items);
