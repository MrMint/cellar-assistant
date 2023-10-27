"use client";

import { SpiritOnboarding } from "@/components/spirit/SpiritOnboarding";
import { Box } from "@mui/joy";

const AddSpirit = ({
  params: { cellarId },
}: {
  params: { cellarId: string };
}) => {
  return (
    <SpiritOnboarding
      cellarId={cellarId}
      returnUrl={`/cellars/${cellarId}/items`}
    />
  );
};

export default AddSpirit;
