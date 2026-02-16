"use client";

import { MdSearch } from "react-icons/md";
import {
  Autocomplete,
  AutocompleteOption,
  ListItemContent,
  Typography,
} from "@mui/joy";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type GoogleAutocompleteSuggestion,
  googleAutocompleteAction,
} from "@/app/(authenticated)/map/place-actions";

interface GooglePlaceSearchProps {
  latitude: number;
  longitude: number;
  onSelect: (suggestion: GoogleAutocompleteSuggestion) => void;
  disabled?: boolean;
}

export function GooglePlaceSearch({
  latitude,
  longitude,
  onSelect,
  disabled,
}: GooglePlaceSearchProps) {
  const [inputValue, setInputValue] = useState("");
  const [options, setOptions] = useState<GoogleAutocompleteSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchSuggestions = useCallback(
    async (input: string) => {
      if (input.length < 2) {
        setOptions([]);
        return;
      }

      setLoading(true);
      try {
        const result = await googleAutocompleteAction(
          input,
          latitude,
          longitude,
        );
        setOptions(result.suggestions);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    },
    [latitude, longitude],
  );

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (inputValue.length < 2) {
      setOptions([]);
      return;
    }

    debounceRef.current = setTimeout(() => {
      fetchSuggestions(inputValue);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [inputValue, fetchSuggestions]);

  return (
    <Autocomplete
      freeSolo
      placeholder="Search Google for this place..."
      startDecorator={<MdSearch />}
      inputValue={inputValue}
      onInputChange={(_event, value) => setInputValue(value)}
      options={options}
      loading={loading}
      disabled={disabled}
      getOptionLabel={(option) =>
        typeof option === "string" ? option : option.name
      }
      isOptionEqualToValue={(option, value) =>
        option.googlePlaceId === value.googlePlaceId
      }
      onChange={(_event, value) => {
        if (value && typeof value !== "string") {
          onSelect(value);
        }
      }}
      renderOption={(props, option) => (
        <AutocompleteOption {...props} key={option.googlePlaceId}>
          <ListItemContent>
            <Typography level="title-sm">{option.name}</Typography>
            {option.secondaryText && (
              <Typography level="body-xs">{option.secondaryText}</Typography>
            )}
          </ListItemContent>
        </AutocompleteOption>
      )}
      size="sm"
      sx={{ mb: 1 }}
    />
  );
}
