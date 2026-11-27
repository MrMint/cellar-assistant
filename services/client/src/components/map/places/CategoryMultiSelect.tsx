"use client";

import { useState } from "react";
import { Check, ChevronDown, ICON_STROKE } from "@/components/app/icons";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface CategoryOption<V extends string = string> {
  label: string;
  value: V;
  /** The group heading the option sits under ("Venues", "Retail"). */
  tier: string;
}

/**
 * The create-place form's "Categories *" picker: the Joy `Autocomplete
 * multiple groupBy` it replaces, as `ui/command` in a `ui/popover` (app
 * README, "Controls"). The trigger is a `combobox` button the form's label
 * points at; the list keeps cmdk's `option` roles, filters as you type, and
 * stays open while you pick several — Escape or a tap outside closes it.
 *
 * Selected categories show as chips in the trigger. Unlike Joy's chips they
 * carry no ✕ of their own (a button inside a button is not valid markup):
 * tapping a selected option again removes it.
 */
export function CategoryMultiSelect<V extends string>({
  id,
  options,
  value,
  onChange,
  onBlur,
  placeholder,
  invalid = false,
  describedBy,
}: {
  id: string;
  options: readonly CategoryOption<V>[];
  value: readonly CategoryOption<V>[];
  onChange: (next: CategoryOption<V>[]) => void;
  onBlur?: () => void;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = `${id}-list`;
  // The label names the combobox; the picked categories describe it, so a
  // screen reader hears them without opening the list.
  const valueId = `${id}-value`;
  const describedByIds =
    [value.length > 0 ? valueId : undefined, describedBy]
      .filter(Boolean)
      .join(" ") || undefined;
  const selected = new Set(value.map((option) => option.value));
  const tiers = Array.from(new Set(options.map((option) => option.tier)));

  const toggle = (option: CategoryOption<V>) => {
    onChange(
      selected.has(option.value)
        ? value.filter((v) => v.value !== option.value)
        : [...value, option], // pick order, as Joy's Autocomplete appended
    );
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) onBlur?.();
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          aria-invalid={invalid || undefined}
          aria-describedby={describedByIds}
          className={cn(
            "flex min-h-11 w-full min-w-0 flex-wrap items-center gap-1 rounded-sm border border-input bg-transparent py-1.5 pr-9 pl-3 text-left text-base shadow-xs outline-none transition-[color,box-shadow] md:text-sm dark:bg-input/30",
            "relative focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
          )}
        >
          {value.length === 0 ? (
            <span className="text-ink-2">{placeholder}</span>
          ) : (
            <span id={valueId} className="contents">
              {value.map((option, index) => (
                <Badge key={option.value} variant="secondary">
                  {option.label}
                  {/* a separator for the description, not for the eye */}
                  {index < value.length - 1 && (
                    <span className="sr-only">,</span>
                  )}
                </Badge>
              ))}
            </span>
          )}
          <ChevronDown
            aria-hidden
            strokeWidth={ICON_STROKE}
            className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-3"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-64 p-0"
      >
        <Command>
          <CommandInput placeholder="Search categories..." />
          <CommandList id={listId} aria-multiselectable>
            <CommandEmpty>No matching categories</CommandEmpty>
            {tiers.map((tier) => (
              <CommandGroup key={tier} heading={tier}>
                {options
                  .filter((option) => option.tier === tier)
                  .map((option) => {
                    const on = selected.has(option.value);
                    return (
                      <CommandItem
                        key={option.value}
                        value={option.label}
                        onSelect={() => toggle(option)}
                        aria-checked={on}
                        className="min-h-11"
                      >
                        <span className="flex-1">{option.label}</span>
                        <Check
                          aria-hidden
                          strokeWidth={ICON_STROKE}
                          className={cn(
                            "text-ink",
                            on ? "opacity-100" : "opacity-0",
                          )}
                        />
                      </CommandItem>
                    );
                  })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
