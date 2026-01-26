"use client";

import type { EnumKey } from "@cellar-assistant/shared/enums";
import { FormControl, FormLabel, Option, Select } from "@mui/joy";
import {
  type Control,
  Controller,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
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

  if (error) {
    console.error(`Failed to load enum options for ${enumKey}:`, error);
  }

  return (
    <FormControl required={required}>
      <FormLabel>{label}</FormLabel>
      <Controller
        name={name}
        control={control}
        rules={rules}
        render={({ field }) => (
          <Select
            placeholder={loading ? "Loading…" : placeholder}
            disabled={disabled || loading}
            {...field}
            onChange={(_, value) => {
              field.onChange(value);
            }}
          >
            {options.map((option) => (
              <Option key={option.value} value={option.value}>
                {option.label}
              </Option>
            ))}
          </Select>
        )}
      />
    </FormControl>
  );
}
