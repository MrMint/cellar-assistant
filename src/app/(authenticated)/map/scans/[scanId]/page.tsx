import { Box, CircularProgress, Typography } from "@mui/joy";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MenuScanResults } from "@/components/map/scanning/MenuScanResults";

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
    <Box
      sx={{
        height: "100vh",
        overflow: "auto",
        p: 2,
      }}
    >
      <Suspense
        fallback={
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "50vh",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <CircularProgress />
            <Typography>Loading scan results...</Typography>
          </Box>
        }
      >
        <MenuScanResults scanId={scanId} />
      </Suspense>
    </Box>
  );
}
