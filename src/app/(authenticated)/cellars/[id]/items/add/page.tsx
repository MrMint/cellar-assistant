"use client";

import { Box, Stack, Typography } from "@mui/joy";
import AddBeer from "./AddBeer";
import { graphql } from "@/gql";
import { useQuery } from "urql";
import { useUserId } from "@nhost/nextjs";

const getCellarQuery = graphql(`
  query GetCellar($cellarId: uuid!) {
    cellars_by_pk(id: $cellarId) {
      id
      name
      created_by_id
    }
  }
`);

const Add = ({ params: { id } }: { params: { id: string } }) => {
  const userId = useUserId();
  if (userId === undefined) throw Error();

  const [{ data }] = useQuery({
    query: getCellarQuery,
    variables: { cellarId: id },
  });

  return (
    <Box>
      <Stack>
        <Typography level="h2">
          Add an item to {data?.cellars_by_pk?.name}
        </Typography>
        {data?.cellars_by_pk?.created_by_id !== userId && (
          <Typography level="body-md">
            You do not have permission to add items to this cellar.
          </Typography>
        )}
      </Stack>
      <AddBeer cellarId={id} />
    </Box>
  );
};

export default Add;
