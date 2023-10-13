"use client";

import { Box } from "@mui/joy";
import AddBeer from "./AddBeer";

const Add = ({ params: { id } }: { params: { id: string } }) => {
  return (
    <Box>
      <AddBeer cellarId={id} />
    </Box>
  );
};

export default Add;
