"use client";

import { useEffect, useId } from "react";
import { Controller, type SubmitHandler, useForm } from "react-hook-form";
import { useMutation } from "urql";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
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
  const inputId = useId();
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
    <div className="flex justify-center">
      <div className="w-full rounded-lg bg-surface-1 p-4 sm:w-1/2 md:w-1/3">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Field className="gap-1.5">
            <FieldLabel htmlFor={inputId}>
              Display Name
              <span aria-hidden className="text-ink-3">
                *
              </span>
            </FieldLabel>
            <Controller
              name="displayName"
              control={control}
              rules={{ required: true }}
              render={({ field }) => (
                <Input
                  id={inputId}
                  required
                  disabled={isSubmitting}
                  type="text"
                  {...field}
                />
              )}
            />
          </Field>
          {errors.root !== undefined && (
            <p role="alert" className="type-body text-destructive">
              {errors.root.message}
            </p>
          )}
          <Button
            disabled={!isDirty || isSubmitting}
            aria-busy={isSubmitting || undefined}
            type="submit"
          >
            {isSubmitting && <Spinner aria-hidden />}
            Update
          </Button>
        </form>
      </div>
    </div>
  );
};
