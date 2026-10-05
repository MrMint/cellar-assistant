import { ItemEditPage } from "@/components/item/ItemEditPage";

/**
 * `/sakes/[itemId]/edit` — new-only, kept (decision 2), with the restored
 * form (`components/item/ItemForm.tsx`).
 */
export const dynamic = "force-dynamic";

export default async function EditSakePage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  return (
    <ItemEditPage type="SAKE" itemId={itemId} backHref={`/sakes/${itemId}`} />
  );
}
