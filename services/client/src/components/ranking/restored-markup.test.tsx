/**
 * Render tests for `/rankings` ("Top rated"): the scope control N15 put in
 * place of the old two toggles, and the restored type chips.
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
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/rankings",
  useSearchParams: () => new URLSearchParams('scope=friends&types=["WINE"]'),
}));

const { RankingsClient, RankNumeral } = await import("./RankingsClient");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = (node: ReactNode) =>
  stripStyleBlocks(
    renderToStaticMarkup(<Provider value={client}>{node}</Provider>),
  );

describe("RankingsClient", () => {
  test("Top rated, the labelled scope control from the URL, the type chips", () => {
    const html = render(<RankingsClient />);
    assert.match(html, /^(?:<[^>]+>)*Top rated</);
    assert.match(html, /role="radiogroup"[^>]*aria-label="Whose scores"/);
    const segments = [
      ...html.matchAll(/role="radio"[^>]*>(?:<[^>]+>)*([^<]+)</g),
    ].map((m) => m[1]);
    assert.deepEqual(segments, ["Me", "Friends", "Everyone"]);
    // `?scope=friends` reaches the control.
    assert.match(
      html,
      /aria-checked="true"[^>]*>(?:<[^>]+>)*Friends<|data-state="on"[^>]*>(?:<[^>]+>)*Friends</,
    );
    for (const type of ["Beer", "Wine", "Spirit", "Coffee", "Sake", "Tea"]) {
      assert.match(html, new RegExp(`aria-label="${type}"`));
    }
    assert.match(
      html,
      /aria-pressed="true"[^>]*aria-label="Wine"|aria-label="Wine"[^>]*aria-pressed="true"/,
    );
  });
});

describe("RankNumeral", () => {
  test("says Rank N to assistive tech; #1 in claret ink, the text-safe claret", () => {
    const first = renderToStaticMarkup(<RankNumeral rank={1} />);
    assert.match(first, /<span class="sr-only">Rank <\/span>1/);
    assert.match(first, /\btext-brand-ink\b/);
    // Claret itself is a fill: as text on the dark surfaces it fails AA.
    assert.doesNotMatch(first, /\btext-brand(?!-ink)\b/);
    const second = renderToStaticMarkup(<RankNumeral rank={2} />);
    assert.match(second, /\btext-ink-1\b/);
  });
});
