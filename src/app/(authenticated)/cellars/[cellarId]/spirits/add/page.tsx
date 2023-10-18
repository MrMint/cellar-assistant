"use client";

import SpiritForm from "@/components/spirit/SpiritForm";
import { Box } from "@mui/joy";

const AddSpirit = ({
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
      <SpiritForm
        cellarId={cellarId}
        returnUrl={`/cellars/${cellarId}/items`}
      />
    </Box>
  );
};

export default AddSpirit;
