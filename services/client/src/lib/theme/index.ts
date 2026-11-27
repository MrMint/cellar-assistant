/**
 * The theme setting (MC-theme, L9, L45): Dark, Light or Phone.
 *
 * - A `theme` cookie holds the choice (`dark | light | phone`; unset is
 *   Phone, the default for a new visitor).
 * - The server renders `<html data-theme>` from it (`readThemeChoice`,
 *   `themeAttribute`), and `THEME_SCRIPT`, inline at the top of `<head>`,
 *   re-reads the cookie before first paint for every choice, so the precached
 *   offline page follows the person's theme too. For Phone it resolves
 *   `prefers-color-scheme` and follows its changes.
 * - Client code reads and writes it with `useThemeChoice` /
 *   `useResolvedTheme` from `@/lib/theme/client`.
 *
 * `data-theme` is only ever `dark` or `light`; `data-theme-choice` carries the
 * choice itself.
 */
import { darkValues, light } from "@/lib/tokens";

export type ThemeChoice = "dark" | "light" | "phone";
export type ResolvedTheme = "dark" | "light";

export const THEME_COOKIE = "theme";
export const THEME_CHOICES: readonly ThemeChoice[] = ["dark", "light", "phone"];
/** One year, in seconds. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const DEFAULT_THEME_CHOICE: ThemeChoice = "phone";

/** The browser chrome colour for each theme (`viewport.themeColor`). */
export const THEME_COLOR: Readonly<Record<ResolvedTheme, string>> = {
  dark: darkValues.bg,
  light: light.bg,
};

export function parseThemeChoice(value: string | undefined): ThemeChoice {
  return (THEME_CHOICES as readonly string[]).includes(value ?? "")
    ? (value as ThemeChoice)
    : DEFAULT_THEME_CHOICE;
}

/** What `next/headers`' `cookies()` returns, as far as this needs it. */
export type CookieReader = {
  get(name: string): { value: string } | undefined;
};

/** The person's choice, from the request's cookies (server). */
export function readThemeChoice(cookies: CookieReader): ThemeChoice {
  return parseThemeChoice(cookies.get(THEME_COOKIE)?.value);
}

export function resolveTheme(
  choice: ThemeChoice,
  prefersLight: boolean,
): ResolvedTheme {
  if (choice === "phone") return prefersLight ? "light" : "dark";
  return choice;
}

/**
 * The `data-theme` the server renders. Phone cannot be resolved on the server,
 * so it renders dark and the pre-paint script corrects it before first paint.
 */
export function themeAttribute(choice: ThemeChoice): ResolvedTheme {
  return resolveTheme(choice, false);
}

/** `Set-Cookie`-shaped string the client writes (`document.cookie = …`). */
export function themeCookie(choice: ThemeChoice): string {
  return `${THEME_COOKIE}=${choice}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
}

/**
 * The pre-paint script's body. It is serialised with `toString()`, so it must
 * be self-contained: no imports, no closures over module scope.
 */
function prePaint(dark: string, lite: string): void {
  try {
    const d = document.documentElement;
    const q = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const m = /(?:^|;\s*)theme=(dark|light|phone)(?:;|$)/.exec(
        document.cookie,
      );
      const c = m ? m[1] : "phone";
      const t = c === "phone" ? (q.matches ? "light" : "dark") : c;
      d.setAttribute("data-theme-choice", c as string);
      d.setAttribute("data-theme", t as string);
      const metas = document.querySelectorAll('meta[name="theme-color"]');
      for (let i = 0; i < metas.length; i++)
        metas[i]?.setAttribute("content", t === "light" ? lite : dark);
    };
    apply();
    if (q.addEventListener) q.addEventListener("change", apply);
    document.addEventListener("DOMContentLoaded", apply);
  } catch (_) {
    // No cookie access or no matchMedia: the server's attribute stands.
  }
}

/** Inline in `<head>`, before any stylesheet paints. */
export const THEME_SCRIPT = `(${prePaint.toString()})(${JSON.stringify(
  THEME_COLOR.dark,
)},${JSON.stringify(THEME_COLOR.light)})`;
