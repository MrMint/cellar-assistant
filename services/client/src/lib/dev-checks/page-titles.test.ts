/**
 * X21 · every route names itself.
 *
 * The root layout carries `title.template` ("%s · Cellar Assistant"), so a
 * page that exports no title of its own shows the bare default — the same
 * words in the browser tab, the app switcher, history and a screen reader's
 * "page loaded" announcement on every one of seventy-odd routes. That is the
 * state this guard found the app in: five pages had a title.
 *
 * Two rules, read from source (no Next runtime, no server):
 *
 * 1. Every `page.tsx` under `src/app` exports `metadata` or
 *    `generateMetadata` — or a `layout.tsx` in its own directory does (a
 *    client page cannot export metadata; `~offline` is one). A page that only
 *    redirects is listed in `RENDERS_NOTHING`, with why.
 * 2. No title under `src/app` (or the share pages' `metadata.ts`) spells out
 *    the suffix itself: the template adds it, so "Loved · Cellar Assistant"
 *    would read "Loved · Cellar Assistant · Cellar Assistant". A title that
 *    already names the app uses `{ absolute }`.
 *
 * Dynamic titles (an item's name, a cellar's) come from the same React
 * `cache()`d read the page renders from, so naming a page costs no request;
 * that is a code-review rule, not something this scan can see.
 *
 *   bun run --filter @cellar-assistant/client test
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { describe, test } from "node:test";
import { CLIENT_ROOT } from "./ui-platform";

const APP = join(CLIENT_ROOT, "src", "app");

/** Pages that never render, so have nothing to title. */
const RENDERS_NOTHING: Readonly<Record<string, string>> = {
  "src/app/page.tsx":
    "`/` only redirects, to /search or /sign-in (X01); the root layout's default covers the instant before",
};

const EXPORTS_METADATA =
  /^export\s+(?:const\s+metadata\b|(?:async\s+)?function\s+generateMetadata\b)/m;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const rel = (path: string) => relative(CLIENT_ROOT, path).split(sep).join("/");

const files = walk(APP);
const pages = files.filter((path) => path.endsWith(`${sep}page.tsx`));

const titled = (page: string): boolean => {
  if (EXPORTS_METADATA.test(readFileSync(page, "utf8"))) return true;
  const layout = join(dirname(page), "layout.tsx");
  return (
    existsSync(layout) && EXPORTS_METADATA.test(readFileSync(layout, "utf8"))
  );
};

describe("page titles (X21)", () => {
  test("the scan saw the app's pages", () => {
    assert.ok(pages.length > 60, `only ${pages.length} pages found`);
  });

  test("the root layout templates every title", () => {
    const layout = readFileSync(join(APP, "layout.tsx"), "utf8");
    assert.match(layout, /template:\s*"%s · Cellar Assistant"/);
  });

  test("every page exports a title (or only redirects)", () => {
    const untitled = pages
      .filter((page) => !titled(page))
      .map(rel)
      .filter((path) => !(path in RENDERS_NOTHING));
    assert.deepEqual(
      untitled,
      [],
      "export `metadata` (a fixed title) or `generateMetadata` (one from " +
        "the page's own cached read) from each of these; see this file's header",
    );
  });

  test("the redirect-only exemptions are still redirect-only pages", () => {
    for (const path of Object.keys(RENDERS_NOTHING)) {
      const source = readFileSync(join(CLIENT_ROOT, path), "utf8");
      assert.match(source, /\bredirect\(/, `${path} no longer just redirects`);
    }
  });

  test("no title spells out the suffix the template adds", () => {
    const sources = [
      ...files.filter((path) => /\.tsx?$/.test(path)),
      join(CLIENT_ROOT, "src", "components", "share", "metadata.ts"),
    ];
    const doubled = sources.flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .map((line, i) => ({ line, at: `${rel(path)}:${i + 1}` }))
        .filter(({ line }) =>
          /\btitle:\s*[`"'][^`"']*· (?:Cellar Assistant|\$\{SITE\})/.test(line),
        )
        .map(({ at }) => at),
    );
    assert.deepEqual(doubled, []);
  });
});
