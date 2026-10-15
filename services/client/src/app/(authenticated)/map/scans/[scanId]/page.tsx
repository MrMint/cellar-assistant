import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MenuScanResults } from "@/components/map/scanning/MenuScanResults";
import { Spinner } from "@/components/ui/spinner";

export const metadata: Metadata = { title: "Scan results" };

interface ScanDetailsPageProps {
  params: Promise<{
    scanId: string;
  }>;
}

export default async function ScanDetailsPage({
  params,
}: ScanDetailsPageProps) {
  const { scanId } = await params;

  if (!scanId) {
    notFound();
  }

  // The shell's `<main data-app-scroller>` scrolls this page (D26), so tab
  // re-tap reaches it; a `100dvh` box of its own was a second scroller,
  // taller than the space the tab bar leaves.
  return (
    <div className="p-4">
      <Suspense
        fallback={
          <div className="flex h-[50vh] flex-col items-center justify-center gap-4">
            <Spinner className="size-8 text-ink-2" />
            <p className="type-body">Loading scan results...</p>
          </div>
        }
      >
        <MenuScanResults scanId={scanId} />
      </Suspense>
    </div>
  );
}
