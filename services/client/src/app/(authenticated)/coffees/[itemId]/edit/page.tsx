import { ItemEditPage, itemEditMetadata } from "@/components/item/ItemEditPage";

/**
 * `/coffees/[itemId]/edit` — new-only, kept (decision 2), with the restored
 * form (`components/item/ItemForm.tsx`).
 */
export const dynamic = "force-dynamic";

export function generateMetadata({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  return params.then(({ itemId }) => itemEditMetadata("COFFEE", itemId));
}

export default async function EditCoffeePage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  return (
    <ItemEditPage
      type="COFFEE"
      itemId={itemId}
      backHref={`/coffees/${itemId}`}
    />
  );
}
