import { ItemTypeIndex } from "@/components/item/ItemTypeIndex";

/**
 * `/sakes` — new-only, kept (decision 2), restyled with restored components:
 * the viewer's favourite sakes as `ItemCard`s (`components/item/ItemTypeIndex.tsx`).
 */
export const dynamic = "force-dynamic";

export default function SakeIndexPage() {
  return <ItemTypeIndex type="SAKE" />;
}
