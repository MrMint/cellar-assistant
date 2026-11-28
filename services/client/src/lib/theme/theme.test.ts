/**
 * The theme setting (MC-theme): the server's attribute from the cookie, and
 * the pre-paint script that settles it before first paint, for the cookie
 * unset, `dark`, `light` and `phone` (L9, L45).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { darkValues, light } from "@/lib/tokens";
import {
  parseThemeChoice,
  readThemeChoice,
  THEME_COLOR,
  THEME_SCRIPT,
  type ThemeChoice,
  themeCookie,
  themeHtmlProps,
} from "./index";

const jar = (value?: string) => ({
  get: (name: string) =>
    name === "theme" && value !== undefined ? { value } : undefined,
});

describe("readThemeChoice (server)", () => {
  test("unset is Phone, the default for a new visitor", () => {
    assert.equal(readThemeChoice(jar()), "phone");
  });
  test("each choice reads back", () => {
    for (const c of ["dark", "light", "phone"] as const)
      assert.equal(readThemeChoice(jar(c)), c);
  });
  test("anything else is Phone", () => {
    assert.equal(readThemeChoice(jar("sepia")), "phone");
    assert.equal(parseThemeChoice(""), "phone");
  });
  test("the server renders the choice, never data-theme (CA-1)", () => {
    // React owns every <html> attribute the layout renders and patches it on
    // each router.refresh(). Phone can't be resolved on the server, so a
    // server-rendered data-theme would overwrite the pre-paint value: Light
    // -> Phone (OS light) -> refresh went dark. data-theme is the script's
    // and setThemeChoice's alone.
    for (const choice of ["dark", "light", "phone"] as const) {
      const props = themeHtmlProps(choice);
      assert.deepEqual(props, { "data-theme-choice": choice });
      assert.equal("data-theme" in props, false);
    }
  });
  test("the cookie: one year, the whole site", () => {
    const c = themeCookie("light");
    assert.match(c, /^theme=light;/);
    assert.match(c, /path=\//);
    assert.match(c, /max-age=31536000/);
  });
  test("the chrome colours are the tokens' bg", () => {
    assert.equal(THEME_COLOR.dark, darkValues.bg);
    assert.equal(THEME_COLOR.light, light.bg);
  });
});

/** A document and window just big enough for the script. */
function fakePage(cookie: string, prefersLight: boolean) {
  const attrs = new Map<string, string>([["data-theme", "dark"]]);
  const meta = new Map<string, string>([["content", "unset"]]);
  const listeners: (() => void)[] = [];
  const query = {
    matches: prefersLight,
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
  };
  const document = {
    cookie,
    documentElement: {
      setAttribute: (k: string, v: string) => attrs.set(k, v),
    },
    querySelectorAll: () => [
      { setAttribute: (k: string, v: string) => meta.set(k, v) },
    ],
    addEventListener: () => {},
  };
  const window = { matchMedia: () => query };
  new Function("document", "window", THEME_SCRIPT)(document, window);
  return {
    theme: () => attrs.get("data-theme"),
    choice: () => attrs.get("data-theme-choice"),
    meta: () => meta.get("content"),
    osChanges(toLight: boolean) {
      query.matches = toLight;
      for (const fn of listeners) fn();
    },
    setCookie(value: string) {
      document.cookie = value;
    },
  };
}

describe("THEME_SCRIPT (pre-paint)", () => {
  const cases: [string, boolean, ThemeChoice, "dark" | "light"][] = [
    ["", false, "phone", "dark"],
    ["", true, "phone", "light"],
    ["theme=dark", true, "dark", "dark"],
    ["theme=light", false, "light", "light"],
    ["a=1; theme=phone; b=2", true, "phone", "light"],
    ["theme=phone", false, "phone", "dark"],
    ["xtheme=light", false, "phone", "dark"],
  ];
  for (const [cookie, os, choice, theme] of cases) {
    test(`cookie "${cookie}", OS ${os ? "light" : "dark"} → ${theme}`, () => {
      const page = fakePage(cookie, os);
      assert.equal(page.choice(), choice);
      assert.equal(page.theme(), theme);
      assert.equal(page.meta(), THEME_COLOR[theme]);
    });
  }

  test("Phone follows the OS when it changes; a fixed choice does not", () => {
    const phone = fakePage("theme=phone", false);
    phone.osChanges(true);
    assert.equal(phone.theme(), "light");
    const fixed = fakePage("theme=dark", false);
    fixed.osChanges(true);
    assert.equal(fixed.theme(), "dark");
  });

  test("the listener re-reads the cookie, so a new choice is followed", () => {
    const page = fakePage("theme=dark", false);
    page.setCookie("theme=phone");
    page.osChanges(true);
    assert.equal(page.theme(), "light");
  });

  test("a page with no cookie access does not throw (`:root` stays dark)", () => {
    assert.doesNotThrow(() =>
      new Function("document", "window", THEME_SCRIPT)({}, {}),
    );
  });
});

describe("the root layout wires it", () => {
  const layout = readFileSync(
    new URL("../../app/layout.tsx", import.meta.url),
    "utf8",
  );
  test("<html> carries the cookie's choice but no data-theme, and the script is first in <head>", () => {
    assert.match(layout, /readThemeChoice\(await cookies\(\)\)/);
    assert.match(layout, /\{\.\.\.themeHtmlProps\(choice\)\}/);
    assert.doesNotMatch(layout, /data-theme=/);
    assert.match(
      layout,
      /<head>\s*<script[\s\S]*?__html: THEME_SCRIPT[\s\S]*?\/>\s*<AppleSplashScreens/,
    );
  });
  test("Inter only", () => {
    assert.doesNotMatch(layout, /Fraunces/);
  });
});
