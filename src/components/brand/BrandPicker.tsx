"use client";

import {
  Autocomplete,
  AutocompleteOption,
  FormControl,
  FormHelperText,
  FormLabel,
  ListItemContent,
  Typography,
} from "@mui/joy";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Control,
  type FieldValues,
  type Path,
  type PathValue,
  type UseFormSetValue,
  useWatch,
} from "react-hook-form";
import { MdStorefront } from "react-icons/md";
import { useClient } from "urql";
import { escapeLike } from "@/utilities/brand";
import { SearchBrandsQuery } from "./queries";

type BrandOption = {
  id: string;
  name: string;
};

// The brand-related fields every onboarding form shares.
type BrandFieldValues = {
  brand_id?: string;
  brand_name?: string;
  is_new_brand?: boolean;
};

interface BrandPickerProps<T extends FieldValues & BrandFieldValues> {
  control: Control<T>;
  setValue: UseFormSetValue<T>;
  initialBrandName?: string | null;
  disabled?: boolean;
}

export function BrandPicker<T extends FieldValues & BrandFieldValues>({
  control,
  setValue,
  initialBrandName,
  disabled,
}: BrandPickerProps<T>) {
  const client = useClient();
  const [inputValue, setInputValue] = useState(initialBrandName ?? "");
  const [options, setOptions] = useState<BrandOption[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isNewBrand = useWatch({ control, name: "is_new_brand" as Path<T> });

  const applySelection = useCallback(
    (selection: BrandFieldValues) => {
      const set = (field: keyof BrandFieldValues, value: unknown) =>
        setValue(field as Path<T>, value as PathValue<T, Path<T>>, {
          shouldDirty: true,
        });
      set("brand_id", selection.brand_id);
      set("brand_name", selection.brand_name);
      set("is_new_brand", selection.is_new_brand);
    },
    [setValue],
  );

  const fetchBrands = useCallback(
    async (search: string) => {
      setLoading(true);
      try {
        const result = await client
          .query(SearchBrandsQuery, {
            search: `%${escapeLike(search)}%`,
            limit: 10,
          })
          .toPromise();
        setOptions(result.data?.brands ?? []);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (inputValue.trim().length < 2) {
      setOptions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      fetchBrands(inputValue.trim());
    }, 300);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [inputValue, fetchBrands]);

  const trimmedInput = inputValue.trim();
  const matchesExistingOption = options.some(
    (option) => option.name.toLowerCase() === trimmedInput.toLowerCase(),
  );

  return (
    <FormControl>
      <FormLabel>Brand</FormLabel>
      <Autocomplete
        freeSolo
        placeholder="Search or type a brand…"
        startDecorator={<MdStorefront />}
        disabled={disabled}
        loading={loading}
        inputValue={inputValue}
        options={options}
        filterOptions={(opts) => opts}
        getOptionLabel={(option) =>
          typeof option === "string" ? option : option.name
        }
        isOptionEqualToValue={(option, value) => option.id === value.id}
        onInputChange={(_event, value, reason) => {
          setInputValue(value);
          if (reason === "input") {
            applySelection({
              brand_id: undefined,
              brand_name: value,
              is_new_brand: value.trim().length > 0,
            });
          }
          if (reason === "clear") {
            applySelection({
              brand_id: undefined,
              brand_name: undefined,
              is_new_brand: false,
            });
          }
        }}
        onChange={(_event, value) => {
          if (value && typeof value !== "string") {
            setInputValue(value.name);
            applySelection({
              brand_id: value.id,
              brand_name: value.name,
              is_new_brand: false,
            });
          } else if (value === null) {
            setInputValue("");
            applySelection({
              brand_id: undefined,
              brand_name: undefined,
              is_new_brand: false,
            });
          }
        }}
        renderOption={(props, option) => (
          <AutocompleteOption {...props} key={option.id}>
            <ListItemContent>
              <Typography level="title-sm">{option.name}</Typography>
            </ListItemContent>
          </AutocompleteOption>
        )}
      />
      {isNewBrand && trimmedInput.length > 0 && !matchesExistingOption && (
        <FormHelperText>
          “{trimmedInput}” will be added as a new brand.
        </FormHelperText>
      )}
    </FormControl>
  );
}
