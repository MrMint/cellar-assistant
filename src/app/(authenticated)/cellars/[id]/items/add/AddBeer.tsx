"use client";

import { graphql } from "@/gql";
import { Box, Button, FormControl, FormLabel, Input, Stack } from "@mui/joy";
import { useUserId } from "@nhost/nextjs";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { useMutation } from "urql";

interface IFormInput {
  name: string;
}

const addBeerMutation = graphql(`
  mutation addBeer($beer: beers_insert_input!) {
    insert_beers_one(object: $beer) {
      id
    }
  }
`);

const AddBeer = ({ cellarId }: { cellarId: string }) => {
  const [{ fetching, data, error }, addBeer] = useMutation(addBeerMutation);
  const userId = useUserId();
  if (userId === undefined) throw Error();

  const { control, handleSubmit } = useForm({
    defaultValues: {
      name: "",
    },
  });

  const onSubmit: SubmitHandler<IFormInput> = async ({ name }) => {
    addBeer({ beer: { cellar_id: cellarId, created_by_id: userId, name } });
  };

  return (
    <Box>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Stack>
          <FormControl required error={error !== undefined}>
            <FormLabel>Name</FormLabel>
            <Controller
              name="name"
              control={control}
              rules={{ required: true }}
              disabled={fetching}
              render={({ field }) => <Input type="text" {...field} />}
            />
          </FormControl>
          <Button loading={fetching} type="submit">
            Add
          </Button>
        </Stack>
      </form>
    </Box>
  );
};

export default AddBeer;
