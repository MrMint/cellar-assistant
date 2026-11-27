/**
 * The og cards run on the server only, through satori, which calls every
 * function component itself. A component from a `"use client"` module is a
 * client reference there, and calling one throws ("Attempted to call the
 * default export of … Icon.mjs from the server"), so the card route answers
 * 200 with no body and the link shows no preview. That shipped once, with
 * lucide-react's icons in `og-cards.tsx`. This walks the cards' whole import
 * graph, packages included, and fails on any `"use client"` module.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../..", import.meta.url));

/**
 * What satori renders: the cards, and everything they import. The routes
 * also import helpers from the page views (`recipeFacts`,
 * `sharedItemSubtitle`), whose modules import icons for the pages; importing
 * those is harmless, since nothing there is called as a component.
 */
const ENTRIES = ["components/share/og-cards.tsx"];

/** Packages the routes need that cannot reach a client module: not walked. */
const SKIP = /^(next|react|react-dom|graphql|gql\.tada|urql|@urql\/|node:)/;

const IMPORT =
  /(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/g;

/** A bare package's ESM entry, as Next's bundler picks it (`module`). */
const packageEntry = (specifier: string, from: string): string | null => {
  const name = specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : (specifier.split("/")[0] ?? specifier);
  if (name !== specifier) return null;
  try {
    const manifest = Bun.resolveSync(`${name}/package.json`, dirname(from));
    const { module } = JSON.parse(readFileSync(manifest, "utf8")) as {
      module?: string;
    };
    return module === undefined ? null : join(dirname(manifest), module);
  } catch {
    return null;
  }
};

const resolve = (specifier: string, from: string): string | null => {
  const local = specifier.startsWith("@/") || specifier.startsWith(".");
  if (!local) {
    const entry = packageEntry(specifier, from);
    if (entry !== null) return entry;
  }
  const spec = specifier.startsWith("@/")
    ? `${SRC}${specifier.slice(2)}`
    : specifier;
  try {
    return Bun.resolveSync(spec, dirname(from));
  } catch {
    return null;
  }
};

const clientModules = (entry: string): string[] => {
  const seen = new Set<string>();
  const found: string[] = [];
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop() ?? "";
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.(m?[jt]sx?|cjs)$/.test(file)) continue;
    const source = readFileSync(file, "utf8");
    const head = source
      .replace(
        /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/|["']use strict["'];?|\s)*/,
        "",
      )
      .slice(0, 20);
    if (/^["']use client["']/.test(head)) {
      found.push(file.replace(SRC, "src/"));
      continue;
    }
    for (const match of source.matchAll(IMPORT)) {
      const specifier = match[1] ?? "";
      if (SKIP.test(specifier)) continue;
      const next = resolve(specifier, file);
      if (next !== null) stack.push(next);
    }
  }
  return found;
};

describe("the og cards import no client module", () => {
  for (const entry of ENTRIES) {
    test(entry, () => {
      assert.deepEqual(clientModules(`${SRC}${entry}`), []);
    });
  }
});
