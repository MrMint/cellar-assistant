"use client";

import { Checkbox, FormControl, FormLabel, Input, Textarea } from "@mui/joy";
import { type Control, Controller } from "react-hook-form";
import { EnumSelect } from "@/components/forms/EnumSelect";
import type { EnumKey } from "@/hooks/enum-options";
import type { ItemFormValues } from "./ItemForm";
import type { FormEntry } from "./itemFormLayout";

/**
 * One entry of `formLayout(type)` as the six old `{T}Form`s drew it — moved
 * out of `ItemForm` unchanged so the onboarding wizard's create form
 * (`common/OnboardingWizard/OnboardingItemForm.tsx`, the old forms' create
 * mode) renders the same fields in the same order with the same controls.
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
      <FormControl key="name" required>
        <FormLabel>{entry.label}</FormLabel>
        <Controller
          name="name"
          control={control}
          rules={{ required: true }}
          render={({ field }) => (
            <Input disabled={disabled} type="text" {...field} />
          )}
        />
      </FormControl>
    );
  }
  if (entry.kind === "description") {
    return (
      <FormControl key="description">
        <FormLabel>{entry.label}</FormLabel>
        <Controller
          name="description"
          control={control}
          render={({ field }) => (
            <Textarea disabled={disabled} minRows={2} {...field} />
          )}
        />
      </FormControl>
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
        rules={required ? { required: true } : undefined}
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
    <FormControl key={field.key} required={required}>
      <FormLabel>{entry.label}</FormLabel>
      <Controller
        name={name}
        control={control}
        rules={required ? { required: true } : undefined}
        render={({ field: input }) =>
          entry.multiline === true ? (
            <Textarea
              disabled={disabled}
              minRows={2}
              {...input}
              value={input.value ?? ""}
            />
          ) : (
            <Input
              type={isYear || field.kind === "number" ? "number" : "text"}
              disabled={disabled}
              slotProps={
                isYear
                  ? {
                      input: {
                        min: "1900",
                        max: "2099",
                        step: "1",
                      },
                    }
                  : field.kind === "number"
                    ? { input: { step: "any" } }
                    : undefined
              }
              {...input}
              value={input.value ?? ""}
            />
          )
        }
      />
    </FormControl>
  );
};
