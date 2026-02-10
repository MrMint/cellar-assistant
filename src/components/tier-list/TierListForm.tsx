"use client";

import type { Permission_Type_Enum } from "@cellar-assistant/shared";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Option,
  Select,
  Stack,
  Textarea,
  Typography,
} from "@mui/joy";
import { isNil, isNotNil } from "ramda";
import { Controller, type SubmitHandler, useForm } from "react-hook-form";
import {
  addTierListAction,
  editTierListAction,
  type TierListResult,
} from "@/app/actions/tierLists";
import { EnumSelect } from "@/components/forms/EnumSelect";

interface IFormInput {
  name: string;
  description: string;
  privacy: Permission_Type_Enum;
  list_type: string;
}

export type TierListFormProps = {
  onSubmitted: (id: string) => void;
  id?: string;
  defaults?: {
    name?: string;
    description?: string;
    privacy?: Permission_Type_Enum;
    list_type?: string;
  };
};

const listTypeOptions = [
  { value: "place", label: "Places" },
  { value: "wine", label: "Wines" },
  { value: "beer", label: "Beers" },
  { value: "spirit", label: "Spirits" },
  { value: "coffee", label: "Coffees" },
  { value: "sake", label: "Sake" },
];

export function TierListForm({
  id,
  onSubmitted,
  defaults = {
    name: "",
    description: "",
    privacy: "PRIVATE" as Permission_Type_Enum,
    list_type: "place",
  },
}: TierListFormProps) {
  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors },
  } = useForm<IFormInput>({ defaultValues: defaults });

  const isEditing = isNotNil(id);

  const onSubmit: SubmitHandler<IFormInput> = async ({
    name,
    description,
    privacy,
    list_type,
  }) => {
    let result: TierListResult;

    if (isNil(id)) {
      result = await addTierListAction(
        name,
        description || undefined,
        privacy,
        list_type,
      );
    } else {
      result = await editTierListAction(
        id,
        name,
        description || undefined,
        privacy,
      );
    }

    if (result.success && isNotNil(result.tierListId)) {
      onSubmitted(result.tierListId);
    } else {
      setError("root", {
        type: "custom",
        message: result.error ?? "Something went wrong, please try again...",
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
                <Input
                  type="text"
                  placeholder="e.g. Best Wine Bars"
                  disabled={isSubmitting}
                  {...field}
                />
              )}
            />
          </FormControl>

          <FormControl>
            <FormLabel>Description</FormLabel>
            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <Textarea
                  minRows={2}
                  placeholder="What is this list about?"
                  disabled={isSubmitting}
                  {...field}
                />
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

          {!isEditing && (
            <FormControl required>
              <FormLabel>List Type</FormLabel>
              <Controller
                name="list_type"
                control={control}
                rules={{ required: true }}
                render={({ field }) => (
                  <Select
                    {...field}
                    onChange={(_, value) => {
                      if (value) field.onChange(value);
                    }}
                    disabled={isSubmitting}
                  >
                    {listTypeOptions.map((opt) => (
                      <Option key={opt.value} value={opt.value}>
                        {opt.label}
                      </Option>
                    ))}
                  </Select>
                )}
              />
            </FormControl>
          )}

          {errors.root !== undefined && (
            <Typography color="danger">{errors.root.message}</Typography>
          )}

          <Button loading={isSubmitting} type="submit">
            {isEditing ? "Save" : "Create"}
          </Button>
        </Stack>
      </form>
    </Box>
  );
}
