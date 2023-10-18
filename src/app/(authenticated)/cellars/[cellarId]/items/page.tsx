"use client";

import { graphql } from "@/gql";
import withAuth from "@/hocs/withAuth";
import {
  AspectRatio,
  Box,
  Button,
  Card,
  CardActions,
  CardOverflow,
  Grid,
  IconButton,
  Stack,
  Typography,
} from "@mui/joy";
import Image from "next/image";
import { useQuery } from "urql";
import beer1 from "@/app/public/beer1.png";
import spirit1 from "@/app/public/spirit1.png";
import wine1 from "@/app/public/wine1.png";
import { MdAdd, MdFavoriteBorder } from "react-icons/md";
import InteractiveCard from "@/components/InteractiveCard";
import TopNavigationBar from "@/components/HeaderBar";
import Link from "@/components/Link";

type ItemCardProps = {
  item: {
    id: string;
    name: string;
  };
  type: "BEER" | "WINE" | "SPIRIT";
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
      {type === "SPIRIT" && (
        <AspectRatio ratio="1" maxHeight={300}>
          <Image
            src={spirit1}
            alt="An image of a liquor bottle"
            fill
            placeholder="blur"
          />
        </AspectRatio>
      )}
    </CardOverflow>
    <Link overlay href={`${type.toLowerCase()}s/${item.id}`}>
      <Typography level="title-md">{item.name}</Typography>
    </Link>
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
    spirits(where: { cellar_id: { _eq: $cellarId } }) {
      id
      name
    }
    cellars_by_pk(id: $cellarId) {
      id
      name
    }
  }
`);

const Items = ({ params: { cellarId } }: { params: { cellarId: string } }) => {
  const [res] = useQuery({
    query: itemsSub,
    variables: { cellarId },
  });

  return (
    <Box>
      <Stack spacing={2}>
        <TopNavigationBar
          breadcrumbs={[
            { url: "/cellars", text: "Cellars" },
            {
              url: `items`,
              text: res.data?.cellars_by_pk?.name ?? "loading...",
            },
          ]}
          endComponent={
            <Button
              component={Link}
              href={"items/add"}
              startDecorator={<MdAdd />}
            >
              Add item
            </Button>
          }
        />
        <Grid container spacing={2}>
          {res?.data?.beers.map((x) => (
            <Grid key={x.id} xs={12} sm={6} md={4} lg={2}>
              <ItemCard item={x} type="BEER" />
            </Grid>
          ))}
          {res?.data?.wines.map((x) => (
            <Grid key={x.id} xs={12} sm={6} md={4} lg={2}>
              <ItemCard item={x} type="WINE" />
            </Grid>
          ))}
          {res?.data?.spirits.map((x) => (
            <Grid key={x.id} xs={12} sm={6} md={4} lg={2}>
              <ItemCard item={x} type="SPIRIT" />
            </Grid>
          ))}
        </Grid>
      </Stack>
    </Box>
  );
};

export default withAuth(Items);
