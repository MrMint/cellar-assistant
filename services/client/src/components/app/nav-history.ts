"use client";

import * as nextNavigation from "next/navigation";
import { useEffect } from "react";

/**
 * In-app history, per tab session, so AppBar's Back can tell "there is a page
 * of ours behind this one" (`navigate.back()`) from "this is a cold open of a
 * deep link" (go to the declared parent instead of leaving the app — an iOS
 * standalone PWA has no browser Back to rescue the user).
 *
 * The record is a stack of pathnames in `sessionStorage`. A navigation to the
 * entry just below the top is treated as a pop (Back), anything else as a
 * push. It is a heuristic — it cannot see forward navigation or tell a link
 * to the previous page from Back, and it records a `navigate.replace` as a
 * push although the browser has no entry for the replaced page. That last
 * one would strand the user: after a cold-opened form replaces itself with
 * its result, the stack says "two pages", the browser has one, and
 * `navigate.back()` leaves the app (or does nothing in the standalone PWA).
 * So where the browser has the Navigation API (Chromium, Safari 26+), its
 * `canGoBack` — the real session history — can veto the stack.
 */

const KEY = "ca:nav-stack";
const LIMIT = 50;

/** The stack after visiting `path` (pure; exported for tests). */
export function nextNavStack(stack: readonly string[], path: string): string[] {
  if (stack.at(-1) === path) return [...stack];
  if (stack.at(-2) === path) return stack.slice(0, -1);
  return [...stack, path].slice(-LIMIT);
}

function read(): string[] {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((p): p is string => typeof p === "string")
      : [];
  } catch {
    return [];
  }
}

function write(stack: readonly string[]): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(stack));
  } catch {
    // Private mode or storage blocked: Back falls back to the parent href.
  }
}

/**
 * The stack as it stands (empty on the server or with storage blocked):
 * `RouteTransition` reads it on `popstate`, before the tracker records the
 * new path, to tell browser Back from Forward.
 */
export function readNavStack(): string[] {
  if (typeof window === "undefined") return [];
  return read();
}

/** Record one navigation (used by the tracker; exported for tests). */
export function recordNavigation(path: string): void {
  write(nextNavStack(read(), path));
}

/**
 * The page the person was on before they opened `path` — the nearest entry
 * below the top of the stack that is not `path` itself — or `null` on a cold
 * open. For a full-screen sheet with a URL of its own (`/search`, X10),
 * whose Close returns to where it was opened from however many queries were
 * typed inside it.
 */
export function previousPathOutside(path: string): string | null {
  if (typeof window === "undefined") return null;
  const stack = read();
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const entry = stack[index];
    if (entry !== undefined && entry !== path) return entry;
  }
  return null;
}

/** Whether an in-app page sits behind the current one. */
export function canGoBack(): boolean {
  if (typeof window === "undefined") return false;
  const navigation = (window as { navigation?: { canGoBack?: unknown } })
    .navigation;
  if (navigation?.canGoBack === false) return false;
  return read().length > 1;
}

/** Mount once inside the shell: records every pathname change. */
export function useNavHistoryTracker(): void {
  // Off the namespace: a test's partial `next/navigation` mock may lack it.
  const pathname = (
    nextNavigation as Partial<typeof nextNavigation>
  ).usePathname?.();
  useEffect(() => {
    if (pathname) recordNavigation(pathname);
  }, [pathname]);
}
