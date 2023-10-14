"use client";

import { graphql } from "@/gql";
import { Box, Button, FormControl, FormLabel, Input, Stack } from "@mui/joy";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [{ fetching, error }, addBeer] = useMutation(addBeerMutation);

  const { control, handleSubmit } = useForm({
    defaultValues: {
      name: "",
    },
  });

  const onSubmit: SubmitHandler<IFormInput> = async ({ name }) => {
    addBeer({ beer: { cellar_id: cellarId, name } }).then((result) => {
      if (result.error === undefined) {
        router.push(`/cellars/${cellarId}/items`);
      }
    });
  };

  return (
    <Box
      sx={(theme) => ({
        width: theme.breakpoints.values.sm,
      })}
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <Stack spacing={2}>
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
