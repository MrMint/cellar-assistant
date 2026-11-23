"use client";

import { useEffect, useState } from "react";
import { acquireWakeLock, wakeLockSupported } from "./wake-lock";

/**
 * ux-c L08: hold a screen wake lock while `active`. The browser drops it when
 * the tab is hidden, so it is asked for again each time the page comes back.
 * Returns whether this browser can keep the screen on at all, so the page
 * only promises it where it is true.
 */
export const useWakeLock = (active: boolean): boolean => {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(wakeLockSupported(globalThis.navigator));
  }, []);
  useEffect(() => {
    if (!active) return;
    let release: (() => Promise<void>) | null = null;
    let cancelled = false;
    const acquire = async () => {
      const next = await acquireWakeLock(globalThis.navigator);
      if (cancelled) {
        await next?.();
        return;
      }
      release = next;
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void release?.();
    };
  }, [active]);
  return supported;
};
