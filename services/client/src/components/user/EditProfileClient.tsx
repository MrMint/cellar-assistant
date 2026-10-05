"use client";

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
import { useEffect } from "react";
import { Controller, type SubmitHandler, useForm } from "react-hook-form";
import { useMutation } from "urql";
import type { ResultOf } from "@/lib/api/graphql";
import { type MyProfileQuery, UpdateProfileMutation } from "./fragments";

type ViewerProfile = NonNullable<
  ResultOf<typeof MyProfileQuery>["me"]
>["profile"];

interface IFormInput {
  displayName: string;
}

interface EditProfileClientProps {
  profile: ViewerProfile;
}

export const EditProfileClient = ({ profile }: EditProfileClientProps) => {
  const [, updateProfile] = useMutation(UpdateProfileMutation);

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
      setValue("displayName", profile.displayName);
    }
  }, [isDirty, profile, setValue]);

  const onSubmit: SubmitHandler<IFormInput> = async ({ displayName }) => {
    const result = await updateProfile({ input: { displayName } });
    const payload = result.data?.updateProfile;

    if (payload?.__typename === "UserProfile") {
      reset({ displayName: payload.displayName });
      return;
    }

    const message =
      payload !== undefined && "message" in payload
        ? payload.message
        : (result.error?.message ?? "Something went wrong please try again...");
    setError("root", { type: "custom", message });
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
