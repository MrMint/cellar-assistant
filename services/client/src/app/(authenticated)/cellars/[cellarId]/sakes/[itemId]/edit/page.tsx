import {
  CellarItemEditPage,
  cellarItemEditMetadata,
} from "@/components/item/CellarItemEditPage";

/**
 * `/cellars/[cellarId]/sakes/[itemId]/edit` — the bottle's item, in the
 * restored form. `[itemId]` is the bottle (decision 1).
 */
export const dynamic = "force-dynamic";

export function generateMetadata({
  params,
}: {
  params: Promise<{ itemId: string; cellarId: string }>;
}) {
  return params.then(({ cellarId, itemId }) =>
    cellarItemEditMetadata("SAKE", cellarId, itemId),
  );
}

export default async function EditCellarSakePage({
  params,
}: {
  params: Promise<{ itemId: string; cellarId: string }>;
}) {
  const { itemId, cellarId } = await params;
  return <CellarItemEditPage type="SAKE" cellarId={cellarId} id={itemId} />;
}
