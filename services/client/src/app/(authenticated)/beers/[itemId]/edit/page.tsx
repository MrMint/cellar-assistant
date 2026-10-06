import { ItemEditPage } from "@/components/item/ItemEditPage";

/**
 * `/beers/[itemId]/edit` — new-only, kept (decision 2), with the restored
 * form (`components/item/ItemForm.tsx`).
 */
export const dynamic = "force-dynamic";

export default async function EditBeerPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  return (
    <ItemEditPage type="BEER" itemId={itemId} backHref={`/beers/${itemId}`} />
  );
}
