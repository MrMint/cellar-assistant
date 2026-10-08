"use client";

import {
  FormControl,
  FormHelperText,
  FormLabel,
  Option,
  Select,
} from "@mui/joy";
import {
  type Control,
  Controller,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { type EnumKey, withCurrentValue } from "@/hooks/enum-options";
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

  // N03: the error is drawn here, under the select — a required pick that is
  // missing says so instead of only scrolling to it.
  //
  // The stored value is always one of the options (`withCurrentValue`): Joy's
  // Select clears a value its options lack whenever they change, which wiped
  // the country of every item past the first page of countries on Save.
  return (
    <Controller
      name={name}
      control={control}
      rules={rules}
      render={({
        field: { ref, ...field },
        fieldState: { error: invalid },
      }) => (
        <FormControl required={required} error={invalid !== undefined}>
          <FormLabel>{label}</FormLabel>
          <Select
            placeholder={loading ? "Loading…" : placeholder}
            disabled={disabled || loading}
            {...field}
            slotProps={{ button: { ref } }}
            onChange={(_, value) => {
              field.onChange(value);
            }}
          >
            {withCurrentValue(enumKey, options, field.value).map((option) => (
              <Option key={option.value} value={option.value}>
                {option.label}
              </Option>
            ))}
          </Select>
          {invalid !== undefined && (
            <FormHelperText>
              {invalid.message !== undefined && invalid.message !== ""
                ? invalid.message
                : `${label} is required.`}
            </FormHelperText>
          )}
        </FormControl>
      )}
    />
  );
}
