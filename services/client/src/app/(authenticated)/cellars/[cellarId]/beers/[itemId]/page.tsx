import { CellarItemPage } from "@/components/item/CellarItemPage";

/**
 * `/cellars/[cellarId]/beers/[itemId]` — one bottle: `[itemId]` is the
 * `cellar_items.id` again (decision 1). The old `CellarBeerDetails`, restored
 * as the shared `CellarItemPage`; an item id redirects to its bottle.
 */
export const dynamic = "force-dynamic";

export default async function CellarBeerItemPage({
  params,
}: {
  params: Promise<{ itemId: string; cellarId: string }>;
}) {
  const { itemId, cellarId } = await params;
  return <CellarItemPage type="BEER" cellarId={cellarId} id={itemId} />;
}
