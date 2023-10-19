"use client";

import { SpiritOnboarding } from "@/components/spirit/SpiritOnboarding";
import { Box } from "@mui/joy";

const AddSpirit = ({
  params: { cellarId },
}: {
  params: { cellarId: string };
}) => {
  return (
    <Box>
      <SpiritOnboarding
        cellarId={cellarId}
        returnUrl={`/cellars/${cellarId}/items`}
      />
    </Box>
  );
};

export default AddSpirit;
