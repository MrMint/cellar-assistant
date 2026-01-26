"use client";

import { Box, Card, CardContent, Typography } from "@mui/joy";

export function ScanHistory() {
  return (
    <Box sx={{ p: 2 }}>
      <Card>
        <CardContent>
          <Typography level="h3">Menu Scan History</Typography>
          <Typography sx={{ color: "text.secondary", mt: 2 }}>
            This component will display the user's menu scanning history,
            including processed scans and detected items.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
