"use client";

import { WineOnboarding } from "@/components/wine/WineOnboarding";
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
      <WineOnboarding
        cellarId={cellarId}
        returnUrl={`/cellars/${cellarId}/items`}
      />
    </Box>
  );
};

export default AddWine;
