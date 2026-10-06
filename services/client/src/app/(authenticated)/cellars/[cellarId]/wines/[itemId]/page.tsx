import { CellarItemPage } from "@/components/item/CellarItemPage";

/**
 * `/cellars/[cellarId]/wines/[itemId]` — one bottle: `[itemId]` is the
 * `cellar_items.id` again (decision 1). The old `CellarWineDetails`, restored
 * as the shared `CellarItemPage`; an item id redirects to its bottle.
 */
export const dynamic = "force-dynamic";

export default async function CellarWineItemPage({
  params,
}: {
  params: Promise<{ itemId: string; cellarId: string }>;
}) {
  const { itemId, cellarId } = await params;
  return <CellarItemPage type="WINE" cellarId={cellarId} id={itemId} />;
}
