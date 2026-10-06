/**
 * Render tests for the restored rankings components, asserting the **old**
 * markup (`82450ad1:src/components/ranking/*`).
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";

mock.module("next/image", () => ({
  default: (props: { alt: string }) => (
    <span data-next-image="art" data-alt={props.alt} />
  ),
}));
mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/rankings",
  useSearchParams: () => new URLSearchParams('reviewers=["ME"]&types=["WINE"]'),
}));

const { RankingsFilter, RankingsFilterValue } = await import(
  "./RankingsFilter"
);
const { RankingsClient } = await import("./RankingsClient");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = (node: ReactNode) =>
  renderToStaticMarkup(<Provider value={client}>{node}</Provider>).replace(
    /<style[^>]*>[^<]*<\/style>/g,
    "",
  );

describe("RankingsFilter (restored)", () => {
  test("two toggles, Your Scores then Friends Scores, the pressed one marked", () => {
    const html = render(
      <RankingsFilter
        types={[RankingsFilterValue.ME]}
        onTypesChange={() => {}}
      />,
    );
    const labels = [...html.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(
      labels.filter((l) => l.endsWith("Scores")),
      ["Your Scores", "Friends Scores"],
    );
    assert.match(
      html,
      /aria-pressed="true"[^>]*aria-label="Your Scores"|aria-label="Your Scores"[^>]*aria-pressed="true"/,
    );
  });
});

describe("RankingsClient (restored)", () => {
  test("title, both filters from the URL, and the grid", () => {
    const html = render(<RankingsClient />);
    assert.match(html, /MuiTypography-title-lg[^>]*>Rankings</);
    assert.match(html, /aria-label="Friends Scores"/);
    for (const type of ["Beer", "Wine", "Spirit", "Coffee", "Sake", "Tea"]) {
      assert.match(html, new RegExp(`aria-label="${type}"`));
    }
    // The old URL state reaches the toggles.
    assert.match(
      html,
      /aria-pressed="true"[^>]*aria-label="Your Scores"|aria-label="Your Scores"[^>]*aria-pressed="true"/,
    );
    assert.match(
      html,
      /aria-pressed="true"[^>]*aria-label="Wine"|aria-label="Wine"[^>]*aria-pressed="true"/,
    );
  });
});
