import { CellarItemEditPage } from "@/components/item/CellarItemEditPage";

/**
 * `/cellars/[cellarId]/coffees/[itemId]/edit` — the bottle's item, in the
 * restored form. `[itemId]` is the bottle (decision 1).
 */
export const dynamic = "force-dynamic";

export default async function EditCellarCoffeePage({
  params,
}: {
  params: Promise<{ itemId: string; cellarId: string }>;
}) {
  const { itemId, cellarId } = await params;
  return <CellarItemEditPage type="COFFEE" cellarId={cellarId} id={itemId} />;
}
