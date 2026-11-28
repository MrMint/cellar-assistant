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
  useQuery: () => [{ fetching: false }],
}));
mock.module("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/search",
}));

const { SearchSections } = await import("./SearchSections");
const { ADD_FRIEND_SETTLED, addFriendOutcome } = await import(
  "./AddFriendButton"
);
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
  label: "Drinks",
  rows: rows("Item", 8),
  total: 200,
  totalIsLowerBound: true,
};
const brands: Model = {
  section: "brands",
  label: "Brands",
  rows: rows("Brand", 2),
  total: 2,
  totalIsLowerBound: false,
};

describe("SearchSections", () => {
  test("three rows on a phone, six from md, See all, and real totals", () => {
    const html = renderToStaticMarkup(
      <SearchSections
        query="red"
        sections={[items, brands]}
        focus={null}
        semanticSearch={true}
      />,
    );
    const text = textOf(html);
    assert.match(text, /Drinks\s*200\+/);
    assert.match(text, /Brands\s*2/);
    assert.match(text, /Item 2/);
    // The fourth to sixth rows are there from md only; the seventh never.
    assert.match(
      html,
      /<li class="[^"]*max-md:hidden[^"]*"><div data-search-row="Item3"/,
    );
    assert.doesNotMatch(text, /Item 6/);
    assert.match(html, /href="\/search\?q=red&amp;in=items"/);
    // Two brands: nothing more to see.
    assert.doesNotMatch(html, /in=brands"[^>]*>See all/);
    assert.ok(
      html.indexOf('data-search-section="items"') <
        html.indexOf('data-search-section="brands"'),
    );
    assert.doesNotMatch(text, /names only/);
  });

  test("the scope chips: All lit, and each section that found something", () => {
    const html = renderToStaticMarkup(
      <SearchSections
        query="red"
        sections={[items, brands]}
        focus={null}
        semanticSearch={true}
      />,
    );
    const rail = html.slice(
      html.indexOf("data-search-scopes"),
      html.indexOf("</nav>"),
    );
    assert.match(rail, /aria-current="page"[^>]*>All</);
    assert.match(rail, /href="\/search\?q=red&amp;in=items"/);
    assert.match(rail, /href="\/search\?q=red&amp;in=brands"/);
    assert.doesNotMatch(rail, /in=places/);
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
    assert.match(textOf(html), /Matching names only/);
  });

  test("an opened section shows every row, its chip lit", () => {
    const html = renderToStaticMarkup(
      <SearchSections
        query="red"
        sections={[items, brands]}
        focus="items"
        semanticSearch={true}
      />,
    );
    const text = textOf(html);
    assert.match(text, /Item 7/);
    assert.doesNotMatch(text, /Brand 0/);
    assert.match(html, /aria-current="page"[^>]*>Drinks</);
    assert.match(html, /href="\/search\?q=red"/);
  });

  test("opened Places offers the map", () => {
    const html = renderToStaticMarkup(
      <SearchSections
        query="gin"
        sections={[
          {
            section: "places",
            label: "Places",
            rows: rows("Place", 1),
            total: 1,
            totalIsLowerBound: false,
          },
        ]}
        focus="places"
        semanticSearch={true}
      />,
    );
    assert.match(html, /href="\/map\?search=gin"[^>]*>Map</);
  });

  test("an opened section that found nothing says so, with Search all", () => {
    const html = renderToStaticMarkup(
      <SearchSections
        query="zzz"
        sections={[]}
        focus="people"
        semanticSearch={null}
      />,
    );
    assert.match(textOf(html), /No people match “zzz”/);
    assert.match(html, /href="\/search\?q=zzz"[^>]*>Search all</);
  });

  test("nothing anywhere is one empty state with one action (KIT wording)", () => {
    const html = renderToStaticMarkup(
      <SearchSections
        query="sotol"
        sections={[]}
        focus={null}
        semanticSearch={true}
      />,
    );
    const text = textOf(html);
    assert.match(text, /Nothing matches “sotol”/);
    assert.match(text, /Add “sotol”/);
    assert.match(html, /href="\/add\?name=sotol"/);
    assert.equal(html.match(/<a /g)?.length, 1);
  });

  test("when no search answered, it says so instead of 'Nothing matches'", () => {
    const html = renderToStaticMarkup(
      <SearchSections
        query="Copper Lantern"
        sections={[]}
        focus={null}
        semanticSearch={null}
        unanswered
      />,
    );
    const text = textOf(html);
    assert.match(text, /Search isn(?:'|&#x27;)t answering/);
    assert.doesNotMatch(text, /Nothing matches/);
    assert.match(text, /Try again/);
    assert.doesNotMatch(html, /href="\/add/);

    const opened = textOf(
      renderToStaticMarkup(
        <SearchSections
          query="zzz"
          sections={[]}
          focus="people"
          semanticSearch={null}
          unanswered
        />,
      ),
    );
    assert.match(opened, /Couldn(?:'|&#x27;)t search people/);
    assert.doesNotMatch(opened, /No people match/);
  });

  test("a section that failed while others answered gets one row", () => {
    const text = textOf(
      renderToStaticMarkup(
        <SearchSections
          query="red"
          sections={[brands]}
          focus={null}
          semanticSearch={true}
          failed={["places"]}
        />,
      ),
    );
    assert.match(text, /Couldn(?:'|&#x27;)t search places/);
    assert.match(text, /Try again/);
  });

  test("F-96: a failed section with nothing elsewhere is not 'Nothing matches'", () => {
    const html = renderToStaticMarkup(
      <SearchSections
        query="sotol"
        sections={[]}
        focus={null}
        semanticSearch={true}
        failed={["items"]}
      />,
    );
    const text = textOf(html);
    assert.match(text, /Couldn(?:'|&#x27;)t search drinks/);
    assert.match(text, /Try again/);
    assert.doesNotMatch(text, /Nothing matches/);
    assert.doesNotMatch(html, /href="\/add/);
  });

  test("F-99: See all says when it holds only the first rows of more", () => {
    const capped = textOf(
      renderToStaticMarkup(
        <SearchSections
          query="red"
          sections={[{ ...items, rows: rows("Item", 20) }]}
          focus="items"
          semanticSearch={true}
        />,
      ),
    );
    assert.match(capped, /first 20 of 200\+/);
    const whole = textOf(
      renderToStaticMarkup(
        <SearchSections
          query="red"
          sections={[brands]}
          focus="brands"
          semanticSearch={true}
        />,
      ),
    );
    assert.doesNotMatch(whole, /first \d+ of/);
  });

  test("people end in their action; a scored row shows its stars", () => {
    const html = renderToStaticMarkup(
      <SearchSections
        query="al"
        sections={[
          {
            section: "people",
            label: "People",
            total: 3,
            totalIsLowerBound: false,
            rows: [
              {
                key: "u1",
                title: "Alberta",
                thumb: { kind: "avatar", url: null, name: "Alberta" },
                person: {
                  userId: "u1",
                  name: "Alberta",
                  relation: "NONE",
                  requestId: null,
                },
              },
              {
                key: "u2",
                title: "Alonzo",
                thumb: { kind: "avatar", url: null, name: "Alonzo" },
                person: {
                  userId: "u2",
                  name: "Alonzo",
                  relation: "REQUEST_SENT",
                  requestId: "req-2",
                },
              },
              {
                key: "u3",
                title: "Alma",
                thumb: { kind: "avatar", url: null, name: "Alma" },
                person: {
                  userId: "u3",
                  name: "Alma",
                  relation: "REQUEST_RECEIVED",
                  requestId: "req-3",
                },
              },
            ],
          },
          {
            section: "items",
            label: "Drinks",
            total: 1,
            totalIsLowerBound: false,
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
    const text = textOf(html);
    assert.match(html, /aria-label="Add Alberta as a friend"/);
    assert.match(text, /Add friend/);
    assert.match(text, /Request sent/);
    assert.match(text, /Cancel request/);
    assert.match(text, /Wants to be friends/);
    assert.match(text, /Accept/);
    assert.match(text, /4\.5/);
  });
});

describe("addFriendOutcome", () => {
  test("sent, where things already stand, or a real failure", () => {
    assert.equal(addFriendOutcome({ ok: true }), "sent");
    assert.equal(
      addFriendOutcome({ ok: false, reason: "FRIEND_REQUEST_ALREADY_SENT" }),
      "already-sent",
    );
    assert.equal(
      addFriendOutcome({
        ok: false,
        reason: "FRIEND_REQUEST_ALREADY_RECEIVED",
      }),
      "already-received",
    );
    assert.equal(
      addFriendOutcome({ ok: false, reason: "ALREADY_FRIENDS" }),
      "already-friends",
    );
    assert.equal(addFriendOutcome({ ok: false, reason: null }), "failed");
  });

  test("a request they sent first, or a friendship, is not called Requested", () => {
    assert.equal(ADD_FRIEND_SETTLED.sent, "Requested");
    assert.equal(ADD_FRIEND_SETTLED["already-sent"], "Requested");
    assert.equal(ADD_FRIEND_SETTLED["already-received"], "Wants to be friends");
    assert.equal(ADD_FRIEND_SETTLED["already-friends"], "Friend");
  });
});

describe("searchPlaceGlyph (F-184)", () => {
  test("a coffee place gets the map list's kind glyph, not the plain pin", async () => {
    const { searchPlaceGlyph } = await import("./SearchSections");
    const { Place } = await import("@/components/app/icons");
    const { placeGlyph } = await import("@/components/map/core/PlaceFilters");
    assert.equal(
      searchPlaceGlyph({ description: "Coffee Shop · 0.4 km" }),
      placeGlyph({ primary_category: "coffee_shop", categories: [] }),
    );
    assert.notEqual(searchPlaceGlyph({ description: "Coffee Shop" }), Place);
    assert.equal(searchPlaceGlyph({}), Place);
  });
});
