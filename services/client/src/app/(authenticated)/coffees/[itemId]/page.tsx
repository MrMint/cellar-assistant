import { ItemPage } from "@/components/item/ItemPage";

/**
 * `/coffees/[itemId]` — the old `CoffeeDetails` page, restored as the shared
 * `ItemPage` (`components/item/ItemPage.tsx`).
 */
export const dynamic = "force-dynamic";

export default async function CoffeeItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  return <ItemPage type="COFFEE" itemId={itemId} />;
}
