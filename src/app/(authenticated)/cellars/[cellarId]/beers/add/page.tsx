"use client";

import BeerForm from "@/components/beer/BeerForm";
import { Box } from "@mui/joy";

const AddBeer = ({
  params: { cellarId },
}: {
  params: { cellarId: string };
}) => {
  return (
    <Box
      sx={(theme) => ({
        width: theme.breakpoints.values.sm,
      })}
    >
      <BeerForm cellarId={cellarId} returnUrl={`/cellars/${cellarId}/items`} />
    </Box>
  );
};

export default AddBeer;
