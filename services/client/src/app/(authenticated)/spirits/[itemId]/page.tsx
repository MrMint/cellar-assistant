import { ItemPage, itemPageMetadata } from "@/components/item/ItemPage";

/**
 * `/spirits/[itemId]` — the old `SpiritDetails` page, restored as the shared
 * `ItemPage` (`components/item/ItemPage.tsx`).
 */
export const dynamic = "force-dynamic";

export function generateMetadata({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  return params.then(({ itemId }) => itemPageMetadata("SPIRIT", itemId));
}

export default async function SpiritItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  return <ItemPage type="SPIRIT" itemId={itemId} />;
}
