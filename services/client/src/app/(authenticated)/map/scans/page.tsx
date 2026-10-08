import { Suspense } from "react";
import { ScanHistory } from "@/components/map/scanning/ScanHistory";
import { Spinner } from "@/components/ui/spinner";

export default function ScanHistoryPage() {
  return (
    <div className="h-dvh overflow-auto p-4">
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
