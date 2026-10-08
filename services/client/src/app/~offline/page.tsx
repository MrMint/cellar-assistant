"use client";

import { Box, Button } from "@mui/joy";
import { useEffect } from "react";
import { MdRefresh, MdWifiOff } from "react-icons/md";
import { ShellMessage } from "@/components/shell/ShellMessage";
import { OFFLINE_COPY } from "@/components/shell/shell-copy";
import { onceBackOnline } from "@/lib/pwa/connectivity";

/**
 * The service worker's fallback for a page it cannot fetch (`OFFLINE_PATH`).
 * It is precached, and public (`src/proxy.ts`), so it is the same page signed
 * in or out. Themed through Joy like the rest of the app — it used to carry
 * its own hex colours — and it reloads by itself when the connection returns,
 * which is the moment the viewer would otherwise have to notice and tap.
 */
export default function OfflinePage() {
  useEffect(() => onceBackOnline(window, () => window.location.reload()), []);

  return (
    <Box sx={{ display: "flex", flexGrow: 1, minHeight: "100%" }}>
      <ShellMessage
        copy={OFFLINE_COPY}
        icon={<MdWifiOff />}
        actions={
          <Button
            startDecorator={<MdRefresh />}
            onClick={() => window.location.reload()}
          >
            Try again
          </Button>
        }
      />
    </Box>
  );
}
