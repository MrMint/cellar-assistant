"use client";

/**
 * The theme setting, client side (MC-theme). Both hooks read `<html>`, which
 * the server and the pre-paint script (`THEME_SCRIPT`) have already set, so
 * they never disagree with what is painted.
 */
import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_THEME_CHOICE,
  parseThemeChoice,
  type ResolvedTheme,
  resolveTheme,
  THEME_COLOR,
  type ThemeChoice,
  themeCookie,
} from "./index";

const LIGHT_QUERY = "(prefers-color-scheme: light)";

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-theme-choice"],
  });
  return () => observer.disconnect();
}

const readChoice = (): ThemeChoice =>
  parseThemeChoice(
    document.documentElement.getAttribute("data-theme-choice") ?? undefined,
  );

const readResolved = (): ResolvedTheme =>
  document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";

/** Write the choice and apply it to `<html>` at once. */
export function setThemeChoice(choice: ThemeChoice): void {
  // biome-ignore lint/suspicious/noDocumentCookie: the server reads this cookie; cookieStore is not in every browser this app supports.
  document.cookie = themeCookie(choice);
  const resolved = resolveTheme(choice, window.matchMedia(LIGHT_QUERY).matches);
  const html = document.documentElement;
  html.setAttribute("data-theme-choice", choice);
  html.setAttribute("data-theme", resolved);
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", THEME_COLOR[resolved]);
  });
}

/** The person's choice and a setter (writes the `theme` cookie for a year). */
export function useThemeChoice(): [ThemeChoice, (c: ThemeChoice) => void] {
  const choice = useSyncExternalStore(
    subscribe,
    readChoice,
    () => DEFAULT_THEME_CHOICE,
  );
  const set = useCallback((c: ThemeChoice) => setThemeChoice(c), []);
  return [choice, set];
}

/** The theme on screen now: Phone resolved against the OS. */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribe, readResolved, () => "dark");
}
