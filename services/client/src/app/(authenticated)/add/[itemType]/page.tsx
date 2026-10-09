import { notFound } from "next/navigation";
import { loadAddableCellars } from "@/components/capture/addable-cellars";
import { CaptureClose } from "@/components/capture/CaptureChrome";
import { ItemOnboarding } from "@/components/common/OnboardingWizard/ItemOnboarding";
import { itemTypeFromSegment } from "@/components/item-api/itemTypes";

/**
 * `/add/[itemType]` — the capture surface with the type fixed by the route
 * (`wines`); any other value is a 404, as before. No cellar is pinned, so
 * the draft card's "Into" row defaults to the last used (X05).
 */
export const dynamic = "force-dynamic";

export default async function AddItemTypePage({
  params,
  searchParams,
}: {
  params: Promise<{ itemType: string }>;
  searchParams: Promise<{ draft?: string | string[] }>;
}) {
  const { itemType } = await params;
  const { draft } = await searchParams;
  const type = itemTypeFromSegment(itemType);
  if (type === null) notFound();
  const cellars = await loadAddableCellars();

  return (
    <div className="mx-auto w-full max-w-[600px]">
      <ItemOnboarding
        type={type}
        cellars={cellars}
        resumeId={typeof draft === "string" ? draft : undefined}
        leading={<CaptureClose />}
      />
    </div>
  );
}
