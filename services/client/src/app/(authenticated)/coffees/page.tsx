import { ItemTypeIndex } from "@/components/item/ItemTypeIndex";

/**
 * `/coffees` — new-only, kept (decision 2), restyled with restored components:
 * the viewer's favourite coffees as `ItemCard`s (`components/item/ItemTypeIndex.tsx`).
 */
export const dynamic = "force-dynamic";

export default function CoffeeIndexPage() {
  return <ItemTypeIndex type="COFFEE" />;
}
