"use client";

import { type FragmentOf, graphql } from "@cellar-assistant/shared";
import {
  Button,
  Card,
  CardContent,
  FormControl,
  FormLabel,
  Grid,
  Input,
  Stack,
  Typography,
} from "@mui/joy";
import { isNil, isNotNil } from "ramda";
import { useEffect } from "react";
import { Controller, type SubmitHandler, useForm } from "react-hook-form";
import { useMutation } from "urql";
import type { UserEditFragment } from "./fragments";

interface IFormInput {
  displayName: string;
}

const updateUserMutation = graphql(`
  mutation UpdateUser($userId: uuid!, $displayName: String!) {
    updateUser(
      pk_columns: { id: $userId }
      _set: { displayName: $displayName }
    ) {
      id
    }
  }
`);

interface EditProfileClientProps {
  userId: string;
  userData: FragmentOf<typeof UserEditFragment>;
}

export const EditProfileClient = ({
  userId,
  userData,
}: EditProfileClientProps) => {
  if (isNil(userId)) throw new Error("User cannot be null");

  const [_updateUser, updateUserAsync] = useMutation(updateUserMutation);

  const {
    reset,
    control,
    setValue,
    handleSubmit,
    setError,
    formState: { isDirty, isSubmitting, errors },
  } = useForm<IFormInput>();

  useEffect(() => {
    if (!isDirty) {
      setValue("displayName", userData.displayName);
    }
  }, [isDirty, userData, setValue]);
  const onSubmit: SubmitHandler<IFormInput> = async ({ displayName }) => {
    try {
      const result = await updateUserAsync({ userId, displayName });
      if (isNotNil(result.error)) {
        throw Error();
      } else {
        reset({ displayName });
      }
    } catch (_exception) {
      setError("root", {
        type: "custom",
        message: "Something went wrong please try again...",
      });
    }
  };

  return (
    <Grid container justifyContent="center">
      <Grid xs={12} sm={6} md={4}>
        <Card>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)}>
              <Stack spacing={2}>
                <FormControl required>
                  <FormLabel>Display Name</FormLabel>
                  <Controller
                    name="displayName"
                    control={control}
                    rules={{ required: true }}
                    render={({ field }) => (
                      <Input disabled={isSubmitting} type="text" {...field} />
                    )}
                  />
                </FormControl>
                {errors.root !== undefined && (
                  <Typography>{errors.root.message}</Typography>
                )}
                <Button
                  disabled={!isDirty}
                  loading={isSubmitting}
                  type="submit"
                >
                  Update
                </Button>
              </Stack>
            </form>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};
