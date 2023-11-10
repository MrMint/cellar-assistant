"use client";

import { Card, Stack, Typography } from "@mui/joy";
import { without } from "ramda";

export type ItemDetailsProp = {
  title: string;
  subTitlePhrases: Array<string | null | undefined>;
  description: string | null | undefined;
};

const ItemDetails = ({
  title,
  subTitlePhrases,
  description,
}: ItemDetailsProp) => (
  <Card>
    <Stack spacing={1}>
      <Typography level="h3">{title}</Typography>
      <Typography level="body-md">
        {without([null, undefined], subTitlePhrases).join(" - ")}
      </Typography>
      <Typography level="body-sm">{description}</Typography>
    </Stack>
  </Card>
);

export default ItemDetails;
