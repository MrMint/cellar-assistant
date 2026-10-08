"use client";

import { type ReactNode, useId } from "react";
import { type Control, Controller } from "react-hook-form";
import { EnumSelect } from "@/components/forms/EnumSelect";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EnumKey } from "@/hooks/enum-options";
import { fieldErrorText, isRequired, requiredRule } from "./form-errors";
import type { ItemFormValues } from "./ItemForm";
import type { FormEntry } from "./itemFormLayout";

/**
 * One entry of `formLayout(type)` as the six old `{T}Form`s drew it — moved
 * out of `ItemForm` unchanged so the onboarding wizard's create form
 * (`common/OnboardingWizard/OnboardingItemForm.tsx`, the old forms' create
 * mode) renders the same fields in the same order with the same controls.
 *
 * N03: a required field says what is wrong — a line under it
 * (`form-errors.ts`) — and its ref is the native input, so the validation
 * that scrolls to it also focuses it. The control itself carries
 * `aria-invalid`, so assistive tech hears the error state too.
 *
 * On `ui/field` now (Joy's `FormControl`/`FormLabel`/`Input`): the label is
 * tied to its control by id, a required field keeps the native `required`
 * and the starred label, and the pickers stay `EnumSelect` (S2's, converted
 * in place there).
 */
export const ItemFormField = ({
  entry,
  control,
  disabled,
}: {
  entry: FormEntry;
  control: Control<ItemFormValues>;
  disabled: boolean;
}) => {
  const id = useId();
  if (entry.kind === "name") {
    return (
      <Controller
        key="name"
        name="name"
        control={control}
        rules={requiredRule(entry)}
        render={({ field: { ref, ...field }, fieldState }) => (
          <FieldShell
            id={id}
            label={entry.label}
            required
            error={fieldState.error}
          >
            <Input
              id={id}
              ref={ref}
              required
              disabled={disabled}
              type="text"
              {...field}
              {...errorAria(id, entry.label, fieldState)}
            />
          </FieldShell>
        )}
      />
    );
  }
  if (entry.kind === "description") {
    return (
      <Controller
        key="description"
        name="description"
        control={control}
        rules={requiredRule(entry)}
        render={({ field: { ref, ...field }, fieldState }) => (
          <FieldShell
            id={id}
            label={entry.label}
            required={isRequired(entry)}
            error={fieldState.error}
          >
            <Textarea
              id={id}
              ref={ref}
              required={isRequired(entry)}
              disabled={disabled}
              rows={2}
              {...field}
              {...errorAria(id, entry.label, fieldState)}
            />
          </FieldShell>
        )}
      />
    );
  }
  if (entry.kind === "country") {
    return (
      <EnumSelect
        key="country"
        name="country"
        control={control}
        enumKey="country"
        label={entry.label}
        disabled={disabled}
      />
    );
  }

  const { field } = entry;
  const name = `attributes.${field.key}` as const;
  const { required } = entry;
  const enumKey: EnumKey | undefined =
    field.kind === "reference"
      ? field.reference
      : field.kind === "static"
        ? field.options
        : undefined;

  if (enumKey !== undefined) {
    return (
      <EnumSelect
        key={field.key}
        name={name}
        control={control}
        enumKey={enumKey}
        label={entry.label}
        required={required}
        disabled={disabled}
        rules={requiredRule(entry)}
      />
    );
  }

  if (field.kind === "boolean") {
    return (
      <Controller
        key={field.key}
        name={name}
        control={control}
        render={({ field: { value, onChange, ...rest } }) => (
          <div className="flex min-h-11 items-center gap-3">
            <Checkbox
              id={id}
              disabled={disabled}
              checked={value === "true"}
              onCheckedChange={(checked) =>
                onChange(checked === true ? "true" : "false")
              }
              className="size-5"
              {...rest}
            />
            <Label htmlFor={id} className="type-body font-normal">
              {entry.label}
            </Label>
          </div>
        )}
      />
    );
  }

  const isYear = field.kind === "date" || field.kind === "year";
  return (
    <Controller
      key={field.key}
      name={name}
      control={control}
      rules={requiredRule(entry)}
      render={({ field: { ref, ...input }, fieldState }) => (
        <FieldShell
          id={id}
          label={entry.label}
          required={required}
          error={fieldState.error}
        >
          {entry.multiline === true ? (
            <Textarea
              id={id}
              ref={ref}
              required={required}
              disabled={disabled}
              rows={2}
              {...input}
              value={input.value ?? ""}
              {...errorAria(id, entry.label, fieldState)}
            />
          ) : (
            <Input
              id={id}
              ref={ref}
              required={required}
              type={isYear || field.kind === "number" ? "number" : "text"}
              disabled={disabled}
              {...input}
              value={input.value ?? ""}
              {...errorAria(id, entry.label, fieldState)}
              {...(isYear
                ? { min: "1900", max: "2099", step: "1" }
                : field.kind === "number"
                  ? { step: "any" }
                  : {})}
            />
          )}
        </FieldShell>
      )}
    />
  );
};

/**
 * Label, control and the line under a field that failed validation (nothing
 * otherwise). A required label is starred, as Joy's was; the star is
 * decoration (the control's own `required` is what assistive tech hears).
 */
const FieldShell = ({
  id,
  label,
  required = false,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error: { type?: string; message?: string } | undefined;
  children: ReactNode;
}) => {
  const text = fieldErrorText(label, error);
  return (
    <Field data-invalid={error !== undefined || undefined} className="gap-1.5">
      <FieldLabel htmlFor={id} className="type-callout gap-0.5 text-ink-2">
        {label}
        {required && (
          <span aria-hidden="true" data-slot="asterisk" className="text-ink-3">
            *
          </span>
        )}
      </FieldLabel>
      {children}
      {text !== undefined && (
        <FieldError id={errorId(id)} className="type-footnote text-destructive">
          {text}
        </FieldError>
      )}
    </Field>
  );
};

/** The id of the line under a field that says what is wrong with it. */
const errorId = (id: string) => `${id}-error`;

/**
 * A control's error state for assistive tech: `aria-invalid` while it holds
 * an error, and `aria-describedby` naming the line that says why — what
 * Joy's `FormControl` wired up for its helper text, so the message is read
 * with the field, not only announced once.
 */
const errorAria = (
  id: string,
  label: string,
  fieldState: { error?: { type?: string; message?: string } },
): { "aria-invalid"?: true; "aria-describedby"?: string } => ({
  "aria-invalid": fieldState.error !== undefined || undefined,
  "aria-describedby":
    fieldErrorText(label, fieldState.error) === undefined
      ? undefined
      : errorId(id),
});
