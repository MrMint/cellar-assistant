"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { type GoogleAutocompleteSuggestion, usePlaceActions } from "../actions";

interface GooglePlaceSearchProps {
  latitude: number;
  longitude: number;
  onSelect: (suggestion: GoogleAutocompleteSuggestion) => void;
  disabled?: boolean;
}

/**
 * A free-text combobox (Joy's `Autocomplete freeSolo`): the input stays in
 * the form, the suggestions open under it. cmdk handles the arrow keys and
 * Enter from the input; the list portals, so the input keeps focus.
 */
export function GooglePlaceSearch({
  latitude,
  longitude,
  onSelect,
  disabled,
}: GooglePlaceSearchProps) {
  const { googleAutocompleteAction } = usePlaceActions();
  const [inputValue, setInputValue] = useState("");
  const [options, setOptions] = useState<GoogleAutocompleteSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const anchorRef = useRef<HTMLDivElement>(null);

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
    [latitude, longitude, googleAutocompleteAction],
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

  const open =
    focused &&
    !disabled &&
    inputValue.length >= 2 &&
    (loading || options.length > 0);

  const select = (option: GoogleAutocompleteSuggestion) => {
    setInputValue(option.name);
    setFocused(false);
    onSelect(option);
  };

  return (
    <Command
      shouldFilter={false}
      className="mb-2 h-auto overflow-visible bg-transparent **:data-[slot=command-input-wrapper]:h-11 **:data-[slot=command-input-wrapper]:rounded-md **:data-[slot=command-input-wrapper]:border **:data-[slot=command-input-wrapper]:border-input **:data-[slot=command-input-wrapper]:bg-input/30 **:data-[slot=command-input-wrapper]:focus-within:ring-[3px] **:data-[slot=command-input-wrapper]:focus-within:ring-ring/50"
    >
      <Popover open={open}>
        <PopoverAnchor asChild>
          <div ref={anchorRef}>
            <CommandInput
              aria-label="Search Google for this place"
              placeholder="Search Google for this place..."
              value={inputValue}
              onValueChange={setInputValue}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setFocused(false);
              }}
              disabled={disabled}
              className="text-base md:text-sm"
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) min-w-60 p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (anchorRef.current?.contains(e.target as Node)) {
              e.preventDefault();
            }
          }}
          // A tap on an option must not blur the input first (the blur
          // would close the list before the tap lands).
          onMouseDown={(e) => e.preventDefault()}
        >
          <CommandList>
            <CommandEmpty>
              {loading ? (
                <span className="flex justify-center">
                  <Spinner className="text-ink-2" />
                </span>
              ) : (
                "No options"
              )}
            </CommandEmpty>
            {options.map((option) => (
              <CommandItem
                key={option.googlePlaceId}
                value={option.googlePlaceId}
                onSelect={() => select(option)}
                className="min-h-11 flex-col items-start gap-0"
              >
                <span className="type-callout font-semibold text-ink-1">
                  {option.name}
                </span>
                {option.secondaryText && (
                  <span className="type-footnote">{option.secondaryText}</span>
                )}
              </CommandItem>
            ))}
          </CommandList>
        </PopoverContent>
      </Popover>
    </Command>
  );
}
