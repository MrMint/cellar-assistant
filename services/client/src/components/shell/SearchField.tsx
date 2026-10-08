"use client";

import { useEffect, useRef } from "react";
import { Search } from "@/components/app/icons";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type SearchFieldProps = {
  /** Called `debounceTimeout` ms after the last keystroke, with the value. */
  onDebounced: (value: string) => void;
  debounceTimeout: number;
  defaultValue?: string;
  placeholder?: string;
  /** The field's accessible name; defaults to the placeholder. */
  "aria-label"?: string;
  /** A request is in flight: the search glyph becomes a spinner. */
  searching?: boolean;
  className?: string;
};

/**
 * A debounced search box: magnifier (or a spinner while searching), an
 * uncontrolled input, and one callback after the typing pauses. What the
 * Joy-era `common/DebouncedInput` was used for on the shell's own screens
 * (`HeaderBar`, Friends); that component stays for its other callers.
 */
export function SearchField({
  onDebounced,
  debounceTimeout,
  defaultValue = "",
  placeholder = "Search",
  "aria-label": ariaLabel,
  searching = false,
  className,
}: SearchFieldProps) {
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <InputGroup className={cn("bg-surface-2", className)}>
      <InputGroupAddon>
        {searching ? (
          <Spinner />
        ) : (
          <Search aria-hidden className="size-4" strokeWidth={1.75} />
        )}
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        onChange={(event) => {
          const { value } = event.target;
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(
            () => onDebounced(value),
            debounceTimeout,
          );
        }}
      />
    </InputGroup>
  );
}
