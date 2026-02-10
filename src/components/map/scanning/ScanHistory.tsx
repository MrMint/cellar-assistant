"use client";

import {
  CheckCircle,
  Error as ErrorIcon,
  HourglassEmpty,
  PhotoCamera,
  Settings,
} from "@mui/icons-material";
import {
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/joy";
import NextLink from "next/link";
import { useEffect, useState } from "react";
import type { MenuScanSummary } from "@/app/actions/menuScanning";
import { getUserScanHistory } from "@/app/actions/menuScanning";

const getStatusIcon = (status: string) => {
  switch (status) {
    case "completed":
      return <CheckCircle fontSize="small" />;
    case "processing":
      return <Settings fontSize="small" />;
    case "failed":
      return <ErrorIcon fontSize="small" />;
    default:
      return <HourglassEmpty fontSize="small" />;
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
  const [scans, setScans] = useState<MenuScanSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getUserScanHistory();
        setScans(data);
      } catch {
        // Silently handle - empty state is shown
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
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
          <PhotoCamera sx={{ fontSize: 48, color: "text.secondary", mb: 2 }} />
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
                    {new Date(scan.scanned_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
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
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
