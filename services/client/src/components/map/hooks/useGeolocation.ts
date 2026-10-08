"use client";

import { useSyncExternalStore } from "react";
import { setGeolocationCookie } from "@/lib/geo-cookie/client";
import { MAP_CONFIG } from "../config/constants";
import {
  createGeolocationStore,
  type GeolocationState,
  type GeolocationStore,
  INITIAL_GEOLOCATION_STATE,
  type PermissionLike,
} from "./geolocation-store";

/**
 * The map's geolocation (D14): React's view of `geolocation-store.ts`, which
 * holds the rules. Module-level, so it survives remounts and Suspense
 * re-suspensions without asking twice.
 */

const DISMISS_KEY = "cellar.map.location-preprompt-dismissed";

const browserStore = (): GeolocationStore =>
  createGeolocationStore({
    geolocation:
      typeof navigator !== "undefined" && navigator.geolocation
        ? navigator.geolocation
        : null,
    queryPermission: async () => {
      if (typeof navigator === "undefined" || !navigator.permissions?.query) {
        return null;
      }
      return (await navigator.permissions.query({
        name: "geolocation",
      })) as unknown as PermissionLike;
    },
    readDismissed: () => {
      try {
        return globalThis.sessionStorage?.getItem(DISMISS_KEY) === "1";
      } catch {
        return false;
      }
    },
    writeDismissed: () => {
      try {
        globalThis.sessionStorage?.setItem(DISMISS_KEY, "1");
      } catch {
        // Private mode or blocked storage: "Not now" lasts this page only.
      }
    },
    onFix: setGeolocationCookie,
    timeoutMs: MAP_CONFIG.TIMING.GEOLOCATION_TIMEOUT,
  });

let store: GeolocationStore | null = null;
const getStore = (): GeolocationStore => {
  store ??= browserStore();
  return store;
};

const SERVER_SNAPSHOT: GeolocationState = INITIAL_GEOLOCATION_STATE;

export function useGeolocation(): GeolocationState & {
  request: () => void;
  dismiss: () => void;
} {
  const current = getStore();
  const state = useSyncExternalStore(
    current.subscribe,
    current.getSnapshot,
    () => SERVER_SNAPSHOT,
  );
  return { ...state, request: current.request, dismiss: current.dismiss };
}
