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

const onPopState = (): void => {
  if (ownPops > 0) {
    ownPops -= 1;
    return;
  }
  stack.at(-1)?.close();
};

const listen = (): void => {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("popstate", onPopState);
};

const currentEntryIs = (id: number): boolean =>
  typeof window !== "undefined" &&
  (window.history.state as Record<string, unknown> | null)?.[STATE_KEY] === id;

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
    window.history.pushState(
      { ...(window.history.state as object | null), [STATE_KEY]: id },
      "",
    );
    return () => {
      const index = stack.indexOf(layer);
      if (index !== -1) stack.splice(index, 1);
      if (currentEntryIs(id)) {
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
}
