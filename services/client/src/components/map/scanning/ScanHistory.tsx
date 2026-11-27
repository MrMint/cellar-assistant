"use client";

/**
 * `82450ad1:src/components/map/scanning/ScanHistory.tsx`, restored.
 * `getUserScanHistory()` (a server action, errors swallowed into an empty
 * list) → `myMenuScans`, the viewer's own scans newest first, with "Load
 * more" past the first page. A failed scan shows the API's one-sentence
 * `processingError` under its chip (kept from D5).
 */

import { EmptyState } from "@/components/app/EmptyState";
import {
  Camera,
  ErrorIcon,
  Pending,
  Settings,
  Success,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { Timestamp } from "@/components/common/Timestamp";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { unwrapResult } from "@/lib/api/result";
import { pageOf } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { scanSummaryFrom } from "../adapter";
import { SCANS_PAGE_SIZE, ScanHistoryQuery } from "../queries";
import { ScanStatusBadge, type ScanTone } from "./ScanStatusBadge";

const getStatusIcon = (status: string) => {
  switch (status) {
    case "completed":
      return <Success aria-hidden />;
    case "processing":
      return <Settings aria-hidden />;
    case "failed":
      return <ErrorIcon aria-hidden />;
    default:
      return <Pending aria-hidden />;
  }
};

const getStatusTone = (status: string): ScanTone => {
  switch (status) {
    case "completed":
      return "success";
    case "processing":
      return "working";
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
};

export function ScanHistory() {
  const paged = usePagedConnection({
    query: ScanHistoryQuery,
    variables: (_args: null, after) => ({ first: SCANS_PAGE_SIZE, after }),
    select: (data) =>
      pageOf(unwrapResult(data?.myMenuScans, "MenuScanConnection"), (edge) =>
        scanSummaryFrom(edge.node),
      ),
    initial: null,
    initialArgs: null,
  });
  const scans = paged.rows;

  if (paged.failure) {
    return (
      <p
        role="alert"
        className="t-body rounded-md border border-destructive/60 px-4 py-3 text-danger"
      >
        {paged.failure.message}
      </p>
    );
  }

  if (paged.status === "resetting" && scans.length === 0) {
    return (
      <div className="flex justify-center p-8">
        <Spinner className="size-8 text-ink-2" />
      </div>
    );
  }

  if (scans.length === 0) {
    return (
      <div className="rounded-xl bg-surface-1">
        <EmptyState
          illustration={<Camera aria-hidden />}
          title="No menu scans yet"
          description="Visit a place and scan their menu to see results here."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-4">
        {scans.map((scan) => (
          <li
            key={scan.id}
            className="relative rounded-xl bg-surface-1 p-4 transition-colors duration-(--ca-dur-short) ease-standard hover:bg-surface-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/map/scans/${scan.id}`}
                  overlay
                  underline="none"
                  className="t-head text-ink"
                >
                  {scan.place?.name ?? "Unknown place"}
                </Link>
                {scan.scanned_at && (
                  <p className="t-cap text-ink-2">
                    <Timestamp iso={scan.scanned_at} precision="datetime" />
                  </p>
                )}
              </div>

              <ScanStatusBadge
                tone={getStatusTone(scan.processing_status)}
                icon={getStatusIcon(scan.processing_status)}
              >
                {scan.processing_status}
              </ScanStatusBadge>
            </div>

            <div className="mt-2 flex gap-4">
              {scan.items_detected != null && (
                <p className="t-cap tabular text-ink">
                  {scan.items_detected} items detected
                </p>
              )}
              {scan.confidence_score != null && (
                <p className="t-cap tabular text-ink">
                  {(scan.confidence_score * 100).toFixed(0)}% confidence
                </p>
              )}
            </div>
            {scan.processing_error && (
              <p className="t-cap mt-1 text-danger">
                {scan.processing_error}
              </p>
            )}
          </li>
        ))}
      </ul>
      {paged.hasNextPage && (
        <Button
          variant="outline"
          disabled={!paged.canLoadMore || paged.status === "loadingMore"}
          aria-busy={paged.status === "loadingMore"}
          onClick={() => void paged.loadMore()}
        >
          {paged.status === "loadingMore" && <Spinner />}
          Load more
        </Button>
      )}
    </div>
  );
}
