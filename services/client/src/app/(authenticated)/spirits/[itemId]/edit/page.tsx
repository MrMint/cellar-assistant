import { ItemEditPage } from "@/components/item/ItemEditPage";

/**
 * `/spirits/[itemId]/edit` — new-only, kept (decision 2), with the restored
 * form (`components/item/ItemForm.tsx`).
 */
export const dynamic = "force-dynamic";

export default async function EditSpiritPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  return (
    <ItemEditPage
      type="SPIRIT"
      itemId={itemId}
      backHref={`/spirits/${itemId}`}
    />
  );
}
