/**
 * The discoveries dashboard's restored markup (`82450ad1`). Split from
 * `map/restored-markup.test.tsx` so the map (P1) and the place pages (P2)
 * each own their tests.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";
import { LOADING, stripStyleBlocks } from "@/test-support/markup";
import { DiscoveryDashboard } from "./DiscoveryDashboard";

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});

describe("discoveries (restored)", () => {
  test("DiscoveryDashboard starts on the old spinner", () => {
    const html = stripStyleBlocks(
      renderToStaticMarkup(
        <Provider value={client}>
          <DiscoveryDashboard />
        </Provider>,
      ),
    );
    assert.match(html, LOADING);
  });
});
