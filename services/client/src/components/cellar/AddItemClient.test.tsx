/**
 * The Add an item chooser (AddItemClient), split from the cellar markup
 * tests so K1 owns it: server-rendered with `react-dom/server` the way the
 * first paint is. `next/image` is stubbed because bun imports a `.png` as a
 * path string.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";
import { stripStyleBlocks } from "@/test-support/markup";

mock.module("next/image", () => ({
  default: (props: { alt: string }) => (
    <span data-next-image="art" data-alt={props.alt} />
  ),
}));
mock.module("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, back: () => {} }),
  usePathname: () => "/cellars",
}));

const { AddItemClient } = await import("./AddItemClient");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = (node: ReactNode) =>
  stripStyleBlocks(
    renderToStaticMarkup(<Provider value={client}>{node}</Provider>),
  );

describe("AddItemClient (restored)", () => {
  const cards = (html: string) =>
    [...html.matchAll(/data-slot="type-plate"[^>]*>[\s\S]*?>(\w+)</g)].map(
      (m) => m[1],
    );

  // H-3 (L22): each card draws its type's vessel on its tint, no raster.
  test("heading, six type-plate cards in the old order, onboarding links", () => {
    const html = render(
      <AddItemClient cellarId="c1" cellarName="Basement" canAdd />,
    );
    assert.match(html, /<h2[^>]*>Add an item to Basement<\/h2>/);
    assert.deepEqual(cards(html), [
      "Wine",
      "Beer",
      "Spirit",
      "Coffee",
      "Sake",
      "Tea",
    ]);
    assert.equal([...html.matchAll(/data-slot="type-plate"/g)].length, 6);
    assert.doesNotMatch(html, /data-next-image="art"/);
    assert.match(
      html,
      /data-slot="type-plate" data-type="WINE"[^>]*>[\s\S]*?data-slot="vessel"/,
    );
    assert.match(html, /href="\/cellars\/c1\/wines\/add"/);
    assert.match(html, /href="\/cellars\/c1\/teas\/add"/);
    assert.doesNotMatch(html, /You do not have permission/);
  });

  test("without permission: the old note, and the cards do not link", () => {
    const html = render(
      <AddItemClient cellarId="c1" cellarName="Basement" canAdd={false} />,
    );
    assert.match(
      html,
      /You do not have permission to add items to this cellar\./,
    );
    // No card links to an add flow; the one link is back to the cellar home
    // (X04: `/items`, not the old overview's redirect).
    assert.doesNotMatch(html, /href="\/cellars\/c1\/[a-z]+\/add"/);
    assert.match(html, /href="\/cellars\/c1\/items"/);
  });

  test("off a cellar it is /add's chooser", () => {
    const html = render(<AddItemClient />);
    assert.match(html, /<h2[^>]*>Add an item<\/h2>/);
    assert.match(html, /href="\/add\/sakes"/);
  });
});
