"use client";

import { BeerOnboarding } from "@/components/beer/BeerOnboarding";
import { Box } from "@mui/joy";

const AddBeer = ({
  params: { cellarId },
}: {
  params: { cellarId: string };
}) => {
  return (
    <Box>
      <BeerOnboarding
        cellarId={cellarId}
        returnUrl={`/cellars/${cellarId}/items`}
      />
    </Box>
  );
};

export default AddBeer;
