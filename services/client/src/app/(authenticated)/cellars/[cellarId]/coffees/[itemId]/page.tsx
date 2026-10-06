import { CellarItemPage } from "@/components/item/CellarItemPage";

/**
 * `/cellars/[cellarId]/coffees/[itemId]` — one bottle: `[itemId]` is the
 * `cellar_items.id` again (decision 1). The old `CellarCoffeeDetails`, restored
 * as the shared `CellarItemPage`; an item id redirects to its bottle.
 */
export const dynamic = "force-dynamic";

export default async function CellarCoffeeItemPage({
  params,
}: {
  params: Promise<{ itemId: string; cellarId: string }>;
}) {
  const { itemId, cellarId } = await params;
  return <CellarItemPage type="COFFEE" cellarId={cellarId} id={itemId} />;
}
