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
import Image from "next/image";
import NextLink from "next/link";
import { InteractiveCard } from "@/components/common/InteractiveCard";
import beer1 from "@/images/beer1.png";
import coffee1 from "@/images/coffee1.png";
import sake1 from "@/images/sake1.png";
import spirit1 from "@/images/spirit1.png";
import tea1 from "@/images/tea1.png";
import wine1 from "@/images/wine1.png";

type ItemType = "Beer" | "Wine" | "Spirit" | "Coffee" | "Sake" | "Tea";

type AddItemTypeCardProps = {
  type: ItemType;
  /** Absent: shown, not linked (no permission). */
  href?: string;
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
          <Image src={sake1} alt="A sake bottle" fill placeholder="blur" />
        )}
        {type === "Tea" && (
          <Image src={tea1} alt="A tea container" fill placeholder="blur" />
        )}
      </AspectRatio>
    </CardOverflow>
    <CardContent>
      {href === undefined ? (
        <Typography level="title-lg" flexGrow={1} textAlign="center">
          {type}
        </Typography>
      ) : (
        <Link component={NextLink} overlay href={href}>
          <Typography level="title-lg" flexGrow={1} textAlign="center">
            {type}
          </Typography>
        </Link>
      )}
    </CardContent>
  </InteractiveCard>
);

interface AddItemClientProps {
  cellarId?: string;
  /** The cellar's name, for the heading; the server page reads it. */
  cellarName?: string;
  /** Creator or co-owner. Ignored without a cellar (`/add`). */
  canAdd?: boolean;
}

/**
 * `82450ad1:src/components/cellar/AddItemClient.tsx`, restored: the heading,
 * the permission note, and six image cards in the old order linking to the
 * onboarding routes (`/cellars/<id>/<type>s/add`, or `/add/<type>s`).
 *
 * The old component read the cellar's name and owners with a client query;
 * the server page now passes them. One fix (§7): without permission the cards
 * no longer link — the old ones led into a flow whose save could only fail.
 */
export function AddItemClient({
  cellarId,
  cellarName,
  canAdd: canAddProp = true,
}: AddItemClientProps) {
  const canAdd = !cellarId || canAddProp;

  return (
    <Box>
      <Stack spacing={4}>
        <Typography level="h2">
          {cellarId ? `Add an item to ${cellarName}` : "Add an item"}
        </Typography>
        {cellarId && !canAdd && (
          <Typography level="body-md">
            You do not have permission to add items to this cellar.
          </Typography>
        )}
        <Grid container spacing={2}>
          {(
            [
              "Wine",
              "Beer",
              "Spirit",
              "Coffee",
              "Sake",
              "Tea",
            ] satisfies ItemType[]
          ).map((x) => (
            <Grid key={x} xs={6} sm={6} md={4} lg={2}>
              <AddItemTypeCard
                type={x}
                href={
                  !canAdd
                    ? undefined
                    : cellarId
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
