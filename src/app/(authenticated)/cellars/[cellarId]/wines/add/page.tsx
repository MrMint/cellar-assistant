"use client";

import WineForm from "@/components/wine/WineForm";
import { Box } from "@mui/joy";

const AddWine = ({
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
      <WineForm cellarId={cellarId} returnUrl={`/cellars/${cellarId}/items`} />
    </Box>
  );
};

export default AddWine;
