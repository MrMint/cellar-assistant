"use client";

import {
  AspectRatio,
  Box,
  CardContent,
  CardOverflow,
  Grid,
  Stack,
  Typography,
} from "@mui/joy";
import AddBeer from "./AddBeer";
import { graphql } from "@/gql";
import { useQuery } from "urql";
import { useUserId } from "@nhost/nextjs";
import { useState } from "react";
import InteractiveCard from "@/components/InteractiveCard";
import beer1 from "@/app/public/beer1.png";
import wine1 from "@/app/public/wine1.png";
import liquor1 from "@/app/public/liquor1.png";
import Image from "next/image";
import AddWine from "./AddWine";
import AddLiquor from "./AddLiquor";

type ItemType = "Beer" | "Wine" | "Liquor";

type AddItemTypeCardProps = {
  type: ItemType;
  onClick: (type: ItemType) => void;
};

const AddItemTypeCard = ({ type, onClick }: AddItemTypeCardProps) => (
  <InteractiveCard onClick={() => onClick(type)}>
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
        {type === "Liquor" && (
          <Image
            src={liquor1}
            alt="An image of a liquor bottle"
            fill
            placeholder="blur"
          />
        )}
      </AspectRatio>
    </CardOverflow>
    <CardContent>
      <Typography level="title-lg">{type}</Typography>
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

const Add = ({ params: { id } }: { params: { id: string } }) => {
  const [addType, setAddType] = useState<ItemType | undefined>(undefined);
  const userId = useUserId();
  if (userId === undefined) throw Error();

  const [{ data }] = useQuery({
    query: getCellarQuery,
    variables: { cellarId: id },
  });

  const handleTypeClick = (type: ItemType) => setAddType(type);
  return (
    <Box>
      <Stack spacing={4}>
        <Typography level="h2">
          Add an item to {data?.cellars_by_pk?.name}
        </Typography>
        {data?.cellars_by_pk?.created_by_id !== userId && (
          <Typography level="body-md">
            You do not have permission to add items to this cellar.
          </Typography>
        )}
        {addType === undefined && (
          <Grid container spacing={2}>
            <Grid xs={12} sm={6} md={4} lg={3}>
              <AddItemTypeCard type="Wine" onClick={handleTypeClick} />
            </Grid>
            <Grid xs={12} sm={6} md={4} lg={3}>
              <AddItemTypeCard type="Beer" onClick={handleTypeClick} />
            </Grid>
            <Grid xs={12} sm={6} md={4} lg={3}>
              <AddItemTypeCard type="Liquor" onClick={handleTypeClick} />
            </Grid>
          </Grid>
        )}
        {addType === "Beer" && <AddBeer cellarId={id} />}
        {addType === "Wine" && <AddWine cellarId={id} />}
        {addType === "Liquor" && <AddLiquor cellarId={id} />}
      </Stack>
    </Box>
  );
};

export default Add;
