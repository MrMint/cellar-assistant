/**
 * The theme setting (MC-theme, L9, L45): Dark, Light or Phone.
 *
 * - A `theme` cookie holds the choice (`dark | light | phone`; unset is
 *   Phone, the default for a new visitor).
 * - The server renders `<html data-theme-choice>` from it (`readThemeChoice`,
 *   `themeHtmlProps`), and `THEME_SCRIPT`, inline at the top of `<head>`,
 *   sets `data-theme` from the cookie before first paint for every choice, so
 *   the precached offline page follows the person's theme too. For Phone it
 *   resolves `prefers-color-scheme` and follows its changes.
 * - The server never renders `data-theme` (CA-1). React patches every
 *   attribute it renders on each `router.refresh()`, and Phone can't be
 *   resolved on the server, so a server value overwrote the script's: Light,
 *   then Phone with the OS light, then any refresh, and the app went dark.
 *   Until the script runs, `:root` is the dark theme.
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
 * The theme attributes the server renders on `<html>`: the choice only. The
 * choice is exact on the server (it is the cookie) and `setThemeChoice` writes
 * the same value, so React's patch on a refresh is a no-op. `data-theme` is
 * left to the pre-paint script and `setThemeChoice`, which can see the OS.
 */
export function themeHtmlProps(choice: ThemeChoice): {
  "data-theme-choice": ThemeChoice;
} {
  return { "data-theme-choice": choice };
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
    // No cookie access or no matchMedia: `:root`'s dark theme stands.
  }
}

/** Inline in `<head>`, before any stylesheet paints. */
export const THEME_SCRIPT = `(${prePaint.toString()})(${JSON.stringify(
  THEME_COLOR.dark,
)},${JSON.stringify(THEME_COLOR.light)})`;
