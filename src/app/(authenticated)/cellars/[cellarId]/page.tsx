"use client";

import { Box, Stack, Typography } from "@mui/joy";

const Cellar = ({ params }: { params: { id: string } }) => {
  return (
    <Box>
      <Stack>
        <Typography>{params.id}</Typography>
      </Stack>
    </Box>
  );
};

export default Cellar;
