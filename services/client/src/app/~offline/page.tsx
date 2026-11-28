"use client";

import { useEffect } from "react";
import { ICON_STROKE, Offline } from "@/components/app/icons";
import { MainContent } from "@/components/app/main-content";
import { ShellMessage } from "@/components/shell/ShellMessage";
import { describeBoundaryError } from "@/components/shell/shell-copy";
import { Button } from "@/components/ui/button";
import { onceBackOnline } from "@/lib/pwa/connectivity";

/**
 * The service worker's fallback for a page it cannot fetch (`OFFLINE_PATH`).
 * It is precached, and public (`src/proxy.ts`), so it is the same page signed
 * in or out. Themed from the app's tokens like the rest of the app — it used
 * to carry its own hex colours — and it reloads by itself when the connection
 * returns, which is the moment the viewer would otherwise have to notice and
 * tap.
 */
export default function OfflinePage() {
  useEffect(() => onceBackOnline(window, () => window.location.reload()), []);

  return (
    <MainContent className="flex min-h-full flex-1">
      <ShellMessage
        // The same words as a page that failed offline (Shell-Entry, offline).
        copy={describeBoundaryError({ online: false })}
        icon={<Offline strokeWidth={ICON_STROKE} />}
        actions={
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try again
          </Button>
        }
      />
    </MainContent>
  );
}
