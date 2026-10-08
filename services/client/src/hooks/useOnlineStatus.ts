"use client";

import { useCallback, useSyncExternalStore } from "react";
import { subscribeToConnectivity } from "@/lib/pwa/connectivity";

/**
 * `navigator.onLine`, kept current. The server snapshot is `true`, so the
 * first client render agrees with the server's and the offline state appears
 * after hydration rather than as a mismatch.
 */
export function useOnlineStatus(): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => subscribeToConnectivity(window, onChange),
    [],
  );
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
