"use client";

import { type KeyboardEvent, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { breakpointUp, useMediaQuery } from "@/hooks/useMediaQuery";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { BottomSheet } from "./BottomSheet";
import { Arrange, Check, ICON_STROKE } from "./icons";

export type SortOption<V extends string> = {
  value: V;
  /** The row's words in the sheet ("My rating, best first"). */
  label: string;
  /** The button's short word ("Best"); defaults to `label`. */
  short?: string;
  /** Draw a rule above this row: the sheet's second group starts here. */
  groupStart?: boolean;
};

export type SortChipProps<V extends string> = {
  options: readonly SortOption<V>[];
  value: V;
  onValueChange: (value: V) => void;
  /** The sheet's and the menu's heading, and the chip's name prefix. */
  label?: string;
  /**
   * Shown in place of the current order while sorting does not apply (a
   * search orders by match): the chip says so and cannot be opened.
   */
  overriddenBy?: string;
  className?: string;
};

/**
 * KIT § 2 "Sort button and sheet": a 44 button, r8, card, edge-2, the
 * arrange glyph and the current order's short word ("A–Z"), named
 * "<label>: <order>". One chip that names the current order and opens
 * the choices: a bottom sheet of radio rows on a phone, a radio menu from
 * `md` (the AppBar overflow's split). Shaped like a `FilterChip` so it sits
 * in a chip row, but it is a menu button, not a toggle: the order is never
 * "off".
 */
export function SortChip<V extends string>({
  options,
  value,
  onValueChange,
  label = "Sort by",
  overriddenBy,
  className,
}: SortChipProps<V>) {
  const desktop = useMediaQuery(breakpointUp("md"));
  const [sheetOpen, setSheetOpen] = useState(false);
  const current = options.find((option) => option.value === value);
  const shown = overriddenBy ?? current?.short ?? current?.label ?? "";
  const named = overriddenBy ?? current?.label ?? "";
  const disabled = overriddenBy !== undefined;

  const chip = (
    <button
      type="button"
      data-slot="sort-chip"
      disabled={disabled}
      aria-label={`${label}: ${named}`}
      aria-haspopup={desktop ? "menu" : "dialog"}
      onClick={desktop ? undefined : () => setSheetOpen(true)}
      className={cn(
        "t-head relative inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-edge-2 bg-card pr-3 pl-2.5 text-ink outline-none transition-[color,background-color,transform] duration-(--ca-dur-micro) ease-standard focus-visible:outline-2 focus-visible:outline-act-ink focus-visible:outline-offset-2 active:scale-97 disabled:text-ink-3 disabled:active:scale-100 motion-reduce:active:scale-100 [&_svg]:size-5 [@media(hover:hover)]:hover:bg-raised",
        className,
      )}
    >
      <Arrange aria-hidden strokeWidth={ICON_STROKE} className="text-ink-3" />
      {shown}
    </button>
  );

  // The sheet's rows are a radio group: one tab stop (the current order),
  // and the arrows, Home and End move between rows (WAI-ARIA radio group).
  // Arrows move focus only — a row closes the sheet when picked, so picking
  // stays on Enter, Space or a tap.
  const onRowsKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const rows = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    );
    const at = rows.indexOf(event.target as HTMLButtonElement);
    if (at === -1) return;
    const step: Record<string, number> = {
      ArrowDown: at + 1,
      ArrowRight: at + 1,
      ArrowUp: at - 1,
      ArrowLeft: at - 1,
      Home: 0,
      End: rows.length - 1,
    };
    const to = step[event.key];
    if (to === undefined) return;
    event.preventDefault();
    rows[(to + rows.length) % rows.length]?.focus();
  };

  if (desktop) {
    return (
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild disabled={disabled}>
          {chip}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={value}
            onValueChange={(next) => {
              feedback("detent");
              onValueChange(next as V);
            }}
          >
            {options.map((option) => (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                className={cn(
                  option.groupStart && "mt-1.5 border-rule border-t",
                )}
              >
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <>
      {chip}
      <BottomSheet open={sheetOpen} onOpenChange={setSheetOpen} title={label}>
        <div
          role="radiogroup"
          aria-label={label}
          onKeyDown={onRowsKeyDown}
          className="flex flex-col pb-2"
        >
          {options.map((option) => {
            const checked = option.value === value;
            return (
              // biome-ignore lint/a11y/useSemanticElements: a sheet row, not a native radio — it closes the sheet on tap
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                // Applied at once — the list starts loading while the sheet
                // slides away — and nothing else opens from here, so there
                // is no second modal to wait for.
                onClick={() => {
                  feedback("detent");
                  setSheetOpen(false);
                  if (option.value !== value) onValueChange(option.value);
                }}
                className={cn(
                  "t-body -mx-4 flex h-12 w-[calc(100%+2rem)] items-center justify-between gap-3 px-4 text-left outline-none focus-visible:bg-raised active:bg-raised",
                  checked ? "text-ink" : "text-ink-2",
                  option.groupStart && "mt-1.5 border-rule border-t",
                )}
              >
                {option.label}
                {checked && (
                  <Check
                    aria-hidden
                    strokeWidth={ICON_STROKE}
                    className="size-5 text-act-ink"
                  />
                )}
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
}
