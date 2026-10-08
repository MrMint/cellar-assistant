"use client";

/**
 * `82450ad1:src/components/tier-list/TierListForm.tsx`, restored: Name,
 * Description, Privacy (`EnumSelect`, default Private), List Type (create
 * only, default Places — the old default, and still the API's), root error,
 * Create / Save. The two server actions come from `useTierListActions`.
 *
 * On the app's primitives (D20): `ui/field` + `ui/input` / `ui/textarea` /
 * `ui/select`. Privacy is still the shared `EnumSelect` (Joy) until its own
 * slice converts it — a Joy control inside a Tailwind form, which the
 * coexistence rules allow (nothing here is in a Radix modal).
 */

import { isNil, isNotNil } from "ramda";
import { useId } from "react";
import { Controller, type SubmitHandler, useForm } from "react-hook-form";
import { EnumSelect } from "@/components/forms/EnumSelect";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  type Permission_Type_Enum,
  type TierListResult,
  useTierListActions,
} from "./actions";

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
  { value: "tea", label: "Teas" },
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
  const fieldId = useId();
  const { addTierListAction, editTierListAction } = useTierListActions();

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
    <div className="max-w-[600px]">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <Field className="gap-2 text-foreground">
          <FieldLabel htmlFor={`${fieldId}-name`} className="gap-1">
            Name
            <RequiredMark />
          </FieldLabel>
          <Controller
            name="name"
            control={control}
            rules={{ required: true }}
            render={({ field, fieldState }) => (
              <Input
                id={`${fieldId}-name`}
                type="text"
                placeholder="e.g. Best Wine Bars"
                required
                aria-invalid={fieldState.invalid || undefined}
                disabled={isSubmitting}
                {...field}
              />
            )}
          />
        </Field>

        <Field className="gap-2 text-foreground">
          <FieldLabel htmlFor={`${fieldId}-description`} className="gap-1">
            Description
          </FieldLabel>
          <Controller
            name="description"
            control={control}
            render={({ field }) => (
              <Textarea
                id={`${fieldId}-description`}
                rows={2}
                placeholder="What is this list about?"
                disabled={isSubmitting}
                {...field}
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

        {!isEditing && (
          <Field className="gap-2 text-foreground">
            <FieldLabel htmlFor={`${fieldId}-list-type`} className="gap-1">
              List Type
              <RequiredMark />
            </FieldLabel>
            <Controller
              name="list_type"
              control={control}
              rules={{ required: true }}
              render={({ field: { ref, onChange, value, name, onBlur } }) => (
                <Select
                  name={name}
                  value={value}
                  onValueChange={(next) => {
                    if (next) onChange(next);
                  }}
                  disabled={isSubmitting}
                  required
                >
                  <SelectTrigger
                    ref={ref}
                    id={`${fieldId}-list-type`}
                    onBlur={onBlur}
                    className="w-full text-base md:text-sm"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {listTypeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        )}

        {errors.root !== undefined && (
          <p role="alert" className="text-destructive type-callout">
            {errors.root.message}
          </p>
        )}

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Spinner aria-hidden />}
          {isEditing ? "Save" : "Create"}
        </Button>
      </form>
    </div>
  );
}

/**
 * The required asterisk, ink-3 as EnumSelect's (Privacy, beside these) and
 * ItemFormField's are: a red star on an untouched form reads as an error.
 */
function RequiredMark() {
  return (
    <span aria-hidden data-slot="label-asterisk" className="text-ink-3">
      *
    </span>
  );
}
