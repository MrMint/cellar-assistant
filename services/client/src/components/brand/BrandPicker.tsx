"use client";

import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { useQuery } from "urql";
import { IconButton } from "@/components/app/IconButton";
import { Close, ICON_STROKE, Store } from "@/components/app/icons";
import {
  BRAND_PICKER_LIMIT,
  BrandPickerSearchQuery,
} from "@/components/common/OnboardingWizard/queries";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";

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
 * "Brand" free-solo combobox with the storefront icon, two-character
 * minimum, 300 ms debounce, and the "will be added as a new brand" note.
 *
 * What it produces changed with the API. The old picker wrote `brand_id`,
 * `brand_name` and `is_new_brand` into the form and `ensureAndLinkBrand`
 * acted on them after the insert. `confirmItemOnboarding` takes a
 * `brandName` and `BrandRegistryActor` resolves it (find-or-create on
 * `lower(trim(name))`), so picking an existing brand and typing its exact
 * name are the same act — the picker is a controlled string. The search is a
 * `useQuery` (paused below two characters), not a hand-gated `toPromise`.
 *
 * On shadcn: Joy's free-solo `Autocomplete` becomes an input-group anchor
 * with a `ui/popover` listbox (the ARIA 1.2 combobox: focus stays in the
 * box, the highlighted option is `aria-activedescendant`). Not `ui/command`:
 * cmdk always highlights its first option, so Enter would pick a match
 * where free solo keeps what was typed, and it renders a `<label>` of its
 * own beside the field's.
 */
export function BrandPicker({ value, onChange, disabled }: BrandPickerProps) {
  const id = useId();
  const inputId = `${id}-input`;
  const listId = `${id}-list`;
  const noteId = `${id}-note`;
  const anchorRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState(value);
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  // The highlighted option, for the option list it was made in.
  const [highlight, setHighlight] = useState({ list: "", index: -1 });

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

  // A new answer starts with nothing highlighted (-1), as Joy's free solo
  // did: Enter then keeps the typed text.
  const optionKey = options.map((option) => option.id).join();
  const active = highlight.list === optionKey ? highlight.index : -1;
  const setActive = (index: number) => setHighlight({ list: optionKey, index });

  const trimmedInput = inputValue.trim();
  const matchesExistingOption = options.some(
    (option) => option.name.toLowerCase() === trimmedInput.toLowerCase(),
  );

  const listOpen =
    open && !disabled && term !== "" && (fetching || options.length > 0);
  // While the first answer loads the popover shows a spinner, not the list.
  const listShown = listOpen && options.length > 0;
  const showNewBrandNote =
    trimmedInput.length > 0 &&
    !matchesExistingOption &&
    !fetching &&
    term !== "";
  const activeOption = listOpen ? options[active] : undefined;

  const pick = (option: BrandOption) => {
    setInputValue(option.name);
    onChange(option.name);
    setOpen(false);
  };

  const clear = () => {
    setInputValue("");
    onChange("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (options.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      // -1 is "nothing highlighted": the typed text stands.
      const next = active + step;
      setActive(
        next < -1 ? options.length - 1 : next >= options.length ? -1 : next,
      );
    } else if (event.key === "Enter" && activeOption !== undefined) {
      event.preventDefault();
      pick(activeOption);
    } else if (event.key === "Escape" && listOpen) {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    // `text-foreground`, as ItemFormField's shell: the onboarding form's other
    // labels are ink-1, and without it this one inherits Joy's body ink.
    <Field
      data-disabled={disabled ? true : undefined}
      className="gap-2 text-foreground"
    >
      <FieldLabel htmlFor={inputId}>Brand</FieldLabel>
      <Popover
        open={listOpen}
        onOpenChange={(next) => {
          if (!next) setOpen(false);
        }}
      >
        <PopoverAnchor asChild>
          <InputGroup ref={anchorRef} data-disabled={disabled || undefined}>
            <InputGroupAddon>
              <Store aria-hidden strokeWidth={ICON_STROKE} />
            </InputGroupAddon>
            <InputGroupInput
              id={inputId}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={listOpen}
              aria-controls={listShown ? listId : undefined}
              // Joy's FormControl tied its helper text to the input.
              aria-describedby={showNewBrandNote ? noteId : undefined}
              aria-activedescendant={
                activeOption !== undefined
                  ? `${listId}-${activeOption.id}`
                  : undefined
              }
              autoComplete="off"
              placeholder="Search or type a brand…"
              disabled={disabled}
              value={inputValue}
              onChange={(event) => {
                setInputValue(event.target.value);
                onChange(event.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onKeyDown={handleKeyDown}
            />
            {inputValue !== "" && !disabled && (
              <InputGroupAddon align="inline-end">
                <IconButton
                  variant="ghost"
                  size="sm"
                  aria-label="Clear"
                  // Keep focus in the box.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={clear}
                >
                  <Close />
                </IconButton>
              </InputGroupAddon>
            )}
          </InputGroup>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) p-1"
          // The box keeps focus; the list is only ever pointed at.
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          // A press anywhere in the popover (an option, the list's
          // scrollbar) must not blur the box, which would close the list —
          // Joy's listbox did the same.
          onMouseDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (anchorRef.current?.contains(event.target as Node)) {
              event.preventDefault();
            }
          }}
        >
          {options.length === 0 ? (
            <div className="flex items-center gap-2 px-2 py-2 text-ink-2 text-sm">
              <Spinner aria-hidden />
              Loading…
            </div>
          ) : (
            <div
              id={listId}
              role="listbox"
              aria-label="Brands"
              className="flex max-h-75 flex-col overflow-y-auto"
            >
              {options.map((option, index) => (
                // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard path is the combobox input (arrows + Enter, aria-activedescendant); options are never focused.
                <div
                  key={option.id}
                  id={`${listId}-${option.id}`}
                  role="option"
                  tabIndex={-1}
                  aria-selected={index === active}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => pick(option)}
                  className={cn(
                    "flex min-h-11 cursor-default items-center rounded-sm px-2 font-semibold text-sm",
                    index === active && "bg-accent text-accent-foreground",
                  )}
                >
                  {option.name}
                </div>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
      {showNewBrandNote && (
        <FieldDescription id={noteId}>
          “{trimmedInput}” will be added as a new brand.
        </FieldDescription>
      )}
    </Field>
  );
}
