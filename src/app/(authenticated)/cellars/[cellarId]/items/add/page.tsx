"use client";

import {
  AspectRatio,
  Box,
  CardContent,
  CardOverflow,
  Grid,
  Link,
  Stack,
  Typography,
} from "@mui/joy";
import { graphql } from "@/gql";
import { useQuery } from "urql";
import { useUserId } from "@nhost/nextjs";
import InteractiveCard from "@/components/common/InteractiveCard";
import beer1 from "@/images/beer1.png";
import wine1 from "@/images/wine1.png";
import spirit1 from "@/images/spirit1.png";
import Image from "next/image";
import NextLink from "next/link";

type ItemType = "Beer" | "Wine" | "Spirit";

type AddItemTypeCardProps = {
  type: ItemType;
  cellarId: string;
};

const AddItemTypeCard = ({ type, cellarId }: AddItemTypeCardProps) => (
  <InteractiveCard>
    <CardOverflow>
      <AspectRatio ratio="1">
        {type === "Beer" && (
          <Image
            src={beer1}
            alt="An image of a beer glass"
            fill
            placeholder="blur"
          />
        )}
        {type === "Wine" && (
          <Image
            src={wine1}
            alt="An image of a wine bottle"
            fill
            placeholder="blur"
          />
        )}
        {type === "Spirit" && (
          <Image
            src={spirit1}
            alt="An image of a liquor bottle"
            fill
            placeholder="blur"
          />
        )}
      </AspectRatio>
    </CardOverflow>
    <CardContent>
      <Link
        component={NextLink}
        overlay
        href={`/cellars/${cellarId}/${type.toLowerCase()}s/add`}
      >
        <Typography level="title-lg">{type}</Typography>
      </Link>
    </CardContent>
  </InteractiveCard>
);

const getCellarQuery = graphql(`
  query GetCellar($cellarId: uuid!) {
    cellars_by_pk(id: $cellarId) {
      id
      name
      created_by_id
    }
  }
`);

const Add = ({ params: { cellarId } }: { params: { cellarId: string } }) => {
  const userId = useUserId();
  if (userId === undefined) throw Error();

  const [{ data, fetching }] = useQuery({
    query: getCellarQuery,
    variables: { cellarId },
  });

  return (
    <Box>
      <Stack spacing={4}>
        <Typography level="h2">
          Add an item to {data?.cellars_by_pk?.name}
        </Typography>
        {!fetching && data?.cellars_by_pk?.created_by_id !== userId && (
          <Typography level="body-md">
            You do not have permission to add items to this cellar.
          </Typography>
        )}
        <Grid container spacing={2}>
          {new Array<ItemType>("Wine", "Beer", "Spirit").map((x) => (
            <Grid key={x} xs={12} sm={6} md={4} lg={2}>
              <AddItemTypeCard type={x} cellarId={cellarId} />
            </Grid>
          ))}
        </Grid>
      </Stack>
    </Box>
  );
};

export default Add;
