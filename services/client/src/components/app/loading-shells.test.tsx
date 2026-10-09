/**
 * X24's loading shells, server-rendered as `loading.tsx` renders them: the
 * shell contract (`LoadingShell` / `ShellBlocks`), then each route's shell —
 * shaped like its page, its chrome real, its placeholders delayed, and no
 * spinner anywhere. Plus `TogglePop`'s first paint (no pop on mount).
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, prefetch: () => {} }),
  usePathname: () => "/cellars",
  useSearchParams: () => new URLSearchParams(),
}));

const { LoadingShell, ShellBlocks } = await import("./LoadingShell");
const { TogglePop } = await import("./TogglePop");
const { CellarsShell } = await import("@/components/cellar/CellarsShell");
const { MapShell } = await import("@/components/map/core/MapShell");
const { PlaceDetailsShell } = await import(
  "@/components/map/places/PlaceDetailsShell"
);
const { SearchLandingShell } = await import(
  "@/components/search/SearchLandingShell"
);
const { MeHubShell, ME_SECTIONS } = await import("@/components/user/MeHub");

const html = (node: ReactNode) => renderToStaticMarkup(node);
const SPINNER = /animate-spin|data-slot="spinner"/;

describe("LoadingShell / ShellBlocks", () => {
  test("a busy region with one status line; placeholders are decoration", () => {
    const out = html(
      <LoadingShell label="cellars">
        <p>Cellars</p>
        <ShellBlocks>
          <div>block</div>
        </ShellBlocks>
      </LoadingShell>,
    );
    assert.match(out, /^<div data-loading-shell="" aria-busy="true"/);
    assert.match(out, /<p role="status" class="sr-only">Loading cellars…<\/p>/);
    assert.match(out, /<p>Cellars<\/p>/, "chrome renders as itself");
    assert.match(
      out,
      /<div aria-hidden="true" data-slot="shell-blocks" class="skeleton-reveal">/,
    );
  });

  test("the reveal waits --ca-skeleton-delay (120 ms), then fades", () => {
    const css = readFileSync(
      fileURLToPath(new URL("../../app/globals.css", import.meta.url)),
      "utf8",
    );
    assert.match(css, /--ca-skeleton-delay:\s*120ms;/);
    assert.match(
      css,
      /@utility skeleton-reveal \{\s*animation: ca-fade-in var\(--ca-dur-short\) var\(--ca-ease-enter\)\s+var\(--ca-skeleton-delay\) both;/,
    );
  });
});

describe("the route shells", () => {
  test("every shell is a LoadingShell, with no spinner", () => {
    for (const [name, node] of [
      ["cellars", <CellarsShell key="c" />],
      ["map", <MapShell key="m" />],
      ["me", <MeHubShell key="me" />],
      ["home", <SearchLandingShell key="s" />],
      ["place", <PlaceDetailsShell key="p" />],
    ] as const) {
      const out = html(node);
      assert.match(out, /data-loading-shell=""/, `${name} is a shell`);
      assert.doesNotMatch(out, SPINNER, `${name} shows no spinner`);
      assert.match(out, /data-slot="skeleton"/, `${name} has placeholders`);
    }
  });

  test("Cellars: the bar's title and a live Add cellar link", () => {
    const out = html(<CellarsShell />);
    assert.match(out, />Cellars</);
    assert.match(out, /<a[^>]*href="\/cellars\/add"[^>]*>.*Add cellar/);
    assert.equal(out.match(/rounded-lg bg-surface-1 p-4/g)?.length, 5);
  });

  test("Map: the canvas surface and the search pill, no full-screen message", () => {
    const out = html(<MapShell />);
    assert.match(out, /data-slot="map-shell"/);
    assert.match(out, /bg-surface-1/);
    assert.match(out, />Search places\.\.\.</);
    assert.doesNotMatch(out, /Loading map/);
    const waiting = html(<MapShell status="Getting your location..." />);
    assert.match(waiting, />Getting your location\.\.\.</);
    // The location wait is what the status line says (it used to be the
    // pill's own role="status"), and the pill is not read a second time.
    assert.match(
      waiting,
      /<p role="status" class="sr-only">Getting your location\.\.\.<\/p>/,
    );
    assert.doesNotMatch(waiting, /Loading the map/);
    assert.match(waiting, /<p aria-hidden="true"[^>]*>Getting your location/);
  });

  test("Me: the hub's fixed rows are real links; the header is a placeholder", () => {
    const out = html(<MeHubShell />);
    for (const section of ME_SECTIONS) {
      for (const link of section.links) {
        assert.match(out, new RegExp(`href="${link.href}"`), link.label);
      }
    }
    assert.match(out, /href="\/users\/edit"/);
    assert.doesNotMatch(out, /<h1/, "no name until the viewer is known");
  });

  test("Home: the search box drawn, not live (the real one takes focus)", () => {
    const out = html(<SearchLandingShell />);
    assert.match(out, />Search</);
    assert.doesNotMatch(out, /<input/);
  });

  test("Place: placeholders, then the server-read hero outside the wait", () => {
    const bare = html(<PlaceDetailsShell />);
    assert.doesNotMatch(bare, /<h1/);
    assert.match(bare, /Loading the place…/);

    const hero = html(
      <PlaceDetailsShell hero={{ name: "Cork & Barrel", category: "bar" }} />,
    );
    assert.match(
      hero,
      /<h1 class="type-title-1 text-ink-1">Cork &amp; Barrel<\/h1>/,
    );
    assert.match(hero, /Loading Cork &amp; Barrel…/);
    // The hero is not behind the reveal delay: it is chrome, drawn before
    // the first (aria-hidden, delayed) block.
    assert.ok(
      hero.indexOf("<h1") < hero.indexOf('data-slot="shell-blocks"'),
      "the name is outside ShellBlocks",
    );
  });
});

describe("TogglePop", () => {
  test("first paint: no pop, at rest, the state on the wrapper", () => {
    const on = html(
      <TogglePop on>
        <svg />
      </TogglePop>,
    );
    assert.match(on, /data-slot="toggle-pop"/);
    assert.match(on, /data-state="on"/);
    assert.doesNotMatch(on, /scale\(1\.18\)/);
  });
});
