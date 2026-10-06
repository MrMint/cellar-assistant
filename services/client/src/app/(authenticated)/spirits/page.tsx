import { ItemTypeIndex } from "@/components/item/ItemTypeIndex";

/**
 * `/spirits` — new-only, kept (decision 2), restyled with restored components:
 * the viewer's favourite spirits as `ItemCard`s (`components/item/ItemTypeIndex.tsx`).
 */
export const dynamic = "force-dynamic";

export default function SpiritIndexPage() {
  return <ItemTypeIndex type="SPIRIT" />;
}
