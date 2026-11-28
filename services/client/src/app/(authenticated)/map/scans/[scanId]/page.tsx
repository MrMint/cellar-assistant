import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MenuScanResults } from "@/components/map/scanning/MenuScanResults";
import { MenuLineSkeleton } from "@/components/map/scanning/ScanSteps";

export const metadata: Metadata = { title: "Menu scan" };

interface ScanDetailsPageProps {
  params: Promise<{
    scanId: string;
  }>;
}

/**
 * `/map/scans/[scanId]` — a menu scan's lines (Places-Menus). The shell's
 * `<main data-app-scroller>` scrolls this page and supplies its gutter (D26).
 */
export default async function ScanDetailsPage({
  params,
}: ScanDetailsPageProps) {
  const { scanId } = await params;

  if (!scanId) {
    notFound();
  }

  return (
    <Suspense fallback={<MenuLineSkeleton />}>
      <MenuScanResults scanId={scanId} />
    </Suspense>
  );
}
