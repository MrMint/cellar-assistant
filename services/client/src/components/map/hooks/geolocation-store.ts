/**
 * The map's geolocation, as a framework-free store (D14).
 *
 * D14: ask for location **when the map opens**, but show the app's own
 * one-line reason first, and only then trigger the browser's prompt. So this
 * store no longer calls `getCurrentPosition` on its first subscriber, as the
 * restored map did (`ui-parity-decisions.md` decision 15). It asks the
 * Permissions API what the answer would be:
 *
 * - `granted` — the user said yes before: start watching at once, no prompt
 *   of ours and none of the browser's.
 * - `prompt` (or no Permissions API, as on older Safari) — the map opens
 *   without waiting, and {@link locationPrePromptVisible} says to show the
 *   one-line explanation. Its button calls {@link GeolocationStore.request},
 *   which is what triggers the browser's own prompt; "Not now" calls
 *   `dismiss` and is remembered for the session.
 * - `denied` — nothing is asked; the map opens where it would without a
 *   location, and the location button explains how to turn it back on.
 *
 * The browser prompt is only ever raised by a tap (ours, or the map's
 * location button), which is also what keeps a "no" from being spent before
 * the person knows why we asked.
 *
 * Everything that touches `navigator`, `sessionStorage` or the cookie comes
 * in through {@link GeolocationDeps}, so the rules are tested without a
 * browser (`geolocation-store.test.ts`). `useGeolocation` is the React half.
 */

export type GeoPermission =
  | "unknown"
  | "granted"
  | "prompt"
  | "denied"
  | "unsupported";

export interface GeolocationState {
  readonly location: { latitude: number; longitude: number } | null;
  /**
   * True while the map should hold off drawing for a position: the
   * permission is still being looked up, or a watch has started and no fix
   * or error has come back. Never true while we are waiting on the person.
   */
  readonly loading: boolean;
  readonly error: string | null;
  readonly permission: GeoPermission;
  /** Whether the browser has been asked for a position yet. */
  readonly requested: boolean;
  /** "Not now", this session. */
  readonly dismissed: boolean;
}

/** The slice of `PermissionStatus` this needs. */
export interface PermissionLike {
  readonly state: string;
  onchange: ((this: PermissionLike, ev: Event) => unknown) | null;
}

export interface GeolocationDeps {
  readonly geolocation: Pick<
    Geolocation,
    "getCurrentPosition" | "watchPosition"
  > | null;
  /** `navigator.permissions.query({ name: "geolocation" })`, or null. */
  readonly queryPermission: () => Promise<PermissionLike | null>;
  readonly readDismissed: () => boolean;
  readonly writeDismissed: () => void;
  readonly onFix: (latitude: number, longitude: number) => void;
  readonly timeoutMs: number;
}

/** Minimum coordinate change to trigger a state update (~11 meters). */
const COORDINATE_EPSILON = 0.0001;

export const INITIAL_GEOLOCATION_STATE: GeolocationState = {
  location: null,
  loading: true,
  error: null,
  permission: "unknown",
  requested: false,
  dismissed: false,
};

/** D14: show our one-line reason, with a button that raises the OS prompt. */
export function locationPrePromptVisible(state: GeolocationState): boolean {
  return state.permission === "prompt" && !state.requested && !state.dismissed;
}

/** What the map's location button should do without a position to fly to. */
export function locationButtonAction(
  state: GeolocationState,
): "request" | "explain-denied" | "unsupported" | "wait" {
  if (state.permission === "unsupported") return "unsupported";
  if (state.permission === "denied") return "explain-denied";
  if (state.requested) return "wait";
  return "request";
}

export const LOCATION_DENIED_MESSAGE =
  "Location is off for this site. Turn it on in your browser's settings to center the map on you.";

export function normalizePermission(state: string | undefined): GeoPermission {
  if (state === "granted" || state === "denied" || state === "prompt") {
    return state;
  }
  return "prompt";
}

export interface GeolocationStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): GeolocationState;
  /** Raise the browser's prompt (or just start watching, if already allowed). */
  request(): void;
  /** "Not now": hide the explanation for the rest of the session. */
  dismiss(): void;
}

export function createGeolocationStore(
  deps: GeolocationDeps,
): GeolocationStore {
  let state: GeolocationState = INITIAL_GEOLOCATION_STATE;
  let lastCoords: { latitude: number; longitude: number } | null = null;
  const listeners = new Set<() => void>();
  let initialized = false;

  const set = (patch: Partial<GeolocationState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => {
      listener();
    });
  };

  const handleSuccess = (position: GeolocationPosition) => {
    const { latitude, longitude } = position.coords;
    if (
      lastCoords &&
      Math.abs(lastCoords.latitude - latitude) < COORDINATE_EPSILON &&
      Math.abs(lastCoords.longitude - longitude) < COORDINATE_EPSILON
    ) {
      return;
    }
    lastCoords = { latitude, longitude };
    deps.onFix(latitude, longitude);
    set({
      location: { latitude, longitude },
      loading: false,
      error: null,
      permission: "granted",
    });
  };

  const handleError = (error: GeolocationPositionError) => {
    if (error.code === error.PERMISSION_DENIED) {
      set({
        location: null,
        loading: false,
        error: "Location access denied by user",
        permission: "denied",
      });
      return;
    }
    set({
      loading: false,
      error:
        error.code === error.POSITION_UNAVAILABLE
          ? "Location information unavailable"
          : error.code === error.TIMEOUT
            ? "Location request timed out"
            : "Unable to retrieve location",
    });
  };

  const watch = () => {
    const geo = deps.geolocation;
    if (geo === null || state.requested) return;
    set({ requested: true, loading: state.location === null });
    const options = {
      enableHighAccuracy: true,
      timeout: deps.timeoutMs,
      maximumAge: 300_000, // 5 minutes
    };
    geo.getCurrentPosition(handleSuccess, handleError, options);
    geo.watchPosition(handleSuccess, handleError, options);
  };

  const apply = (permission: GeoPermission) => {
    if (permission === "granted") {
      set({ permission });
      watch();
      return;
    }
    // Waiting on the person (or refused): the map must not wait with them.
    set({ permission, loading: state.requested && state.location === null });
  };

  const start = () => {
    if (initialized) return;
    initialized = true;
    if (deps.geolocation === null) {
      set({
        loading: false,
        permission: "unsupported",
        error: "Geolocation is not supported by this browser",
      });
      return;
    }
    set({ dismissed: deps.readDismissed() });
    deps
      .queryPermission()
      .then((status) => {
        if (status === null) {
          apply("prompt");
          return;
        }
        apply(normalizePermission(status.state));
        status.onchange = () => apply(normalizePermission(status.state));
      })
      .catch(() => apply("prompt"));
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      start();
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    request() {
      start();
      watch();
    },
    dismiss() {
      deps.writeDismissed();
      set({ dismissed: true });
    },
  };
}
