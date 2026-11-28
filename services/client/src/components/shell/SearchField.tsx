"use client";

import { useEffect, useRef, useState } from "react";
import { Close, ICON_STROKE, Search } from "@/components/app/icons";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { feedback } from "@/lib/feedback";
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
 * A debounced search box (KIT § 3 "Search"): 44 high, r8, card, edge-2, the
 * magnifier at 20 in ink-3 (a spinner while searching), focus on act-ink. An
 * uncontrolled input and one callback after the typing pauses (it replaced
 * the Joy-era `common/DebouncedInput`). While there is text, a 44 clear
 * button sits at the right: it empties the field, reports "" at once (no
 * debounce: clearing is a decision, not typing), ticks and keeps the focus.
 * Give it an `aria-label` saying what is searched; without one the
 * placeholder doubles as the name.
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
  const input = useRef<HTMLInputElement>(null);
  const [hasText, setHasText] = useState(defaultValue !== "");
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <InputGroup data-slot="search-field" className={cn("pr-0", className)}>
      <InputGroupAddon className="text-ink-3">
        {searching ? (
          <Spinner className="size-5" />
        ) : (
          <Search aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
        )}
      </InputGroupAddon>
      <InputGroupInput
        ref={input}
        type="search"
        className="[&::-webkit-search-cancel-button]:appearance-none"
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        onChange={(event) => {
          const { value } = event.target;
          setHasText(value !== "");
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(
            () => onDebounced(value),
            debounceTimeout,
          );
        }}
      />
      {hasText && (
        <button
          type="button"
          aria-label="Clear search"
          data-slot="search-clear"
          onClick={() => {
            feedback("tick");
            window.clearTimeout(timer.current);
            if (input.current !== null) input.current.value = "";
            setHasText(false);
            onDebounced("");
            input.current?.focus();
          }}
          className="-my-px -mr-px flex size-11 shrink-0 items-center justify-center rounded-r-md text-ink-3 outline-none active:bg-raised focus-visible:outline-2 focus-visible:outline-act-ink"
        >
          <Close aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
        </button>
      )}
    </InputGroup>
  );
}
