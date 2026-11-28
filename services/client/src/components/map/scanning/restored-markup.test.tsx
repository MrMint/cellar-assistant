/**
 * Render tests for the restored scan components, asserting the **old**
 * markup (`82450ad1:src/components/map/scanning/*`). Split out of
 * `map/restored-markup.test.tsx` so this directory's conversion owns its own
 * test.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";
import { stripStyleBlocks } from "@/test-support/markup";

mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/map/scans",
  useSearchParams: () => new URLSearchParams(),
}));

const { ScanHistory } = await import("./ScanHistory");
const { LOADING } = await import("../../../test-support/markup");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = (node: ReactNode) =>
  stripStyleBlocks(
    renderToStaticMarkup(<Provider value={client}>{node}</Provider>),
  );

describe("scans (restored)", () => {
  test("ScanHistory starts on the old spinner", () => {
    assert.match(render(<ScanHistory />), LOADING);
  });
});
