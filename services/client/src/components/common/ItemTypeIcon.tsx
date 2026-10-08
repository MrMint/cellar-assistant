import { TypeGlyph } from "@/components/app/TypeChip";
import type { ApiItemType as ItemTypeValue } from "@/components/cellar-api/itemTypes";

/**
 * The type's glyph, as before — now `TypeGlyph` (one glyph and one hue per
 * type, `app/TypeChip.tsx`), so every caller of this name moves with it.
 * Decorative: callers print the type's word beside it where it matters.
 */
export function ItemTypeIcon({ type }: { type: ItemTypeValue }) {
  return <TypeGlyph type={type} />;
}
