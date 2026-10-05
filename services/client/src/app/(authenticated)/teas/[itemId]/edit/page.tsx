import { ItemEditPage } from "@/components/item/ItemEditPage";

/**
 * `/teas/[itemId]/edit` — new-only, kept (decision 2), with the restored
 * form (`components/item/ItemForm.tsx`).
 */
export const dynamic = "force-dynamic";

export default async function EditTeaPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  return (
    <ItemEditPage type="TEA" itemId={itemId} backHref={`/teas/${itemId}`} />
  );
}
