"use client";

import { isNil } from "ramda";
import { useId } from "react";
import { Controller, type SubmitHandler, useForm } from "react-hook-form";
import { useMutation } from "urql";
import { EnumSelect } from "@/components/forms/EnumSelect";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  CellarCardFragment as CellarRowFragment,
  CreateCellarMutation,
  UpdateCellarMutation,
} from "@/lib/api/cellars";
import { readFragment } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import { CoOwnerPicker } from "./CoOwnerPicker";

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
 * The Joy multi-`Select` for co-owners is `CoOwnerPicker` (a combobox over a
 * checkable list, since `ui/select` picks one value only).
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

  const nameId = useId();
  const coOwnersId = useId();
  const busy = isSubmitting || isSubmitSuccessful;

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
    <div className="max-w-150">
      <form
        onSubmit={(event) => {
          handleSubmit(onSubmit)(event).catch(() => {
            // Already shown as the root error.
          });
        }}
      >
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor={nameId}>
              Name
              <span aria-hidden className="text-ink-3">
                *
              </span>
            </FieldLabel>
            <Controller
              name="name"
              control={control}
              rules={{ required: true }}
              render={({ field }) => (
                <Input
                  {...field}
                  id={nameId}
                  type="text"
                  required
                  disabled={isSubmitting}
                />
              )}
            />
          </Field>
          <EnumSelect
            name="privacy"
            control={control}
            enumKey="permission"
            label="Privacy"
            required
            rules={{ required: true }}
          />
          <Field>
            <FieldLabel htmlFor={coOwnersId}>Co-Owners</FieldLabel>
            <Controller
              name="co_owners"
              control={control}
              render={({ field }) => (
                <CoOwnerPicker
                  id={coOwnersId}
                  friends={friends}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  disabled={isSubmitting}
                  placeholder="Choose friends..."
                />
              )}
            />
            <FieldDescription>
              These users will be treated as owners of the cellar.
            </FieldDescription>
          </Field>
          {errors.root !== undefined && (
            <p role="alert" className="type-body text-destructive">
              {errors.root.message}
            </p>
          )}
          <Button type="submit" disabled={busy} aria-busy={busy || undefined}>
            {busy && <Spinner aria-hidden />}
            {isNil(id) ? "Add" : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
};
