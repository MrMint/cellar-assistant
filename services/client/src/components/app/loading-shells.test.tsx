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
const { CellarHomeShell } = await import("@/components/cellar/CellarHomeShell");
const { MapShell } = await import("@/components/map/core/MapShell");
const { PlaceDetailsShell } = await import(
  "@/components/map/places/PlaceDetailsShell"
);
const { SearchLandingShell } = await import(
  "@/components/search/SearchLandingShell"
);
const { MeHubShell, ME_SECTIONS } = await import("@/components/user/MeHub");
const { CaptureShell } = await import("@/components/capture/CaptureShell");

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
      ["cellar home", <CellarHomeShell key="ch" />],
      ["map", <MapShell key="m" />],
      ["me", <MeHubShell key="me" />],
      ["home", <SearchLandingShell key="s" />],
      ["place", <PlaceDetailsShell key="p" />],
      ["capture", <CaptureShell key="a" />],
    ] as const) {
      const out = html(node);
      assert.match(out, /data-loading-shell=""/, `${name} is a shell`);
      assert.doesNotMatch(out, SPINNER, `${name} shows no spinner`);
      assert.match(out, /data-slot="skeleton"/, `${name} has placeholders`);
    }
  });

  test("Capture (X06): a live Close over the camera and mode-row frames", () => {
    const out = html(<CaptureShell />);
    assert.match(out, /<button[^>]*aria-label="Close"/);
    assert.match(out, /aspect-\[3\/4\]/);
    assert.match(out, /Loading the camera…/);
  });

  test("Cellars: the bar's title and a live Add cellar link", () => {
    const out = html(<CellarsShell />);
    assert.match(out, />Cellars</);
    assert.match(out, /<a[^>]*href="\/cellars\/add"[^>]*>.*New cellar/);
    assert.equal(
      out.match(/overflow-hidden rounded-lg border border-line bg-card/g)
        ?.length,
      3,
    );
    // The page's Cellars | Bar segment (X11) and its Yours section title,
    // so the cards land where the shell drew them.
    assert.match(out, /data-slot="cellar-segments"/);
    assert.match(out, /<a[^>]*href="\/recipes"[^>]*>Your bar</);
    assert.match(out, />Yours</);
  });

  test("Cellar home (X04): the shelf with its Pour buttons, four tiles, the trend, then the grid", () => {
    const out = html(<CellarHomeShell />);
    assert.match(out, /Loading cellar…/);
    assert.equal(out.match(/flex w-34 shrink-0/g)?.length, 3);
    assert.equal(out.match(/h-24 rounded-lg/g)?.length, 4);
    assert.match(out, /h-40 rounded-lg/);
  });

  test("Map: the canvas surface and the search pill, no full-screen message", () => {
    const out = html(<MapShell />);
    assert.match(out, /data-slot="map-shell"/);
    assert.match(out, /bg-surface-1/);
    assert.match(out, />Search places</);
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
    assert.match(hero, /<h1 class="t-title[^"]*">Cork &amp; Barrel<\/h1>/);
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
