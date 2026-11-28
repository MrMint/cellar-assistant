import { ItemPage, itemPageMetadata } from "@/components/item/ItemPage";

/**
 * `/teas/[itemId]` — the old `TeaDetails` page, restored as the shared
 * `ItemPage` (`components/item/ItemPage.tsx`).
 */
export const dynamic = "force-dynamic";

export function generateMetadata({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  return params.then(({ itemId }) => itemPageMetadata("TEA", itemId));
}

export default async function TeaItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  return <ItemPage type="TEA" itemId={itemId} />;
}
