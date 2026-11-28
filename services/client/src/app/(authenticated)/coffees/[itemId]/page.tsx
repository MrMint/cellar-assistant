import { ItemPage, itemPageMetadata } from "@/components/item/ItemPage";

/**
 * `/coffees/[itemId]` — the old `CoffeeDetails` page, restored as the shared
 * `ItemPage` (`components/item/ItemPage.tsx`).
 */
export const dynamic = "force-dynamic";

export function generateMetadata({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  return params.then(({ itemId }) => itemPageMetadata("COFFEE", itemId));
}

export default async function CoffeeItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  return <ItemPage type="COFFEE" itemId={itemId} />;
}
