import { ItemPage, itemPageMetadata } from "@/components/item/ItemPage";

/**
 * `/sakes/[itemId]` — the old `SakeDetails` page, restored as the shared
 * `ItemPage` (`components/item/ItemPage.tsx`).
 */
export const dynamic = "force-dynamic";

export function generateMetadata({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  return params.then(({ itemId }) => itemPageMetadata("SAKE", itemId));
}

export default async function SakeItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  return <ItemPage type="SAKE" itemId={itemId} />;
}
