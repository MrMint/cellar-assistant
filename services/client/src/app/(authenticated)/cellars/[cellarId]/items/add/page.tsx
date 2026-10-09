import { PinnedCellarCapture } from "@/components/capture/PinnedCellarCapture";
import {
  type ApiItemType,
  ITEM_TYPES,
} from "@/components/cellar-api/itemTypes";

/**
 * `/cellars/[cellarId]/items/add` — the capture surface (X05) filing into
 * this cellar: one camera, the type defaulted to the last used. A viewer who
 * may not add here gets the old `AddItemClient` note instead
 * (`PinnedCellarCapture`).
 */
export const dynamic = "force-dynamic";

export default async function Add({
  params,
  searchParams,
}: {
  params: Promise<{ cellarId: string }>;
  searchParams: Promise<{
    draft?: string | string[];
    type?: string | string[];
  }>;
}) {
  const { cellarId } = await params;
  const { draft, type } = await searchParams;
  const explicit =
    typeof type === "string" &&
    (ITEM_TYPES as readonly string[]).includes(type);
  return (
    <PinnedCellarCapture
      cellarId={cellarId}
      type={explicit ? (type as ApiItemType) : "WINE"}
      typeExplicit={explicit}
      chooseType
      draft={draft}
    />
  );
}
