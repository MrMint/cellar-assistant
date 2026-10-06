import { ItemTypeIndex } from "@/components/item/ItemTypeIndex";

/**
 * `/beers` — new-only, kept (decision 2), restyled with restored components:
 * the viewer's favourite beers as `ItemCard`s (`components/item/ItemTypeIndex.tsx`).
 */
export const dynamic = "force-dynamic";

export default function BeerIndexPage() {
  return <ItemTypeIndex type="BEER" />;
}
