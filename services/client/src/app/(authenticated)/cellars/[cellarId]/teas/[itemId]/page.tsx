import { CellarItemPage } from "@/components/item/CellarItemPage";

/**
 * `/cellars/[cellarId]/teas/[itemId]` — one bottle: `[itemId]` is the
 * `cellar_items.id` again (decision 1). The old `CellarTeaDetails`, restored
 * as the shared `CellarItemPage`; an item id redirects to its bottle.
 */
export const dynamic = "force-dynamic";

export default async function CellarTeaItemPage({
  params,
}: {
  params: Promise<{ itemId: string; cellarId: string }>;
}) {
  const { itemId, cellarId } = await params;
  return <CellarItemPage type="TEA" cellarId={cellarId} id={itemId} />;
}
