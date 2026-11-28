"use client";

import { isNil } from "ramda";
import { useId } from "react";
import { Controller, type SubmitHandler, useForm } from "react-hook-form";
import { useMutation } from "urql";
import { SegmentedControl } from "@/components/app/SegmentedControl";
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
  /** Cancel, beside the submit (lot-cellars-shelves-03): back where you were. */
  onCancel?: () => void;
};

/** Who sees it (lot-cellars-shelves-03): the three, each with its one line. */
export const PRIVACY_OPTIONS = [
  { value: "PRIVATE", label: "Private", note: "Only you and co-owners" },
  { value: "FRIENDS", label: "Friends", note: "Your friends can look" },
  { value: "PUBLIC", label: "Public", note: "Anyone can look" },
] as const satisfies readonly {
  value: Permission_Type_Enum;
  label: string;
  note: string;
}[];

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
 *   and always failed for them (§7).
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
  onCancel,
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
    <form
      className="flex max-w-150 flex-col gap-5"
      onSubmit={(event) => {
        handleSubmit(onSubmit)(event).catch(() => {
          // Already shown as the root error.
        });
      }}
    >
      <Field>
        <FieldLabel htmlFor={nameId} className="t-head">
          Name
        </FieldLabel>
        <Controller
          name="name"
          control={control}
          rules={{
            validate: (value) => value.trim() !== "" || "Give it a name",
          }}
          render={({ field, fieldState }) => (
            <>
              <Input
                {...field}
                id={nameId}
                type="text"
                aria-required
                autoComplete="off"
                aria-invalid={fieldState.error !== undefined || undefined}
                disabled={isSubmitting}
              />
              {fieldState.error?.message && (
                <p role="alert" className="t-cap m-0 text-danger">
                  {fieldState.error.message}
                </p>
              )}
            </>
          )}
        />
      </Field>
      <Controller
        name="privacy"
        control={control}
        render={({ field }) => (
          <div className="flex flex-col gap-2">
            <p aria-hidden className="t-head m-0 text-ink">
              Who sees it
            </p>
            <SegmentedControl
              aria-label="Who sees it"
              value={field.value}
              onValueChange={field.onChange}
              options={PRIVACY_OPTIONS}
            />
            <p className="t-cap m-0 text-ink-2">
              {PRIVACY_OPTIONS.find((o) => o.value === field.value)?.note}
            </p>
          </div>
        )}
      />
      <Field>
        <FieldLabel htmlFor={coOwnersId} className="t-head">
          Co-owners
        </FieldLabel>
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
              placeholder="None"
            />
          )}
        />
        <FieldDescription className="t-cap">
          Co-owners add, finish and edit bottles here, as you do.
        </FieldDescription>
      </Field>
      {errors.root !== undefined && (
        <p role="alert" className="t-body m-0 text-danger">
          {errors.root.message}
        </p>
      )}
      <div className="flex items-center gap-3">
        {onCancel !== undefined && (
          <Button type="button" variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          className="flex-1"
          disabled={busy}
          aria-busy={busy || undefined}
        >
          {busy && <Spinner aria-hidden />}
          {isNil(id) ? "Make cellar" : "Save"}
        </Button>
      </div>
    </form>
  );
};
