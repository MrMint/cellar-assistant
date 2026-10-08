/**
 * The vendored shadcn layer: the local changes that must survive a
 * re-vendor (`bunx --bun shadcn@<pinned> add … --overwrite`), and the two
 * things the pinned CLI did that this repo reverts.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { Badge } from "./badge";
import { Button } from "./button";
import { buttonVariants } from "./button-variants";

const dir = fileURLToPath(new URL(".", import.meta.url));
const sources = readdirSync(dir)
  .filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."))
  .map((f) => ({ file: f, text: readFileSync(`${dir}/${f}`, "utf8") }));

describe("vendored ui/*", () => {
  test("cva exports live in directive-free *-variants modules", () => {
    for (const { file, text } of sources) {
      const exportsVariants = /export (const|\{)[^;]*\w+Variants\b/.test(text);
      if (!exportsVariants) continue;
      // Server components import these: a "use client" module would hand
      // them a client reference instead (client-boundary.test.ts).
      assert.doesNotMatch(text, /^["']use client["']/m, file);
    }
  });

  test("imports go through @/lib/utils, never the `cn` package or next-themes", () => {
    for (const { file, text } of sources) {
      assert.doesNotMatch(text, /from ["']cn["']/, file);
      assert.doesNotMatch(text, /from ["']next-themes["']/, file);
    }
  });

  test("an unchecked checkbox is outlined in ink-3, not the input fill", () => {
    // shadcn's border-input is surface-3 here: on a surface-2 row (the bulk
    // check-in picker) the box all but vanished, under WCAG 1.4.11's 3:1.
    // ink-3 on surface-2 is 5.6:1 (1.1:1 before).
    const text = sources.find((s) => s.file === "checkbox.tsx")?.text ?? "";
    assert.match(text, /border border-ink-3 /);
    assert.doesNotMatch(text, /border border-input /);
  });

  test("the default button is a 44 px brass action", () => {
    const html = renderToStaticMarkup(<Button>Save</Button>);
    assert.match(html, /data-slot="button"/);
    assert.match(html, /\bh-11\b/);
    assert.match(html, /\bbg-primary\b/);
    assert.match(html, /\btext-primary-foreground\b/);
    assert.match(html, /active:scale-97/);
  });

  test("destructive is danger text and outline, never a solid slab", () => {
    const classes = buttonVariants({ variant: "destructive" });
    assert.match(classes, /\btext-destructive\b/);
    assert.doesNotMatch(classes, /\bbg-destructive\b(?!\/)/);
    assert.doesNotMatch(classes, /text-white/);
    const badge = renderToStaticMarkup(
      <Badge variant="destructive">Gone</Badge>,
    );
    assert.doesNotMatch(badge, /text-white/);
  });

  test("icon buttons are 44 px too", () => {
    assert.match(buttonVariants({ size: "icon" }), /\bsize-11\b/);
  });
});
