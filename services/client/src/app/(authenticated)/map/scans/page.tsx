import type { Metadata } from "next";
import { Suspense } from "react";
import { ScanHistory } from "@/components/map/scanning/ScanHistory";
import { Spinner } from "@/components/ui/spinner";

export const metadata: Metadata = { title: "Menu scans" };

export default function ScanHistoryPage() {
  // The shell's `<main data-app-scroller>` scrolls this page (D26), so tab
  // re-tap reaches it; a `100dvh` box of its own was a second scroller,
  // taller than the space the tab bar leaves.
  return (
    <div className="p-4">
      <h1 className="type-title-1 mb-6">Menu Scan History</h1>

      <Suspense
        fallback={
          <div className="flex h-[50vh] flex-col items-center justify-center gap-4">
            <Spinner className="size-8 text-ink-2" />
            <p className="type-body">Loading scan history...</p>
          </div>
        }
      >
        <ScanHistory />
      </Suspense>
    </div>
  );
}
