"use client";

import {
  Checkbox,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Textarea,
} from "@mui/joy";
import { type Control, Controller } from "react-hook-form";
import { EnumSelect } from "@/components/forms/EnumSelect";
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
 * N03: a required field says what is wrong — `FormControl error` plus a
 * helper line (`form-errors.ts`) — and its ref is the native input, so the
 * validation that scrolls to it also focuses it. The control itself carries
 * `aria-invalid`, so assistive tech hears the error state too.
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
  if (entry.kind === "name") {
    return (
      <Controller
        key="name"
        name="name"
        control={control}
        rules={requiredRule(entry)}
        render={({ field: { ref, ...field }, fieldState }) => (
          <FormControl required error={fieldState.error !== undefined}>
            <FormLabel>{entry.label}</FormLabel>
            <Input
              disabled={disabled}
              type="text"
              {...field}
              slotProps={{
                input: { ref, "aria-invalid": invalid(fieldState) },
              }}
            />
            <ErrorText label={entry.label} error={fieldState.error} />
          </FormControl>
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
          <FormControl
            required={isRequired(entry)}
            error={fieldState.error !== undefined}
          >
            <FormLabel>{entry.label}</FormLabel>
            <Textarea
              disabled={disabled}
              minRows={2}
              {...field}
              slotProps={{
                textarea: { ref, "aria-invalid": invalid(fieldState) },
              }}
            />
            <ErrorText label={entry.label} error={fieldState.error} />
          </FormControl>
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
          <Checkbox
            label={entry.label}
            disabled={disabled}
            checked={value === "true"}
            onChange={(event) =>
              onChange(event.target.checked ? "true" : "false")
            }
            {...rest}
          />
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
        <FormControl required={required} error={fieldState.error !== undefined}>
          <FormLabel>{entry.label}</FormLabel>
          {entry.multiline === true ? (
            <Textarea
              disabled={disabled}
              minRows={2}
              {...input}
              value={input.value ?? ""}
              slotProps={{
                textarea: { ref, "aria-invalid": invalid(fieldState) },
              }}
            />
          ) : (
            <Input
              type={isYear || field.kind === "number" ? "number" : "text"}
              disabled={disabled}
              {...input}
              value={input.value ?? ""}
              slotProps={{
                input: {
                  ref,
                  "aria-invalid": invalid(fieldState),
                  ...(isYear
                    ? { min: "1900", max: "2099", step: "1" }
                    : field.kind === "number"
                      ? { step: "any" }
                      : {}),
                },
              }}
            />
          )}
          <ErrorText label={entry.label} error={fieldState.error} />
        </FormControl>
      )}
    />
  );
};

/** The line under a field that failed validation; nothing otherwise. */
const ErrorText = ({
  label,
  error,
}: {
  label: string;
  error: { type?: string; message?: string } | undefined;
}) => {
  const text = fieldErrorText(label, error);
  return text === undefined ? null : <FormHelperText>{text}</FormHelperText>;
};

/** `aria-invalid` for a field's control: present only while it holds an error. */
const invalid = (fieldState: { error?: unknown }): true | undefined =>
  fieldState.error !== undefined || undefined;
