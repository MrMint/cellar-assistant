/**
 * The order of `runtimeCaching` decides which rule handles a request, so this
 * resolves real URLs through it the way serwist's router does: first match
 * wins, and a `RegExp` only accepts a cross-origin URL when it matches from
 * index 0 (`RegExpRoute`).
 *
 * `@serwist/turbopack/worker` builds `defaultCache` from `NODE_ENV` at import
 * time — outside production it is one catch-all `NetworkOnly` — so the module
 * is imported after setting `production`, which is how the worker is built.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { RuntimeCaching } from "serwist";

const ORIGIN = "https://cellar.example";

const previous = process.env.NODE_ENV;
process.env.NODE_ENV = "production";
const { runtimeCaching, MAP_TILES_CACHE, WASM_CACHE } = await import(
  "./runtime-caching"
);
process.env.NODE_ENV = previous;

const route = (
  href: string,
  init: { method?: string; mode?: RequestMode; headers?: HeadersInit } = {},
): RuntimeCaching | undefined => {
  const url = new URL(href, ORIGIN);
  const method = init.method ?? "GET";
  const sameOrigin = url.origin === ORIGIN;
  const request = {
    url: url.href,
    method,
    mode: init.mode ?? "cors",
    headers: new Headers(init.headers),
    destination: "",
  } as unknown as Request;
  return runtimeCaching.find((entry: RuntimeCaching) => {
    if ((entry.method ?? "GET") !== method) return false;
    const { matcher } = entry;
    if (matcher instanceof RegExp) {
      const result = matcher.exec(url.href);
      return result !== null && (sameOrigin || result.index === 0);
    }
    if (typeof matcher === "function") {
      return Boolean(
        matcher({
          url,
          request,
          sameOrigin,
          event: {} as ExtendableEvent,
        }),
      );
    }
    return false;
  });
};

const cacheName = (entry: RuntimeCaching | undefined): string | undefined =>
  (entry?.handler as { cacheName?: string } | undefined)?.cacheName;

const handlerName = (entry: RuntimeCaching | undefined): string | undefined =>
  (entry?.handler as object | undefined)?.constructor.name;

describe("runtimeCaching", () => {
  test("the production defaultCache is in play (the test is not vacuous)", () => {
    assert.ok(runtimeCaching.length > 10, String(runtimeCaching.length));
  });

  test("a page navigation goes to the network, never a cache", () => {
    assert.equal(
      handlerName(route("/cellars", { mode: "navigate" })),
      "NetworkOnly",
    );
  });

  test("the barcode reader's wasm is cached first, so scanning works offline", () => {
    assert.equal(cacheName(route("/zxing/zxing_reader.wasm")), WASM_CACHE);
  });

  test("CARTO styles and tiles reach the map-tile rule", () => {
    for (const href of [
      "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      "https://tiles.basemaps.cartocdn.com/vectortiles/carto.streets/v1/3/4/2.mvt",
    ]) {
      assert.equal(cacheName(route(href)), MAP_TILES_CACHE, href);
    }
  });

  test("a lookalike host is not a map tile", () => {
    assert.notEqual(
      cacheName(route("https://evil.example/basemaps.cartocdn.com/x.pbf")),
      MAP_TILES_CACHE,
    );
  });

  test("auth is never cached", () => {
    assert.equal(handlerName(route("/api/auth/get-session")), "NetworkOnly");
  });

  test("the GraphQL POST is not handled by any rule", () => {
    assert.equal(route("/api/graphql", { method: "POST" }), undefined);
  });

  test("the dead Nhost /v1 rules are gone from the worker", () => {
    const source = [
      readFileSync(
        fileURLToPath(new URL("./runtime-caching.ts", import.meta.url)),
        "utf8",
      ),
      readFileSync(
        fileURLToPath(new URL("../../app/sw.ts", import.meta.url)),
        "utf8",
      ),
    ].join("\n");
    assert.doesNotMatch(source, /\\\/v1\\\//);
  });
});
