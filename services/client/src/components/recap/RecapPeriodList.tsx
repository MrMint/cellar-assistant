/**
 * The Recaps list (MC-recap, Social-Recap board 02): this month, each year
 * with its months, a check on the one showing. A bottom sheet on phones; the
 * desktop draws the same rows as a column beside the card.
 */
import type { KeyboardEvent } from "react";
import { BottomSheet } from "@/components/app/BottomSheet";
import { Check, ICON_STROKE } from "@/components/app/icons";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import type { RecapPeriodOption } from "./recap-copy";

export function RecapPeriodRows({
  options,
  value,
  onPick,
  variant = "sheet",
}: {
  options: readonly RecapPeriodOption[];
  value: string;
  onPick: (key: string) => void;
  variant?: "sheet" | "column";
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const rows = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    );
    const at = rows.indexOf(document.activeElement as HTMLButtonElement);
    const next = rows[at + (event.key === "ArrowDown" ? 1 : -1)];
    if (next !== undefined) {
      event.preventDefault();
      next.focus();
    }
  };
  return (
    <div
      role="radiogroup"
      aria-label="Recaps"
      onKeyDown={onKeyDown}
      className={cn("flex flex-col", variant === "sheet" && "pb-2")}
    >
      {options.map((option) => {
        const checked = option.key === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: a list row, not a native radio — picking it loads that recap
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => {
              feedback("detent");
              onPick(option.key);
            }}
            className={cn(
              "t-body flex min-h-12 items-center justify-between gap-3 text-left outline-none focus-visible:bg-raised active:bg-raised",
              variant === "sheet"
                ? "-mx-4 w-[calc(100%+2rem)] px-4"
                : "rounded-md border border-transparent px-3",
              checked ? "text-ink-1" : "text-ink-2",
              checked && variant === "column" && "border-edge-2 bg-sel",
            )}
          >
            <span>{option.label}</span>
            {variant === "sheet" ? (
              <span className="flex items-center gap-2">
                {option.sub !== "" && (
                  <span className="t-cap text-ink-2">{option.sub}</span>
                )}
                {checked && (
                  <Check
                    aria-hidden
                    strokeWidth={ICON_STROKE}
                    className="size-5 text-act-ink"
                  />
                )}
              </span>
            ) : option.sub !== "" ? (
              <span className="t-cap text-ink-2">{option.sub}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function RecapPeriodSheet({
  open,
  onOpenChange,
  options,
  value,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: readonly RecapPeriodOption[];
  value: string;
  onPick: (key: string) => void;
}) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="Recaps">
      <RecapPeriodRows
        options={options}
        value={value}
        onPick={(key) => {
          onOpenChange(false);
          if (key !== value) onPick(key);
        }}
      />
    </BottomSheet>
  );
}
