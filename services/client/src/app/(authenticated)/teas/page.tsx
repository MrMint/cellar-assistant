import { ItemTypeIndex } from "@/components/item/ItemTypeIndex";

/**
 * `/teas` — new-only, kept (decision 2), restyled with restored components:
 * the viewer's favourite teas as `ItemCard`s (`components/item/ItemTypeIndex.tsx`).
 */
export const dynamic = "force-dynamic";

export default function TeaIndexPage() {
  return <ItemTypeIndex type="TEA" />;
}
