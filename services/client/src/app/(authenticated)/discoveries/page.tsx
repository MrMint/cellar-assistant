import { Suspense } from "react";
import { Page } from "@/components/app/Page";
import { DiscoveryDashboard } from "@/components/map/discovery/DiscoveryDashboard";
import { Spinner } from "@/components/ui/spinner";

/** `82450ad1:src/app/(authenticated)/discoveries/page.tsx`, restored. */
export default function DiscoveriesPage() {
  return (
    // `Page`, not a scroller of its own: the shell's scroller is the one
    // element that scrolls (D26) and supplies the gutter.
    <Page>
      <h1 className="type-title-1 text-ink-1">Your Discoveries</h1>

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
    </Page>
  );
}
