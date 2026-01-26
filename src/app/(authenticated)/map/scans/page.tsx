import { Box, CircularProgress, Typography } from "@mui/joy";
import { Suspense } from "react";
import { ScanHistory } from "@/components/map/scanning/ScanHistory";

export default function ScanHistoryPage() {
  return (
    <Box
      sx={{
        height: "100vh",
        overflow: "auto",
        p: 2,
      }}
    >
      <Typography level="h2" sx={{ mb: 3 }}>
        Menu Scan History
      </Typography>

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
            <Typography>Loading scan history...</Typography>
          </Box>
        }
      >
        <ScanHistory />
      </Suspense>
    </Box>
  );
}
