"use client";

/**
 * `82450ad1:src/components/tier-list/TierListForm.tsx`, restored: Name,
 * Description, Privacy (`EnumSelect`, default Private), List Type (create
 * only, default Places — the old default, and still the API's), root error,
 * Create / Save. The two server actions come from `useTierListActions`.
 *
 * X16 — **templates pre-banded from your ratings**: creating a list of a type
 * you have rated offers "Start with your ratings" (on by default), and the
 * server fills the new list with each of them in the band your rating gives
 * it — one edit, which one Undo on the list takes back. Picking a type also
 * names an unnamed list ("My wines") until you type a name of your own.
 *
 * On the app's primitives (D20): `ui/field` + `ui/input` / `ui/textarea` /
 * `ui/select`. Privacy is still the shared `EnumSelect` (Joy) until its own
 * slice converts it — a Joy control inside a Tailwind form, which the
 * coexistence rules allow (nothing here is in a Radix modal).
 */

import { isNil, isNotNil } from "ramda";
import { useId, useMemo, useState } from "react";
import {
  Controller,
  type SubmitHandler,
  useForm,
  useWatch,
} from "react-hook-form";
import { useQuery } from "urql";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  type Permission_Type_Enum,
  type TierListResult,
  useTierListActions,
} from "./actions";
import { TierListTemplatesQuery } from "./queries";

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

/**
 * "My wines" — the name a list started from a type gets until you type one.
 * Exported for the test.
 */
export const defaultListName = (listType: string): string => {
  const label = listTypeOptions.find((option) => option.value === listType);
  return label === undefined ? "" : `My ${label.label.toLowerCase()}`;
};

/** "12 wines you've rated", "1 place you've rated". */
export const ratedSummary = (listType: string, count: number): string => {
  const label =
    listTypeOptions.find((option) => option.value === listType)?.label ??
    "entries";
  const noun =
    count === 1
      ? (SINGULAR[listType] ?? label.toLowerCase())
      : label.toLowerCase();
  return `${count} ${noun} you've rated`;
};

const SINGULAR: Record<string, string> = {
  place: "place",
  wine: "wine",
  beer: "beer",
  spirit: "spirit",
  coffee: "coffee",
  sake: "sake",
  tea: "tea",
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
    setValue,
    getFieldState,
    formState: { isSubmitting, errors },
  } = useForm<IFormInput>({ defaultValues: defaults });

  const isEditing = isNotNil(id);
  const fieldId = useId();
  const { addTierListAction, editTierListAction } = useTierListActions();

  // X16: what each type would start with, from your ratings.
  const [{ data: templateData }] = useQuery({
    query: TierListTemplatesQuery,
    pause: isEditing,
  });
  const ratedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const edge of templateData?.me?.tierListTemplates.edges ?? []) {
      counts.set(edge.node.listType, edge.node.ratedCount);
    }
    return counts;
  }, [templateData]);
  const listType = useWatch({ control, name: "list_type" });
  const ratedCount = ratedCounts.get(listType) ?? 0;
  const [fromRatings, setFromRatings] = useState(true);
  const startsFromRatings = !isEditing && fromRatings && ratedCount > 0;

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
        startsFromRatings ? "RATINGS" : "EMPTY",
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
                    if (!next) return;
                    onChange(next);
                    // An unnamed list takes the type's name until you type
                    // one; a name you typed is never replaced.
                    if (!getFieldState("name").isDirty) {
                      setValue("name", defaultListName(next));
                    }
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

        {!isEditing && ratedCount > 0 && (
          <label
            htmlFor={`${fieldId}-from-ratings`}
            className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-surface-1 px-4 py-2"
          >
            <span className="flex flex-col">
              <span className="text-ink-1 type-body">
                Start with your ratings
              </span>
              <span className="type-footnote">
                {ratedSummary(listType, ratedCount)}, each in the band your
                rating gives it. One Undo empties it again.
              </span>
            </span>
            <Switch
              id={`${fieldId}-from-ratings`}
              checked={fromRatings}
              onCheckedChange={setFromRatings}
              disabled={isSubmitting}
            />
          </label>
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
