"use client";

import { useEffect } from "react";
import { purgeUserCaches } from "@/lib/pwa/purge-caches";

/**
 * Clear the service worker's viewer-specific caches when a signed-out page
 * mounts — `/sign-in` and `/sign-up`, which only ever render for a browser
 * with no valid session (both redirect a signed-in viewer away on the server).
 *
 * The explicit sign-out in the tab bar purges too, but it is not the only way
 * a session ends: one that expires, or is revoked from another device, never
 * runs that code, and its pages stayed cached for whoever used the phone
 * next. Every such path ends on `/sign-in` (the proxy and the signed-in layout
 * both send it there), so this is where the purge cannot be missed.
 * `purgeUserCaches` never throws, and keeps the shared static caches.
 */
export function usePurgeUserCachesOnMount(): void {
  useEffect(() => {
    void purgeUserCaches();
  }, []);
}
