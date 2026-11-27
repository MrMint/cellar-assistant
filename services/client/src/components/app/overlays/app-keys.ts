"use client";

import { useEffect, useRef } from "react";
import { ADD_KEYS, CAPTURE_HREF, TABS } from "../nav";
import { closeTopOnEscape } from "./layers";

/**
 * The desktop keys (KIT § 3 Desktop), handled on the app element — never the
 * document (KIT amendments) — so a key typed into a field, a sheet or a
 * dialog never reaches them.
 *
 * The shell owns the global ones: Esc (close what is on top), `/` (search),
 * `?` (the keys), N (Add), M (Map) and the `G` chords (G C Cellars, G L
 * Lists, G O More, G M Me). A screen adds its own (J/K, Enter, 1–5, ⌫, T, F,
 * O on the cellar grid) with `useAppKey`, live while it is mounted; a
 * screen's key wins over the shell's.
 */
export type AppKeyHandler = (event: KeyboardEvent | AppKeyEvent) => void;

/** The parts of a keyboard event the handlers read (React's or the DOM's). */
export type AppKeyEvent = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
  preventDefault: () => void;
};

const screenKeys = new Map<string, AppKeyHandler[]>();

/** Registers a screen's key while the calling component is mounted. */
export function useAppKey(key: string, handler: AppKeyHandler): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const wrapped: AppKeyHandler = (event) => ref.current(event);
    const list = screenKeys.get(key) ?? [];
    list.push(wrapped);
    screenKeys.set(key, list);
    return () => {
      const now = screenKeys.get(key) ?? [];
      const index = now.indexOf(wrapped);
      if (index !== -1) now.splice(index, 1);
      if (now.length === 0) screenKeys.delete(key);
    };
  }, [key]);
}

/** Whether a key was typed somewhere text goes. */
export const isTyping = (target: EventTarget | null): boolean => {
  if (typeof Element === "undefined" || !(target instanceof Element)) {
    return false;
  }
  if (target.closest("input, textarea, select, [contenteditable='true']")) {
    return true;
  }
  return false;
};

/** Whether the key landed inside an open dialog (a sheet, a popover). */
const inDialog = (target: EventTarget | null): boolean =>
  typeof Element !== "undefined" &&
  target instanceof Element &&
  target.closest('[role="dialog"], [role="alertdialog"]') !== null;

/** Asks the More menu that is showing (rail or tab bar) to open: `G O`. */
export const OPEN_MORE_EVENT = "ca:open-more";

export type ShellKeyActions = {
  navigate: (href: string) => void;
  openKeys: () => void;
  openMore: () => void;
  focusSearch: () => boolean;
};

/** The second key of a `G` chord → where it goes (or More). */
const CHORDS: Record<string, string> = Object.fromEntries(
  TABS.filter((t) => t.keys.startsWith("G ")).map((t) => [
    t.keys.slice(2).toLowerCase(),
    t.href,
  ]),
);

/**
 * A key on the app element → the action, or nothing. Returns whether it was
 * handled (the caller then prevents the default). `pending` is the chord
 * state: `G` arms it, and the next key reads it.
 */
export function handleAppKey(
  event: AppKeyEvent,
  actions: ShellKeyActions,
  chord: { armed: boolean },
): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (event.key === "Escape") {
    chord.armed = false;
    return closeTopOnEscape();
  }
  if (isTyping(event.target) || inDialog(event.target)) return false;

  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (chord.armed) {
    chord.armed = false;
    if (key === "o") {
      actions.openMore();
      return true;
    }
    const href = CHORDS[key];
    if (href !== undefined) {
      actions.navigate(href);
      return true;
    }
    return false;
  }

  const own = screenKeys.get(key);
  if (own !== undefined && own.length > 0) {
    own.at(-1)?.(event);
    return true;
  }

  switch (key) {
    case "g":
      chord.armed = true;
      return true;
    case "/":
      if (!actions.focusSearch()) actions.navigate("/search");
      return true;
    case "?":
      actions.openKeys();
      return true;
    case ADD_KEYS.toLowerCase():
      actions.navigate(CAPTURE_HREF);
      return true;
    case "m":
      actions.navigate("/map");
      return true;
    default:
      return false;
  }
}

/** The keys dialog's rows (KIT § 3 Desktop, `kit-desktop-09-keys`). */
export const KEY_ROWS: readonly { keys: string; does: string }[] = [
  { keys: "J K", does: "Next, previous" },
  { keys: "Enter", does: "Open in the pane" },
  { keys: "Esc", does: "Close what is on top" },
  { keys: "1 5", does: "Rate, 1 to 5" },
  { keys: "⌫", does: "Clear my rating" },
  { keys: "/", does: "Search" },
  { keys: "T", does: "Tiles or rows" },
  { keys: "M", does: "Map" },
  { keys: "F", does: "Favourite" },
  { keys: "O", does: "Open the page" },
  { keys: "N", does: "Add" },
  { keys: "?", does: "Show the keys" },
];
