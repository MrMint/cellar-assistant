import type { ComponentProps } from "react";
import {
  type AppIcon,
  Business,
  ICON_STROKE,
  Place,
} from "@/components/app/icons";
import { itemTypeTokens } from "@/components/app/TypeChip";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { cn } from "@/lib/utils";

/**
 * Shared presentation for a brand's `brand_type`, used by both BrandCard and
 * BrandDetails so the glyph, tint and label stay in sync.
 *
 * The six producer types are the six beverage types under another name
 * (a winery makes wine, a kura sake), so they take that type's glyph and
 * tint from `itemTypeTokens` — the Joy era gave them an unrelated palette
 * colour each. A restaurant chain keeps its pin; anything else is a
 * neutral business.
 */
const PRODUCER_TYPES: Readonly<Record<string, ApiItemType>> = {
  winery: "WINE",
  brewery: "BEER",
  distillery: "SPIRIT",
  kura: "SAKE",
  roastery: "COFFEE",
  tea_house: "TEA",
};

type BrandTypeLook = { glyph: AppIcon; className: string };

const brandTypeLook = (brandType: string): BrandTypeLook => {
  const itemType = PRODUCER_TYPES[brandType];
  if (itemType !== undefined) {
    const { glyph, tintClass, textClass } = itemTypeTokens[itemType];
    return { glyph, className: cn(tintClass, textClass) };
  }
  return {
    glyph: brandType === "restaurant_chain" ? Place : Business,
    className: "bg-surface-3 text-ink-2",
  };
};

export const formatBrandType = (brandType: string): string => {
  return brandType.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
};

/** The brand type as a chip: its glyph and its word on the type's tint. */
export function BrandTypeChip({
  brandType,
  size = "md",
  className,
  ...props
}: {
  brandType: string;
  /** `sm` on a card's art, `md` in the detail header. */
  size?: "sm" | "md";
} & ComponentProps<"span">) {
  const { glyph: Glyph, className: tone } = brandTypeLook(brandType);
  return (
    <span
      data-slot="brand-type-chip"
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full font-medium",
        size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-sm",
        tone,
        className,
      )}
      {...props}
    >
      <Glyph
        aria-hidden
        strokeWidth={ICON_STROKE}
        className={size === "sm" ? "size-3.5" : "size-4"}
      />
      {formatBrandType(brandType)}
    </span>
  );
}
