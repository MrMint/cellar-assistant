"use client";

import { Box, Card, CardContent, Typography } from "@mui/joy";

interface MenuScanResultsProps {
  scanId: string;
}

export function MenuScanResults({ scanId }: MenuScanResultsProps) {
  return (
    <Box sx={{ p: 2 }}>
      <Card>
        <CardContent>
          <Typography level="h3">Menu Scan Results</Typography>
          <Typography>Scan ID: {scanId}</Typography>
          <Typography sx={{ color: "text.secondary", mt: 2 }}>
            This component will display the results of a specific menu scan,
            including detected items and matching suggestions.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
