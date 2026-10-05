"use client";

/**
 * `82450ad1:src/components/map/scanning/ScanHistory.tsx`, restored.
 * `getUserScanHistory()` (a server action, errors swallowed into an empty
 * list) → `myMenuScans`, the viewer's own scans newest first, with "Load
 * more" past the first page. A failed scan shows the API's one-sentence
 * `processingError` under its chip (kept from D5).
 */

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/joy";
import NextLink from "next/link";
import {
  MdCheckCircle,
  MdError,
  MdHourglassEmpty,
  MdPhotoCamera,
  MdSettings,
} from "react-icons/md";
import { Timestamp } from "@/components/common/Timestamp";
import { unwrapResult } from "@/lib/api/result";
import { pageOf } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { scanSummaryFrom } from "../adapter";
import { SCANS_PAGE_SIZE, ScanHistoryQuery } from "../queries";

const getStatusIcon = (status: string) => {
  switch (status) {
    case "completed":
      return <MdCheckCircle size={20} />;
    case "processing":
      return <MdSettings size={20} />;
    case "failed":
      return <MdError size={20} />;
    default:
      return <MdHourglassEmpty size={20} />;
  }
};

const getStatusColor = (
  status: string,
): "success" | "warning" | "danger" | "neutral" => {
  switch (status) {
    case "completed":
      return "success";
    case "processing":
      return "warning";
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
    return <Alert color="danger">{paged.failure.message}</Alert>;
  }

  if (paged.status === "resetting" && scans.length === 0) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (scans.length === 0) {
    return (
      <Card>
        <CardContent sx={{ textAlign: "center", py: 6 }}>
          <MdPhotoCamera
            size={48}
            style={{
              color: "var(--joy-palette-text-secondary)",
              marginBottom: 16,
            }}
          />
          <Typography level="h4" sx={{ mb: 1 }}>
            No menu scans yet
          </Typography>
          <Typography level="body-md" sx={{ color: "text.secondary" }}>
            Visit a place and scan their menu to see results here.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Stack spacing={2}>
      {scans.map((scan) => (
        <Card
          key={scan.id}
          variant="outlined"
          component={NextLink}
          href={`/map/scans/${scan.id}`}
          sx={{
            textDecoration: "none",
            cursor: "pointer",
            transition: "border-color 0.2s",
            "&:hover": { borderColor: "primary.300" },
          }}
        >
          <CardContent>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="flex-start"
            >
              <Box>
                <Typography level="title-md">
                  {scan.place?.name ?? "Unknown place"}
                </Typography>
                {scan.scanned_at && (
                  <Typography level="body-xs" sx={{ color: "text.secondary" }}>
                    <Timestamp iso={scan.scanned_at} precision="datetime" />
                  </Typography>
                )}
              </Box>

              <Chip
                variant="soft"
                color={getStatusColor(scan.processing_status)}
                size="sm"
                startDecorator={getStatusIcon(scan.processing_status)}
              >
                {scan.processing_status}
              </Chip>
            </Stack>

            <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
              {scan.items_detected != null && (
                <Typography level="body-xs">
                  {scan.items_detected} items detected
                </Typography>
              )}
              {scan.confidence_score != null && (
                <Typography level="body-xs">
                  {(scan.confidence_score * 100).toFixed(0)}% confidence
                </Typography>
              )}
            </Stack>
            {scan.processing_error && (
              <Typography level="body-xs" color="danger" sx={{ mt: 0.5 }}>
                {scan.processing_error}
              </Typography>
            )}
          </CardContent>
        </Card>
      ))}
      {paged.hasNextPage && (
        <Button
          variant="outlined"
          color="neutral"
          loading={paged.status === "loadingMore"}
          disabled={!paged.canLoadMore}
          onClick={() => void paged.loadMore()}
        >
          Load more
        </Button>
      )}
    </Stack>
  );
}
