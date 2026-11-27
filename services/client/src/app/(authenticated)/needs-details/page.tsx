import type { Metadata } from "next";
import { cellarParam, loadNeedsDetails } from "@/components/drafts/load";
import { NeedsDetailsScreen } from "@/components/drafts/NeedsDetailsScreen";

export const metadata: Metadata = { title: "Needs details" };
export const dynamic = "force-dynamic";

/**
 * `/needs-details` (K2; Capture-Place "To finish", CROSS-LOT "Needs
 * details"): the viewer's saved drafts of every kind. Home's row (H1) links
 * here; a cellar's count (C1) links with `?cellar=<id>`, which narrows the
 * list and its count to that cellar.
 */
export default async function NeedsDetailsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cellarId = cellarParam((await searchParams).cellar);
  const loaded = await loadNeedsDetails(cellarId);
  return (
    <NeedsDetailsScreen
      key={cellarId ?? "all"}
      cellar={loaded.cellar}
      count={loaded.count}
      drafts={loaded.drafts}
      endCursor={loaded.endCursor}
      failed={loaded.failed}
    />
  );
}
