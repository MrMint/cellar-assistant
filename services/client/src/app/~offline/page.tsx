"use client";

import { useEffect } from "react";
import { ICON_STROKE, Offline, Refresh } from "@/components/app/icons";
import { mainContentProps } from "@/components/app/SkipLink";
import { ShellMessage } from "@/components/shell/ShellMessage";
import { OFFLINE_COPY } from "@/components/shell/shell-copy";
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
    <main {...mainContentProps} className="flex min-h-full flex-1 outline-none">
      <ShellMessage
        copy={OFFLINE_COPY}
        icon={<Offline strokeWidth={ICON_STROKE} />}
        actions={
          <Button onClick={() => window.location.reload()}>
            <Refresh aria-hidden strokeWidth={ICON_STROKE} />
            Try again
          </Button>
        }
      />
    </main>
  );
}
