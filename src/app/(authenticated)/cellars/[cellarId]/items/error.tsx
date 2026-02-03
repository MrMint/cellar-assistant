"use client";

import { Alert, Button, Stack, Typography } from "@mui/joy";
import { useEffect } from "react";
import { MdRefresh, MdWarning } from "react-icons/md";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function CellarItemsError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Cellar items error:", error);
  }, [error]);

  return (
    <Stack spacing={2} sx={{ p: 2 }}>
      <Alert
        variant="soft"
        color="danger"
        startDecorator={<MdWarning />}
        sx={{ alignItems: "flex-start" }}
      >
        <Stack spacing={1}>
          <Typography level="title-md">Failed to load cellar items</Typography>
          <Typography level="body-sm">
            There was a problem loading the items. Please try again.
          </Typography>
        </Stack>
      </Alert>
      <Button
        variant="outlined"
        color="neutral"
        startDecorator={<MdRefresh />}
        onClick={reset}
        sx={{ alignSelf: "flex-start" }}
      >
        Try again
      </Button>
    </Stack>
  );
}
