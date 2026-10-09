/**
 * X12 — universal search's markup: three rows a section with See all, the
 * opened section with its way back, one empty state for nothing at all, and
 * the line that says the deployment matches names only.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("urql", () => ({
  useMutation: () => [{ fetching: false }, async () => ({})],
}));
mock.module("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/search",
}));

const { SearchSections } = await import("./SearchSections");
const { addFriendOutcome } = await import("./AddFriendButton");
const { textOf } = await import("@/test-support/markup");

type Model = import("./universal-search").SectionModel;

const rows = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    key: `${prefix}${i}`,
    title: `${prefix} ${i}`,
    href: `/x/${prefix}${i}`,
    thumb: { kind: "icon" as const, icon: "brand" as const },
  }));

const items: Model = {
  section: "items",
  label: "Items",
  rows: rows("Item", 5),
  total: 5,
};
const brands: Model = {
  section: "brands",
  label: "Brands",
  rows: rows("Brand", 2),
  total: 2,
};

describe("SearchSections", () => {
  test("each section shows three rows, and See all only when it holds more", () => {
    const html = renderToStaticMarkup(
      <SearchSections
        query="red"
        sections={[items, brands]}
        focus={null}
        semanticSearch={true}
      />,
    );
    const text = textOf(html);
    assert.match(text, /Items/);
    assert.match(text, /Item 2/);
    assert.doesNotMatch(text, /Item 3/);
    assert.match(html, /href="\/search\?q=red&amp;in=items"/);
    // Two brands: nothing more to see.
    assert.doesNotMatch(html, /href="\/brands\?q=red"/);
    assert.ok(
      html.indexOf('data-search-section="items"') <
        html.indexOf('data-search-section="brands"'),
    );
    assert.doesNotMatch(text, /names only/);
  });

  test("says so when the deployment matches names only (D25)", () => {
    const html = renderToStaticMarkup(
      <SearchSections
        query="red"
        sections={[brands]}
        focus={null}
        semanticSearch={false}
      />,
    );
    assert.match(
      textOf(html),
      /Matching names only: search by meaning is off\./,
    );
  });

  test("an opened section shows every row, and the way back to all", () => {
    const html = renderToStaticMarkup(
      <SearchSections
        query="red"
        sections={[items, brands]}
        focus="items"
        semanticSearch={true}
      />,
    );
    const text = textOf(html);
    assert.match(text, /Items for “red”/);
    assert.match(text, /Item 4/);
    assert.doesNotMatch(text, /Brand 0/);
    assert.match(html, /href="\/search\?q=red"/);
    assert.match(text, /Add an item/);
  });

  test("an opened section that found nothing says so", () => {
    const html = renderToStaticMarkup(
      <SearchSections
        query="zzz"
        sections={[]}
        focus="people"
        semanticSearch={null}
      />,
    );
    assert.match(textOf(html), /No people for “zzz”\./);
  });

  test("nothing anywhere is one empty state with one action", () => {
    const html = renderToStaticMarkup(
      <SearchSections
        query="Copper Lantern"
        sections={[]}
        focus={null}
        semanticSearch={true}
      />,
    );
    const text = textOf(html);
    assert.match(text, /Nothing called “Copper Lantern” yet\./);
    assert.match(html, /href="\/add"/);
    assert.equal(html.match(/<a /g)?.length, 1);
  });

  test("a person you could ask ends in Add; a row with a score shows it", () => {
    const html = renderToStaticMarkup(
      <SearchSections
        query="al"
        sections={[
          {
            section: "people",
            label: "People",
            total: 1,
            rows: [
              {
                key: "u1",
                title: "Alberta",
                thumb: { kind: "avatar", url: null, name: "Alberta" },
                addFriend: { userId: "u1", name: "Alberta" },
              },
            ],
          },
          {
            section: "items",
            label: "Items",
            total: 1,
            rows: [
              {
                key: "w1",
                title: "Barolo",
                href: "/wines/w1",
                thumb: { kind: "item", itemType: "WINE" },
                score: 4.5,
              },
            ],
          },
        ]}
        focus={null}
        semanticSearch={true}
      />,
    );
    assert.match(html, /aria-label="Add Alberta as a friend"/);
    assert.match(html, /data-slot="score"/);
  });
});

describe("addFriendOutcome", () => {
  test("sent, already connected, or a real failure", () => {
    assert.equal(addFriendOutcome({ ok: true }), "sent");
    assert.equal(
      addFriendOutcome({ ok: false, reason: "FRIEND_REQUEST_ALREADY_SENT" }),
      "already",
    );
    assert.equal(
      addFriendOutcome({ ok: false, reason: "ALREADY_FRIENDS" }),
      "already",
    );
    assert.equal(addFriendOutcome({ ok: false, reason: null }), "failed");
  });
});
