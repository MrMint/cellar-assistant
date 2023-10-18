"use client";

import { Stack, Typography } from "@mui/joy";
import { without } from "ramda";

const ItemDetails = ({
  title,
  subTitlePhrases,
  description,
}: {
  title: string;
  subTitlePhrases: Array<string | null | undefined>;
  description: string | null | undefined;
}) => (
  <Stack spacing={1} padding="1rem">
    <Typography level="h3">{title}</Typography>
    <Typography level="body-md">
      {without([null, undefined], subTitlePhrases).join(" - ")}
    </Typography>
    <Typography level="body-sm">{description}</Typography>
  </Stack>
);

export default ItemDetails;
