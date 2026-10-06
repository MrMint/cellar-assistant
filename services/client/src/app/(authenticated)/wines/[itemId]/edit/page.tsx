import { ItemEditPage } from "@/components/item/ItemEditPage";

/**
 * `/wines/[itemId]/edit` — new-only, kept (decision 2), with the restored
 * form (`components/item/ItemForm.tsx`).
 */
export const dynamic = "force-dynamic";

export default async function EditWinePage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  return (
    <ItemEditPage type="WINE" itemId={itemId} backHref={`/wines/${itemId}`} />
  );
}
