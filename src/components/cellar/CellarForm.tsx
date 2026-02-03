"use client";

import { type Permission_Type_Enum } from "@cellar-assistant/shared";
import {
  Avatar,
  Box,
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  ListItemDecorator,
  Option,
  Select,
  Stack,
  Typography,
} from "@mui/joy";
import { isNil, isNotNil } from "ramda";
import { Controller, type SubmitHandler, useForm } from "react-hook-form";
import { addCellarAction, editCellarAction } from "@/app/actions/cellars";
import { EnumSelect } from "@/components/forms/EnumSelect";

interface IFormInput {
  name: string;
  privacy: Permission_Type_Enum;
  co_owners: string[];
}

export type CellarFormProps = {
  onSubmitted: (id: string) => void;
  id?: string;
  defaults?: {
    name?: string;
    privacy?: Permission_Type_Enum;
    co_owners?: string[];
  };
  friends: { id: string; displayName: string; avatarUrl: string }[];
};

export const CellarForm = ({
  id,
  onSubmitted,
  friends,
  defaults = {
    name: "",
    privacy: "FRIENDS" as Permission_Type_Enum,
    co_owners: [],
  },
}: CellarFormProps) => {
  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors, isSubmitted },
  } = useForm<IFormInput>({ defaultValues: defaults });

  const onSubmit: SubmitHandler<IFormInput> = async ({
    name,
    privacy,
    co_owners,
  }) => {
    let result;

    if (isNil(id)) {
      result = await addCellarAction(name, privacy, co_owners);
    } else {
      result = await editCellarAction(id, name, privacy, co_owners);
    }

    if (result.success && isNotNil(result.cellarId)) {
      onSubmitted(result.cellarId);
    } else {
      setError("root", {
        type: "custom",
        message: result.error ?? "Something went wrong please try again...",
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
          <EnumSelect
            name="privacy"
            control={control}
            enumKey="permission"
            label="Privacy"
            required
            rules={{ required: true }}
          />
          <FormControl>
            <FormLabel>Co-Owners</FormLabel>
            <Controller
              name="co_owners"
              control={control}
              render={({ field }) => (
                <Select
                  multiple
                  placeholder="Choose friends..."
                  {...field}
                  onChange={(_, value) => {
                    field.onChange(value);
                  }}
                >
                  {friends.map((x) => (
                    <Option key={x.id} value={x.id}>
                      <ListItemDecorator>
                        <Avatar size="sm" src={x.avatarUrl} />
                      </ListItemDecorator>
                      {x.displayName}
                    </Option>
                  ))}
                </Select>
              )}
            />
            <FormHelperText>
              These users will be treated as owners of the cellar.
            </FormHelperText>
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
