"use client";

import { graphql } from "@cellar-assistant/shared";
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
import Image from "next/image";
import NextLink from "next/link";
import { useQuery } from "urql";
import { InteractiveCard } from "@/components/common/InteractiveCard";
import beer1 from "@/images/beer1.png";
import coffee1 from "@/images/coffee1.png";
import spirit1 from "@/images/spirit1.png";
import wine1 from "@/images/wine1.png";

// Note: Using wine1 as placeholder for sake until sake-specific image is added

type ItemType = "Beer" | "Wine" | "Spirit" | "Coffee" | "Sake";

type AddItemTypeCardProps = {
  type: ItemType;
  href: string;
};

const AddItemTypeCard = ({ type, href }: AddItemTypeCardProps) => (
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
        {type === "Coffee" && (
          <Image
            src={coffee1}
            alt="A bag of coffee beans"
            fill
            placeholder="blur"
          />
        )}
        {type === "Sake" && (
          <Image src={wine1} alt="A sake bottle" fill placeholder="blur" />
        )}
      </AspectRatio>
    </CardOverflow>
    <CardContent>
      <Link component={NextLink} overlay href={href}>
        <Typography level="title-lg" flexGrow={1} textAlign="center">
          {type}
        </Typography>
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
      co_owners {
        user_id
      }
    }
  }
`);

interface AddItemClientProps {
  cellarId?: string;
  userId: string;
}

export function AddItemClient({ cellarId, userId }: AddItemClientProps) {
  const [{ data, fetching }] = useQuery({
    query: getCellarQuery,
    variables: { cellarId: cellarId ?? "" },
    pause: !cellarId,
  });

  const cellar = data?.cellars_by_pk;
  const canAdd =
    !cellarId ||
    cellar?.created_by_id === userId ||
    cellar?.co_owners?.map((x) => x.user_id).includes(userId) === true;

  return (
    <Box>
      <Stack spacing={4}>
        <Typography level="h2">
          {cellarId ? `Add an item to ${cellar?.name}` : "Add an item"}
        </Typography>
        {cellarId && !fetching && !canAdd && (
          <Typography level="body-md">
            You do not have permission to add items to this cellar.
          </Typography>
        )}
        <Grid container spacing={2}>
          {(
            ["Wine", "Beer", "Spirit", "Coffee", "Sake"] satisfies ItemType[]
          ).map((x) => (
            <Grid key={x} xs={6} sm={6} md={4} lg={2}>
              <AddItemTypeCard
                type={x}
                href={
                  cellarId
                    ? `/cellars/${cellarId}/${x.toLowerCase()}s/add`
                    : `/add/${x.toLowerCase()}s`
                }
              />
            </Grid>
          ))}
        </Grid>
      </Stack>
    </Box>
  );
}
