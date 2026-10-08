import { Suspense } from "react";
import { DiscoveryDashboard } from "@/components/map/discovery/DiscoveryDashboard";
import { Spinner } from "@/components/ui/spinner";

/** `82450ad1:src/app/(authenticated)/discoveries/page.tsx`, restored. */
export default function DiscoveriesPage() {
  return (
    <div className="h-dvh overflow-auto p-4">
      <h1 className="type-title-1 mb-6 text-ink-1">Your Discoveries</h1>

      <Suspense
        fallback={
          <div className="flex h-[50vh] flex-col items-center justify-center gap-4">
            <Spinner className="size-10 text-ink-2" />
            <p className="type-body text-ink-1">Loading discoveries...</p>
          </div>
        }
      >
        <DiscoveryDashboard />
      </Suspense>
    </div>
  );
}
