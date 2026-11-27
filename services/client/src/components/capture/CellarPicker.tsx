"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/app/BottomSheet";
import {
  Add,
  Cellar,
  Check,
  ChevronDown,
  Recipe,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";

export type AddableCellar = { readonly id: string; readonly name: string };

const rowClass =
  "flex min-h-14 w-full items-center gap-4 rounded-lg px-2 text-left outline-none transition-transform duration-(--ca-dur-micro) focus-visible:outline-2 focus-visible:outline-act-ink active:scale-97 active:bg-raised motion-reduce:active:scale-100";

/**
 * Where the new bottle goes (X05: defaulted, not asked — the last one used,
 * else the most recently active one). Capture-Camera 29: the camera's title
 * is a button, "Add to Tosa HQ ▾", which opens the "Add to" sheet: each
 * cellar, "Just the catalog" (no bottle kept), and New cellar.
 */
export function CellarPicker({
  cellars,
  value,
  onValueChange,
  allowNone = true,
  className,
}: {
  cellars: readonly AddableCellar[];
  value: string | null;
  onValueChange: (cellarId: string | null) => void;
  allowNone?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = cellars.find((cellar) => cellar.id === value);
  const title =
    current === undefined ? "Add to the catalog" : `Add to ${current.name}`;
  const choose = (next: string | null) => {
    feedback("detent");
    onValueChange(next);
    setOpen(false);
  };
  return (
    <>
      <button
        type="button"
        data-slot="cellar-picker"
        aria-haspopup="dialog"
        onClick={() => {
          feedback("press");
          setOpen(true);
        }}
        className={cn(
          "inline-flex h-11 min-w-0 items-center gap-1 rounded-lg px-2 text-ink outline-none transition-transform duration-(--ca-dur-micro) focus-visible:outline-2 focus-visible:outline-act-ink active:scale-97 motion-reduce:active:scale-100",
          className,
        )}
      >
        <span className="t-head min-w-0 truncate">{title}</span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-2" />
      </button>
      <BottomSheet open={open} onOpenChange={setOpen} title="Add to">
        <div role="listbox" aria-label="Add to" className="flex flex-col pb-2">
          {cellars.map((cellar) => (
            <button
              key={cellar.id}
              type="button"
              role="option"
              aria-selected={cellar.id === value}
              className={rowClass}
              onClick={() => choose(cellar.id)}
            >
              <Cellar aria-hidden className="size-5 shrink-0 text-glyph" />
              <span className="t-head min-w-0 flex-1 truncate text-ink">
                {cellar.name}
              </span>
              {cellar.id === value && (
                <Check aria-hidden className="size-5 shrink-0 text-act-ink" />
              )}
            </button>
          ))}
          {allowNone && (
            <button
              type="button"
              role="option"
              aria-selected={value === null}
              className={rowClass}
              onClick={() => choose(null)}
            >
              <Recipe aria-hidden className="size-5 shrink-0 text-glyph" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="t-head text-ink">Just the catalog</span>
                <span className="t-cap text-ink-2">No bottle kept</span>
              </span>
              {value === null && (
                <Check aria-hidden className="size-5 shrink-0 text-act-ink" />
              )}
            </button>
          )}
          <div className="my-2 border-hair border-t" />
          <Link
            href="/cellars/add"
            underline="none"
            className={rowClass}
            onClick={() => feedback("press")}
          >
            <Add aria-hidden className="size-5 shrink-0 text-act-ink" />
            <span className="t-head text-ink">New cellar</span>
          </Link>
        </div>
      </BottomSheet>
    </>
  );
}
