import { ItemTypeIndex } from "@/components/item/ItemTypeIndex";

/**
 * `/wines` — new-only, kept (decision 2), restyled with restored components:
 * the viewer's favourite wines as `ItemCard`s (`components/item/ItemTypeIndex.tsx`).
 */
export const dynamic = "force-dynamic";

export default function WineIndexPage() {
  return <ItemTypeIndex type="WINE" />;
}
