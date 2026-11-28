"use client";

import { useEffect, useRef } from "react";

/**
 * "Esc and back close what is on top" (KIT § 4): quick look, sheet, dialog,
 * popover, pane. Every open overlay registers here, in the order it opened;
 * the last one is on top.
 *
 * - **Back**: opening pushes one history entry at the same URL (Next's app
 *   router keeps its tree in entries pushed this way). Back pops it, and the
 *   popstate closes the top layer. Closing any other way takes the entry
 *   back off — but only while it is still the current one, so a sheet row
 *   that navigates never has its navigation undone.
 * - **Back is asynchronous** (F-167, F-136). A layer that opens while our own
 *   pop is still in flight (one sheet closing as the next opens: ⋯ → Edit)
 *   waits for that pop before it pushes, or the pop would land after the push
 *   and leave the new layer on the old one's entry. A change that must land
 *   on the page's own entry, not the closing layer's (Arrange writing
 *   `?sort=`), waits the same way: `afterHistorySettles`.
 * - **A navigation from inside a layer replaces the layer's entry** rather
 *   than stacking on it, so Back from the next page goes to the page the
 *   sheet was over, not to a dead copy of it.
 * - **Esc**: Radix and vaul close their own layers on Escape; a layer that
 *   is not one of theirs (`escape: true` — quick look, the desktop pane)
 *   closes on an Escape that reaches the app element (`useAppKeys`), and
 *   only when it is the top layer.
 */
type Layer = {
  readonly id: number;
  readonly close: () => void;
  readonly escape: boolean;
};

const STATE_KEY = "caOverlay";
const stack: Layer[] = [];
let nextId = 1;
/** Pops we caused ourselves (closing by other means), to be ignored. */
let ownPops = 0;
let listening = false;

/** Work waiting for our own pops to land (pushes, `afterHistorySettles`). */
let waiting: (() => void)[] = [];
/** Runs what waited, even if a pop we asked for never arrives. */
let settleTimer: ReturnType<typeof setTimeout> | undefined;
const SETTLE_FALLBACK_MS = 400;

const settle = (): void => {
  if (settleTimer !== undefined) clearTimeout(settleTimer);
  settleTimer = undefined;
  const run = waiting;
  waiting = [];
  for (const job of run) job();
};

/** Runs `job` once no pop of ours is in flight. */
const whenSettled = (job: () => void): void => {
  if (ownPops === 0) {
    job();
    return;
  }
  waiting.push(job);
  if (settleTimer === undefined) {
    settleTimer = setTimeout(() => {
      ownPops = 0;
      settle();
    }, SETTLE_FALLBACK_MS);
  }
};

const onPopState = (): void => {
  if (ownPops > 0) {
    ownPops -= 1;
    if (ownPops === 0) settle();
    return;
  }
  stack.at(-1)?.close();
};

const overlayIdOf = (state: unknown): unknown =>
  (state as Record<string, unknown> | null)?.[STATE_KEY];

const currentEntryIs = (id: number): boolean =>
  typeof window !== "undefined" && overlayIdOf(window.history.state) === id;

/** Our own pushes, which the push wrapper lets through as pushes. */
let pushingOwn = false;
let wrappedPush: History["pushState"] | undefined;

const pathnameOf = (url: string | URL | null | undefined): string | null => {
  if (url === null || url === undefined) return null;
  try {
    return new URL(String(url), window.location.href).pathname;
  } catch {
    return null;
  }
};

/**
 * Wraps `history.pushState` (again, if something replaced it since): a push
 * to another page while an overlay's entry is current replaces that entry.
 */
const wrapPush = (): void => {
  const history = window.history;
  if (history.pushState === wrappedPush) return;
  const push = history.pushState;
  const replace = history.replaceState;
  wrappedPush = function pushState(
    this: History,
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) {
    const leavesOverlay =
      !pushingOwn &&
      overlayIdOf(history.state) !== undefined &&
      pathnameOf(url) !== null &&
      pathnameOf(url) !== window.location.pathname;
    return (leavesOverlay ? replace : push).call(history, data, unused, url);
  };
  history.pushState = wrappedPush;
};

const listen = (): void => {
  if (typeof window === "undefined") return;
  wrapPush();
  if (listening) return;
  listening = true;
  window.addEventListener("popstate", onPopState);
};

/**
 * Runs `change` once the overlay that is closing has taken its entry back
 * off, so a URL change made as a sheet closes (Arrange's `?sort=`) lands on
 * the page's own entry instead of being popped with the sheet's (F-136).
 * Call it right after asking the overlay to close.
 */
export function afterHistorySettles(change: () => void): void {
  if (typeof window === "undefined") {
    change();
    return;
  }
  // The close's effect (and its Back) runs after this event's commit.
  setTimeout(() => whenSettled(change), 0);
}

/** The layer on top, if any. */
export const topLayer = (): Layer | undefined => stack.at(-1);

/** How many overlays are open (for tests and the keys handler). */
export const openLayers = (): number => stack.length;

/**
 * Closes the top layer that answers Escape itself. Returns whether one did.
 * A Radix/vaul layer on top answers its own Escape, so nothing happens here.
 */
export function closeTopOnEscape(): boolean {
  const top = stack.at(-1);
  if (top === undefined || !top.escape) return false;
  top.close();
  return true;
}

/**
 * Registers an overlay while `open`. `close` asks the owner to close it (its
 * `onOpenChange(false)`). `escape: true` for a layer Radix does not manage.
 */
export function useOverlayLayer(
  open: boolean,
  close: () => void,
  { escape: ownEscape = false }: { escape?: boolean } = {},
): void {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    listen();
    const id = nextId;
    nextId += 1;
    const layer: Layer = {
      id,
      close: () => closeRef.current(),
      escape: ownEscape,
    };
    stack.push(layer);
    let pushed = false;
    let closed = false;
    whenSettled(() => {
      if (closed) return;
      pushed = true;
      pushingOwn = true;
      try {
        window.history.pushState(
          { ...(window.history.state as object | null), [STATE_KEY]: id },
          "",
        );
      } finally {
        pushingOwn = false;
      }
    });
    return () => {
      closed = true;
      const index = stack.indexOf(layer);
      if (index !== -1) stack.splice(index, 1);
      if (pushed && currentEntryIs(id)) {
        ownPops += 1;
        window.history.back();
      }
    };
  }, [open, ownEscape]);
}

/** For tests: forget every layer. */
export function resetLayers(): void {
  stack.length = 0;
  ownPops = 0;
  waiting = [];
  if (settleTimer !== undefined) clearTimeout(settleTimer);
  settleTimer = undefined;
}
