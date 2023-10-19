"use client";

import { graphql } from "@/gql";
import { Box, Button, FormControl, FormLabel, Input, Stack } from "@mui/joy";
import { useUserId } from "@nhost/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { useMutation } from "urql";

interface IFormInput {
  name: string;
}

const addCellarMutation = graphql(`
  mutation addCellar($cellar: cellars_insert_input!) {
    insert_cellars_one(object: $cellar) {
      id
    }
  }
`);
const addUserToCellarMutation = graphql(`
  mutation addUserToCellarUsers($cellarUser: cellar_user_insert_input!) {
    insert_cellar_user_one(object: $cellarUser) {
      id
    }
  }
`);

const AddCellar = () => {
  const router = useRouter();
  const [addCellar, addCellarAsync] = useMutation(addCellarMutation);
  const [addCellarUser, addCellarUserAsync] = useMutation(
    addUserToCellarMutation,
  );

  const userId = useUserId();
  if (userId === undefined) throw Error();

  const { control, handleSubmit } = useForm({
    defaultValues: {
      name: "",
    },
  });

  const onSubmit: SubmitHandler<IFormInput> = async ({ name }) => {
    // TODO hasura supports transactions around mutations via a combined mutation
    // graphql-codegen may not support typings around multiple mutations
    // hasura supports nested data updates, how do we set the cellar_id during create path (generated during upsert)?
    // investigate....
    const result = await addCellarAsync({
      cellar: {
        name,
      },
    });
    if (result.error === undefined) {
      await addCellarUserAsync({
        cellarUser: {
          cellar_id: result.data?.insert_cellars_one?.id,
          user_id: userId,
        },
      });
    }
  };
  const isFetching = addCellar.fetching || addCellarUser.fetching;

  useEffect(() => {
    if (addCellar.error === undefined && addCellarUser.error === undefined) {
      if (addCellar.fetching === false && addCellarUser.fetching === false) {
        if (
          addCellar.operation !== undefined &&
          addCellarUser.operation !== undefined
        ) {
          router.push("/cellars");
        }
      }
    }
  }, [addCellar, addCellarUser, router]);

  return (
    <Box
      sx={(theme) => ({
        maxWidth: theme.breakpoints.values.sm,
      })}
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <Stack spacing={2}>
          <FormControl
            required
            error={
              addCellar.error !== undefined || addCellarUser.error !== undefined
            }
          >
            <FormLabel>Name</FormLabel>
            <Controller
              name="name"
              control={control}
              rules={{ required: true }}
              disabled={isFetching}
              render={({ field }) => <Input type="text" {...field} />}
            />
          </FormControl>
          <Button loading={isFetching} type="submit">
            Add
          </Button>
        </Stack>
      </form>
    </Box>
  );
};

export default AddCellar;
