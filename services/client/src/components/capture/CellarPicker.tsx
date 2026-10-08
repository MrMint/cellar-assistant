"use client";

import { useId } from "react";
import { Cellar } from "@/components/app/icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** The "no bottle, just the catalog item" choice. */
const NONE = "__catalog_only__";

export type AddableCellar = { readonly id: string; readonly name: string };

/**
 * Where the new bottle goes (X05: the cellar is defaulted, not asked — the
 * last one used, else the most recently active one). One row on the draft
 * card; changing it is optional. "Just the catalog" files no bottle.
 */
export function CellarPicker({
  cellars,
  value,
  onValueChange,
  allowNone = true,
}: {
  cellars: readonly AddableCellar[];
  value: string | null;
  onValueChange: (cellarId: string | null) => void;
  allowNone?: boolean;
}) {
  const id = useId();
  return (
    <div
      data-slot="cellar-picker"
      className="flex min-h-11 items-center gap-3 rounded-lg bg-surface-1 px-4"
    >
      <Cellar aria-hidden className="size-5 shrink-0 text-ink-2" />
      <label htmlFor={id} className="type-body shrink-0 text-ink-2">
        Into
      </label>
      <Select
        value={value ?? NONE}
        onValueChange={(next) => onValueChange(next === NONE ? null : next)}
      >
        <SelectTrigger
          id={id}
          className="min-w-0 flex-1 justify-between border-0 bg-transparent px-0 text-ink-1 shadow-none dark:bg-transparent"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {cellars.map((cellar) => (
            <SelectItem key={cellar.id} value={cellar.id} className="min-h-11">
              {cellar.name}
            </SelectItem>
          ))}
          {allowNone && (
            <SelectItem value={NONE} className="min-h-11">
              No cellar — just the catalog
            </SelectItem>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
