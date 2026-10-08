import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MenuScanResults } from "@/components/map/scanning/MenuScanResults";
import { Spinner } from "@/components/ui/spinner";

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

  return (
    <div className="h-dvh overflow-auto p-4">
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
