"use client";

import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Option,
  Select,
  Stack,
  Typography,
} from "@mui/joy";
import { isNil, isNotNil } from "ramda";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { CombinedError, useClient } from "urql";
import { permissionKeys } from "@/constants";
import { graphql } from "@/gql";
import { Permission_Type_Enum } from "@/gql/graphql";

interface IFormInput {
  name: string;
  privacy: Permission_Type_Enum;
}

export type CellarFormProps = {
  onSubmitted: (id: string) => void;
  id?: string;
  defaults?: {
    name?: string;
    privacy?: Permission_Type_Enum;
  };
};

const addCellarMutation = graphql(`
  mutation AddCellar($cellar: cellars_insert_input!) {
    insert_cellars_one(object: $cellar) {
      id
    }
  }
`);

const editCellarMutation = graphql(`
  mutation EditCellar($id: uuid!, $cellar: cellars_set_input!) {
    update_cellars_by_pk(pk_columns: { id: $id }, _set: $cellar) {
      id
    }
  }
`);

export const CellarForm = ({
  id,
  onSubmitted,
  defaults = {},
}: CellarFormProps) => {
  const client = useClient();

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors, isSubmitted },
  } = useForm<IFormInput>({ defaultValues: defaults });

  const onSubmit: SubmitHandler<IFormInput> = async ({ name, privacy }) => {
    let errored: CombinedError | undefined;
    let createdId: string | undefined;

    if (isNil(id)) {
      const result = await client.mutation(addCellarMutation, {
        cellar: { name, privacy },
      });
      errored = result.error;
      createdId = result.data?.insert_cellars_one?.id;
    } else {
      const result = await client.mutation(editCellarMutation, {
        id,
        cellar: { name, privacy },
      });
      errored = result.error;
      createdId = result.data?.update_cellars_by_pk?.id;
    }
    if (isNil(errored) && isNotNil(createdId)) {
      onSubmitted(createdId);
    } else {
      setError("root", {
        type: "custom",
        message: "Something went wrong please try again...",
      });
    }
  };

  return (
    <Box
      sx={(theme) => ({
        maxWidth: theme.breakpoints.values.sm,
      })}
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <Stack spacing={2}>
          <FormControl required>
            <FormLabel>Name</FormLabel>
            <Controller
              name="name"
              control={control}
              rules={{ required: true }}
              render={({ field }) => (
                <Input type="text" disabled={isSubmitting} {...field} />
              )}
            />
          </FormControl>
          <FormControl>
            <FormLabel>Privacy</FormLabel>
            <Controller
              name="privacy"
              control={control}
              render={({ field }) => (
                <Select
                  placeholder="Choose one…"
                  {...field}
                  onChange={(_, value) => {
                    field.onChange(value);
                  }}
                >
                  {permissionKeys.map((x) => (
                    <Option key={x} value={Permission_Type_Enum[x]}>
                      {x}
                    </Option>
                  ))}
                </Select>
              )}
            />
          </FormControl>
          {errors.root !== undefined && (
            <Typography color="danger">{errors.root.message}</Typography>
          )}
          <Button loading={isSubmitting || isSubmitted} type="submit">
            Add
          </Button>
        </Stack>
      </form>
    </Box>
  );
};
