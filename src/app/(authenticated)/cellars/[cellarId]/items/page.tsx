"use client";

import { graphql } from "@/gql";
import withAuth from "@/hocs/withAuth";
import {
  AspectRatio,
  Box,
  Button,
  CardActions,
  CardOverflow,
  Grid,
  IconButton,
  Stack,
  Typography,
} from "@mui/joy";
import Image from "next/image";
import { useQuery } from "urql";
import beer1 from "@/images/beer1.png";
import spirit1 from "@/images/spirit1.png";
import wine1 from "@/images/wine1.png";
import { MdAdd, MdFavoriteBorder } from "react-icons/md";
import InteractiveCard from "@/components/common/InteractiveCard";
import TopNavigationBar from "@/components/common/HeaderBar";
import Link from "@/components/common/Link";
import { ItemType } from "@/constants";

type ItemCardProps = {
  item: {
    id: string;
    name: string;
  };
  type: ItemType;
};

const ItemCard = ({ item, type }: ItemCardProps) => (
  <InteractiveCard>
    <CardOverflow>
      {type === ItemType.Beer && (
        <AspectRatio ratio="1" maxHeight={300}>
          <Image
            src={beer1}
            alt="An image of a beer glass"
            fill
            placeholder="blur"
          />
        </AspectRatio>
      )}
      {type === ItemType.Wine && (
        <AspectRatio ratio="1" maxHeight={300}>
          <Image
            src={wine1}
            alt="An image of a wine bottle"
            fill
            placeholder="blur"
          />
        </AspectRatio>
      )}
      {type === ItemType.Spirit && (
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
    <Link overlay href={`${ItemType[type].toLowerCase()}s/${item.id}`}>
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
              <ItemCard item={x} type={ItemType.Beer} />
            </Grid>
          ))}
          {res?.data?.wines.map((x) => (
            <Grid key={x.id} xs={12} sm={6} md={4} lg={2}>
              <ItemCard item={x} type={ItemType.Wine} />
            </Grid>
          ))}
          {res?.data?.spirits.map((x) => (
            <Grid key={x.id} xs={12} sm={6} md={4} lg={2}>
              <ItemCard item={x} type={ItemType.Spirit} />
            </Grid>
          ))}
        </Grid>
      </Stack>
    </Box>
  );
};

export default withAuth(Items);
