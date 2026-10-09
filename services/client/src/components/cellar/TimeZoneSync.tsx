"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { browserTimeZone, setTimeZoneCookie } from "@/lib/time-zone/client";

const REFRESHED_KEY = "ca-tz-refreshed";

/**
 * Tells the server which zone to cut months in (X04): when the zone the page
 * was rendered with is not the browser's — the first visit, or after moving —
 * it writes the `ca-tz` cookie and re-renders the page once. At most once a
 * session, so a browser that refuses cookies is not refreshed in a loop: it
 * keeps UTC months.
 */
export function TimeZoneSync({ renderedZone }: { renderedZone: string }) {
  const router = useRouter();
  useEffect(() => {
    const zone = browserTimeZone();
    if (zone === null || zone === renderedZone) return;
    setTimeZoneCookie(zone);
    try {
      if (sessionStorage.getItem(REFRESHED_KEY) === zone) return;
      sessionStorage.setItem(REFRESHED_KEY, zone);
    } catch {
      // No session storage (a locked-down browser): refresh anyway, once per
      // mount, which is all this effect can do.
    }
    router.refresh();
  }, [renderedZone, router]);
  return null;
}
