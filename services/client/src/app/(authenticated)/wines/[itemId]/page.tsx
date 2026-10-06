import { ItemPage } from "@/components/item/ItemPage";

/**
 * `/wines/[itemId]` — the old `WineDetails` page, restored as the shared
 * `ItemPage` (`components/item/ItemPage.tsx`).
 */
export const dynamic = "force-dynamic";

export default async function WineItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  return <ItemPage type="WINE" itemId={itemId} />;
}
