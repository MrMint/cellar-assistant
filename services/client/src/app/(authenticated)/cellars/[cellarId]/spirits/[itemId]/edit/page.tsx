import { CellarItemEditPage } from "@/components/item/CellarItemEditPage";

/**
 * `/cellars/[cellarId]/spirits/[itemId]/edit` — the bottle's item, in the
 * restored form. `[itemId]` is the bottle (decision 1).
 */
export const dynamic = "force-dynamic";

export default async function EditCellarSpiritPage({
  params,
}: {
  params: Promise<{ itemId: string; cellarId: string }>;
}) {
  const { itemId, cellarId } = await params;
  return <CellarItemEditPage type="SPIRIT" cellarId={cellarId} id={itemId} />;
}
