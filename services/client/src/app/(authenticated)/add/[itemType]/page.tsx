import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { itemTypeTokens } from "@/components/app/TypeChip";
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

/** X21: "Add a wine" — from the URL alone. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ itemType: string }>;
}): Promise<Metadata> {
  const type = itemTypeFromSegment((await params).itemType);
  return {
    title:
      type === null
        ? "Add a bottle"
        : `Add a ${itemTypeTokens[type].label.toLowerCase()}`,
  };
}

export default async function AddItemTypePage({
  params,
  searchParams,
}: {
  params: Promise<{ itemType: string }>;
  searchParams: Promise<{
    draft?: string | string[];
    cellar?: string | string[];
  }>;
}) {
  const { itemType } = await params;
  const { draft, cellar } = await searchParams;
  const type = itemTypeFromSegment(itemType);
  if (type === null) notFound();
  const cellars = await loadAddableCellars();

  return (
    <div className="mx-auto w-full max-w-[600px]">
      <ItemOnboarding
        type={type}
        cellars={cellars}
        resumeId={typeof draft === "string" ? draft : undefined}
        resumeCellarId={typeof cellar === "string" ? cellar : undefined}
        leading={<CaptureClose />}
      />
    </div>
  );
}
