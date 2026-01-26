"use client";

import { Box, Stack, Typography } from "@mui/joy";
import { use } from "react";

const Cellar = ({ params }: { params: Promise<{ cellarId: string }> }) => {
  const { cellarId } = use(params);
  return (
    <Box>
      <Stack>
        <Typography>{cellarId}</Typography>
      </Stack>
    </Box>
  );
};

export default Cellar;
