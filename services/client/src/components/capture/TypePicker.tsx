"use client";

import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import {
  ITEM_TYPES_IN_ORDER,
  itemTypeTokens,
  TypeGlyph,
} from "@/components/app/TypeChip";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { cn } from "@/lib/utils";

/**
 * Which of the six types the shutter reads the label as (X05). The person
 * says it — there is no classifier call (D25) — and it opens on the last one
 * they used. A scrolling row of glyph + word chips: on a phone six segments
 * would not fit with their words, and a glyph never stands alone on touch.
 * Radix's single toggle group, so it is a `radiogroup` that arrows move
 * through and that cannot be tapped into "nothing".
 */
export function TypePicker({
  value,
  onValueChange,
  className,
}: {
  value: ApiItemType;
  onValueChange: (type: ApiItemType) => void;
  className?: string;
}) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next !== "") onValueChange(next as ApiItemType);
      }}
      aria-label="What are you adding?"
      data-slot="type-picker"
      className={cn(
        "-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {ITEM_TYPES_IN_ORDER.map((type) => (
        <ToggleGroupPrimitive.Item
          key={type}
          value={type}
          data-slot="type-option"
          className={cn(
            "group relative inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 font-medium text-sm outline-none transition-[color,background-color,transform] duration-(--ca-dur-micro) ease-standard after:absolute after:-inset-y-1 after:inset-x-0 after:content-[''] focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-97 motion-reduce:active:scale-100",
            "bg-surface-2 text-ink-2 hover:bg-surface-3 data-[state=on]:bg-ink-1 data-[state=on]:text-background",
          )}
        >
          <TypeGlyph
            type={type}
            className="group-data-[state=on]:text-background"
          />
          {itemTypeTokens[type].label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}
