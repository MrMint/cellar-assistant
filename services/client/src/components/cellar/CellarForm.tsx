"use client";

import {
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
import { isNil } from "ramda";
import { Controller, type SubmitHandler, useForm } from "react-hook-form";
import { useMutation } from "urql";
import { EnumSelect } from "@/components/forms/EnumSelect";
import {
  CellarCardFragment as CellarRowFragment,
  CreateCellarMutation,
  UpdateCellarMutation,
} from "@/lib/api/cellars";
import { readFragment } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import { UserAvatar } from "../common/UserAvatar";

/** SDL `PermissionType` — the old `Permission_Type_Enum`. */
export type Permission_Type_Enum = "FRIENDS" | "PRIVATE" | "PUBLIC";

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

/**
 * `82450ad1:src/components/cellar/CellarForm.tsx`, restored.
 *
 * Same fields, labels and order: Name, Privacy (`EnumSelect`, default
 * FRIENDS), Co-Owners (multi-select with avatars), the root error line, one
 * submit button. Substitutions:
 *
 * - `addCellarAction` / `editCellarAction` (server actions over
 *   `insert_cellars_one`, and `update_cellars_by_pk` + delete-all/re-insert of
 *   `cellar_owners`) → `createCellar` / `updateCellar`. `updateCellar` takes
 *   the **complete** co-owner set and diffs it server-side (`da1f77af`), so a
 *   co-owner can save a rename — the old delete-and-reinsert was creator-only
 *   under Hasura and always failed for them (§7).
 * - The typed error's `message` replaces the caught exception's.
 *
 * Two old bugs are not restored (inventory §7): the spinner stayed on after a
 * failed submit (`isSubmitted` never resets), and the button said "Add" while
 * editing. It spins only while submitting or after success, and says "Save"
 * on the edit page.
 */
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
    formState: { isSubmitting, errors, isSubmitSuccessful },
  } = useForm<IFormInput>({ defaultValues: defaults });

  const [, createCellar] = useMutation(CreateCellarMutation);
  const [, updateCellar] = useMutation(UpdateCellarMutation);

  const onSubmit: SubmitHandler<IFormInput> = async ({
    name,
    privacy,
    co_owners,
  }) => {
    const input = { name: name.trim(), privacy, coOwnerIds: co_owners };
    const result = isNil(id)
      ? unwrapResult(
          (await createCellar({ input })).data?.createCellar ?? undefined,
          "Cellar",
        )
      : unwrapResult(
          (await updateCellar({ cellarId: id, input })).data?.updateCellar ??
            undefined,
          "Cellar",
        );

    if (result.ok) {
      onSubmitted(readFragment(CellarRowFragment, result.data).id);
    } else {
      setError("root", {
        type: "custom",
        message:
          result.error.message || "Something went wrong please try again...",
      });
      // Throwing keeps `isSubmitSuccessful` false, so the button stops.
      throw new Error(result.error.message);
    }
  };

  return (
    <Box
      sx={(theme) => ({
        maxWidth: theme.breakpoints.values.sm,
      })}
    >
      <form
        onSubmit={(event) => {
          handleSubmit(onSubmit)(event).catch(() => {
            // Already shown as the root error.
          });
        }}
      >
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
                        <UserAvatar
                          avatarUrl={x.avatarUrl}
                          displayName={x.displayName}
                          size="sm"
                        />
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
          <Button loading={isSubmitting || isSubmitSuccessful} type="submit">
            {isNil(id) ? "Add" : "Save"}
          </Button>
        </Stack>
      </form>
    </Box>
  );
};
