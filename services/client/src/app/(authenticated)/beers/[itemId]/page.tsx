import { ItemPage, itemPageMetadata } from "@/components/item/ItemPage";

/**
 * `/beers/[itemId]` — the old `BeerDetails` page, restored as the shared
 * `ItemPage` (`components/item/ItemPage.tsx`).
 */
export const dynamic = "force-dynamic";

export function generateMetadata({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  return params.then(({ itemId }) => itemPageMetadata("BEER", itemId));
}

export default async function BeerItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  return <ItemPage type="BEER" itemId={itemId} />;
}
