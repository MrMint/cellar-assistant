import { Amphora, Beer, Coffee, Leaf, Milk, Wine } from "lucide-react";
import type { ComponentProps } from "react";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { ITEM_TYPE_ORDER } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { type AppIcon, ICON_STROKE } from "./icons";

export type ItemTypeToken = {
  label: string;
  glyph: AppIcon;
  /** Text-safe hue on dark (≥ 4.5:1). */
  textClass: string;
  /** The type's tint behind a chip or plate (deep hue, ~18%). */
  tintClass: string;
  /** The deep hue as a fill: pins, rules, dots. */
  deepClass: string;
};

/**
 * The six beverage types (design §3.1): one order — wine, beer, spirit,
 * sake, coffee, tea — and one colour set, everywhere. Class names are written
 * out in full so Tailwind can see them.
 *
 * The glyphs are Lucide stand-ins until B03's custom set (Bordeaux bottle,
 * tall-neck, decanter, tokkuri, bag with valve, gaiwan); the spirit and sake
 * ones are deliberately not a cocktail glass and a whisky tumbler.
 */
export const itemTypeTokens: Readonly<Record<ApiItemType, ItemTypeToken>> = {
  WINE: {
    label: "Wine",
    glyph: Wine,
    textClass: "text-type-wine-text",
    tintClass: "bg-type-wine/20",
    deepClass: "bg-type-wine",
  },
  BEER: {
    label: "Beer",
    glyph: Beer,
    textClass: "text-type-beer-text",
    tintClass: "bg-type-beer/20",
    deepClass: "bg-type-beer",
  },
  SPIRIT: {
    label: "Spirit",
    glyph: Amphora,
    textClass: "text-type-spirit-text",
    tintClass: "bg-type-spirit/20",
    deepClass: "bg-type-spirit",
  },
  SAKE: {
    label: "Sake",
    glyph: Milk,
    textClass: "text-type-sake-text",
    tintClass: "bg-type-sake/20",
    deepClass: "bg-type-sake",
  },
  COFFEE: {
    label: "Coffee",
    glyph: Coffee,
    textClass: "text-type-coffee-text",
    tintClass: "bg-type-coffee/20",
    deepClass: "bg-type-coffee",
  },
  TEA: {
    label: "Tea",
    glyph: Leaf,
    textClass: "text-type-tea-text",
    tintClass: "bg-type-tea/20",
    deepClass: "bg-type-tea",
  },
};

/** The types in the canonical order, for filters and pickers. */
export const ITEM_TYPES_IN_ORDER: readonly ApiItemType[] = ITEM_TYPE_ORDER;

/**
 * A type's glyph in its text-safe hue. Decorative by default; on touch a
 * glyph never stands alone, so pair it with the word (`TypeChip`) unless
 * the type is already written next to it.
 */
export function TypeGlyph({
  type,
  className,
  ...props
}: { type: ApiItemType } & Omit<ComponentProps<"svg">, "ref">) {
  const { glyph: Glyph, textClass } = itemTypeTokens[type];
  return (
    <Glyph
      aria-hidden
      strokeWidth={ICON_STROKE}
      data-slot="type-glyph"
      data-type={type}
      className={cn("size-4 shrink-0", textClass, className)}
      {...props}
    />
  );
}

/** Glyph + word on the type's tint: "🍷 Wine". */
export function TypeChip({
  type,
  className,
  ...props
}: { type: ApiItemType } & ComponentProps<"span">) {
  const { label, textClass, tintClass } = itemTypeTokens[type];
  return (
    <span
      data-slot="type-chip"
      data-type={type}
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 font-medium text-xs",
        tintClass,
        textClass,
        className,
      )}
      {...props}
    >
      <TypeGlyph type={type} className="size-3.5" />
      {label}
    </span>
  );
}
