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
import { useEffect, useState } from "react";
import { MdStorefront } from "react-icons/md";
import { useQuery } from "urql";
import {
  BRAND_PICKER_LIMIT,
  BrandPickerSearchQuery,
} from "@/components/common/OnboardingWizard/queries";
import { unwrapResult } from "@/lib/api/result";

type BrandOption = {
  id: string;
  name: string;
};

interface BrandPickerProps {
  /** The brand name as typed or picked; `""` for none. */
  value: string;
  onChange: (brandName: string) => void;
  disabled?: boolean;
}

/**
 * `82450ad1:src/components/brand/BrandPicker.tsx`, restored: the same
 * "Brand" free-solo `Autocomplete` with the storefront icon, two-character
 * minimum, 300 ms debounce, and the "will be added as a new brand" note.
 *
 * What it produces changed with the API. The old picker wrote `brand_id`,
 * `brand_name` and `is_new_brand` into the form and `ensureAndLinkBrand`
 * acted on them after the insert. `confirmItemOnboarding` takes a
 * `brandName` and `BrandRegistryActor` resolves it (find-or-create on
 * `lower(trim(name))`), so picking an existing brand and typing its exact
 * name are the same act — the picker is a controlled string. The search is a
 * `useQuery` (paused below two characters), not a hand-gated `toPromise`.
 */
export function BrandPicker({ value, onChange, disabled }: BrandPickerProps) {
  const [inputValue, setInputValue] = useState(value);
  const [term, setTerm] = useState("");

  useEffect(() => {
    const trimmed = inputValue.trim();
    if (trimmed.length < 2) {
      setTerm("");
      return;
    }
    const timer = setTimeout(() => setTerm(trimmed), 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const [{ data, fetching }] = useQuery({
    query: BrandPickerSearchQuery,
    variables: { term, limit: BRAND_PICKER_LIMIT, first: BRAND_PICKER_LIMIT },
    pause: term === "",
  });
  const result = unwrapResult(data?.brandSearch, "BrandSearchConnection");
  const options: BrandOption[] =
    term === "" || !result.ok
      ? []
      : result.data.edges.map(({ node }) => ({ id: node.id, name: node.name }));

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
        loading={fetching}
        inputValue={inputValue}
        options={options}
        filterOptions={(opts) => opts}
        getOptionLabel={(option) =>
          typeof option === "string" ? option : option.name
        }
        isOptionEqualToValue={(option, other) => option.id === other.id}
        onInputChange={(_event, next, reason) => {
          setInputValue(next);
          if (reason === "input") onChange(next);
          if (reason === "clear") onChange("");
        }}
        onChange={(_event, picked) => {
          if (picked && typeof picked !== "string") {
            setInputValue(picked.name);
            onChange(picked.name);
          } else if (picked === null) {
            setInputValue("");
            onChange("");
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
      {trimmedInput.length > 0 &&
        !matchesExistingOption &&
        !fetching &&
        term !== "" && (
          <FormHelperText>
            “{trimmedInput}” will be added as a new brand.
          </FormHelperText>
        )}
    </FormControl>
  );
}
