"use client";

import { useEffect, useId } from "react";
import {
  type Control,
  type FieldPath,
  type FieldValues,
  type UseControllerProps,
  useController,
} from "react-hook-form";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type EnumKey, optionsHolding } from "@/hooks/enum-options";
import { useEnum } from "@/hooks/useEnum";

interface EnumSelectProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  K extends EnumKey,
> {
  name: TName;
  control: Control<TFieldValues>;
  enumKey: K;
  label: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  rules?: object;
}

/**
 * A labelled select over one enum, bound to a react-hook-form field. Radix
 * `ui/select`: a `combobox` button and a listbox of `option`s, named by its
 * `<label>`, as Joy's was.
 */
export function EnumSelect<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  K extends EnumKey,
>({
  name,
  control,
  enumKey,
  label,
  required = false,
  disabled = false,
  placeholder = "Choose one…",
  rules,
}: EnumSelectProps<TFieldValues, TName, K>) {
  const { options, loading, error } = useEnum(enumKey);
  const id = useId();
  const {
    field: { ref, value, onChange, onBlur, name: fieldName },
    fieldState: { error: invalid },
  } = useController({
    name,
    control,
    rules: rules as UseControllerProps<TFieldValues, TName>["rules"],
  });

  if (error) {
    console.error(`Failed to load enum options for ${enumKey}:`, error);
  }

  // While the options load, the stored value is one of them
  // (`optionsHolding`): a select whose options lack its value shows nothing,
  // and Joy's cleared it outright — which wiped the country of every item
  // past the first page of countries on Save.
  const items = optionsHolding(enumKey, options, value, loading);
  const held = typeof value === "string" && value !== "";
  const known = items.some((option) => option.value === value);

  // Once they have loaded, a value that is still not an option is dropped, as
  // Joy's Select dropped it (`optionsHolding` says why: every reference
  // column is a foreign key, and a value that is not a row would fail in the
  // outbox where nobody sees it).
  useEffect(() => {
    if (!loading && held && !known) onChange(null);
  }, [loading, held, known, onChange]);

  const unavailable = disabled || loading;
  const isInvalid = invalid !== undefined;

  // N03: the error is drawn here, under the select — a required pick that is
  // missing says so instead of only scrolling to it.
  return (
    // `text-foreground`: the label and the chosen value inherit their ink,
    // and on a Joy screen the inherited ink is Joy's body-md (ink-2), not the
    // body's — they sat a step dimmer than the Joy labels and values beside
    // them. The invalid state's `text-destructive` still wins.
    <Field
      data-invalid={isInvalid || undefined}
      data-disabled={unavailable || undefined}
      className="min-w-0 gap-2 text-foreground"
    >
      <FieldLabel htmlFor={id} className="gap-1">
        {label}
        {/* The required asterisk is ink-3, as ItemFormField's and
            AuthField's are: the text fields beside these pickers are no
            longer Joy, and a red star on an untouched form reads as an
            error. The data-slot is what tests (and styling) anchor on. */}
        {required && (
          <span
            aria-hidden="true"
            data-slot="label-asterisk"
            className="text-ink-3"
          >
            *
          </span>
        )}
      </FieldLabel>
      <Select
        name={fieldName}
        value={held && known ? (value as string) : ""}
        disabled={unavailable}
        onValueChange={(next) => {
          // Radix reports "" only from its hidden native select (no option
          // can be ""), never from a person's pick — so it is not a choice.
          if (next !== "") onChange(next);
        }}
      >
        <SelectTrigger
          id={id}
          ref={ref}
          onBlur={onBlur}
          // 16px on a phone like `ui/input` (`text-base md:text-sm`), not the
          // vendored trigger's 14px: the value read smaller than every input
          // in the same form.
          className="w-full min-w-0 max-w-full text-base md:text-sm"
          // `disabled` is native here; aria-disabled keeps the anchor the
          // tests (and assistive tech, before hydration) read.
          aria-disabled={unavailable || undefined}
          aria-invalid={isInvalid || undefined}
          aria-required={required || undefined}
        >
          <SelectValue placeholder={loading ? "Loading…" : placeholder} />
        </SelectTrigger>
        <SelectContent position="popper">
          {/* A value held before its option has loaded (a country past the
              first page) is kept, or the select would show it blank —
              `optionsHolding`. */}
          {items.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isInvalid && (
        <FieldError>
          {invalid.message !== undefined && invalid.message !== ""
            ? invalid.message
            : `${label} is required.`}
        </FieldError>
      )}
    </Field>
  );
}
