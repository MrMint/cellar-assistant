"use client";

import {
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  FormLabel,
  Grid,
  Input,
  Stack,
  Typography,
} from "@mui/joy";
import { useAccessToken, useUserId } from "@nhost/nextjs";
import { graphql } from "@shared/gql";
import { isNil, isNotNil } from "ramda";
import { useEffect } from "react";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { useClient, useMutation, useQuery } from "urql";

interface IFormInput {
  displayName: string;
}

const getUserQuery = graphql(`
  query GetUser($userId: uuid!) {
    user(id: $userId) {
      id
      displayName
      avatarUrl
    }
  }
`);

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

const EditProfile = () => {
  const userId = useUserId();
  const accessToken = useAccessToken();
  if (isNil(userId)) throw new Error("User cannot be null");
  if (isNil(accessToken)) throw new Error("Access token cannot be null");

  const [{ data, fetching, operation }] = useQuery({
    query: getUserQuery,
    variables: { userId },
  });

  const [updateUser, updateUserAsync] = useMutation(updateUserMutation);

  const {
    reset,
    control,
    setValue,
    handleSubmit,
    setError,
    formState: { isDirty, isSubmitting, errors },
  } = useForm<IFormInput>();

  useEffect(() => {
    if (!isDirty && isNotNil(data) && isNotNil(data.user)) {
      setValue("displayName", data.user.displayName);
    }
  }, [isDirty, data, setValue]);
  const onSubmit: SubmitHandler<IFormInput> = async ({ displayName }) => {
    try {
      const result = await updateUserAsync(
        { userId, displayName },
        {
          fetchOptions: {
            headers: {
              authorization: `Bearer ${accessToken}`,
              "x-hasura-role": "me",
            },
          },
        },
      );
      if (isNotNil(result.error)) {
        throw Error();
      } else {
        reset({ displayName });
      }
    } catch (exception) {
      setError("root", {
        type: "custom",
        message: "Something went wrong please try again...",
      });
    }
  };

  const isLoading = fetching || operation === undefined;

  if (isNil(data) || isNil(data?.user)) {
    return <CircularProgress />;
  } else {
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
  }
};

export default EditProfile;
