"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * In-app history, per tab session, so AppBar's Back can tell "there is a page
 * of ours behind this one" (`router.back()`) from "this is a cold open of a
 * deep link" (go to the declared parent instead of leaving the app — an iOS
 * standalone PWA has no browser Back to rescue the user).
 *
 * The record is a stack of pathnames in `sessionStorage`. A navigation to the
 * entry just below the top is treated as a pop (Back), anything else as a
 * push. It is a heuristic — it cannot see forward navigation or tell a link
 * to the previous page from Back — but both mistakes only change *which*
 * in-app page Back lands on, never whether it leaves the app.
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

/** Record one navigation (used by the tracker; exported for tests). */
export function recordNavigation(path: string): void {
  write(nextNavStack(read(), path));
}

/** Whether an in-app page sits behind the current one. */
export function canGoBack(): boolean {
  return typeof window !== "undefined" && read().length > 1;
}

/** Mount once inside the shell: records every pathname change. */
export function useNavHistoryTracker(): void {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) recordNavigation(pathname);
  }, [pathname]);
}
