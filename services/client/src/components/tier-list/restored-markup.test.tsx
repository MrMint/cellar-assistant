/**
 * Render tests for the restored tier-list components, asserting the **old**
 * markup (`82450ad1:src/components/tier-list/*`).
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";
import { TooltipProvider } from "@/components/ui/tooltip";
import { stripStyleBlocks } from "@/test-support/markup";

mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/tier-lists/tl-1",
  useSearchParams: () => new URLSearchParams(),
}));
mock.module("nuqs", () => ({
  parseAsStringLiteral: () => ({ withDefault: (value: string) => value }),
  useQueryState: (key: string) => [key === "tab" ? "rankings" : null, () => {}],
}));

const { TierListView } = await import("./TierListView");
const { TierListViewPage } = await import("./TierListViewPage");
const { CandidateRow } = await import("./AddEntryModal");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
// `TooltipProvider` stands in for the app's own (`AppClientProviders`).
const render = (node: ReactNode) =>
  stripStyleBlocks(
    renderToStaticMarkup(
      <Provider value={client}>
        <TooltipProvider>{node}</TooltipProvider>
      </Provider>,
    ),
  );

const items = Array.from({ length: 12 }, (_, i) => ({
  id: `row-${i}`,
  band: i < 11 ? 5 : 0,
  position: i,
  name: `Entry ${i + 1}`,
  subtitle: i === 0 ? "Wine Bar · Austin · US" : "",
  href: `/places/p-${i}`,
  ownerScore: i === 0 ? 4 : null,
  viewerScore: i === 0 ? 4 : i === 1 ? 2.5 : null,
  publicRating: i === 0 ? 4.6 : null,
  publicRatingCount: i === 0 ? 1234 : null,
}));

const data = {
  id: "tl-1",
  name: "Best Bars",
  description: "Where to go",
  privacy: "FRIENDS",
  listType: "place",
  isOwner: true,
  createdById: "me",
  itemCount: items.length,
  items,
  history: null,
};

describe("TierListView (rows and scrubber)", () => {
  test("arranging: every band drawn, Unrated when used, the owner's #1 crowned, handles named", () => {
    const html = render(
      <TierListView tierListId="tl-1" items={items} isOwner arranging />,
    );
    // Bands never collapse: the empty ones say so.
    for (const label of [
      "Outstanding",
      "Very Good",
      "Good",
      "Mediocre",
      "Bad",
    ]) {
      assert.match(html, new RegExp(`<h3[^>]*>${label}</h3>`));
    }
    assert.match(html, />Nothing in Very Good yet</);
    // Unrated: drawn because something sits in it.
    assert.match(html, /<h3[^>]*>Unrated<\/h3>/);
    assert.match(html, />11 · #1–11</);
    // One crown, on the owner's #1; every row's chip says its rank.
    assert.equal(html.match(/data-slot="crown"/g)?.length, 1);
    assert.match(html, />#11<[\s\S]*?, Outstanding/);
    assert.match(html, />4\.6/);
    assert.match(html, /<button[^>]*aria-label="Reorder Entry 1"/);
    // Removal lives in the band sheet, not on the row.
    assert.doesNotMatch(html, /aria-label="Remove /);
    // Arranging, a row is not a link: a stray tap must not navigate away.
    assert.doesNotMatch(html, /href="\/places\/p-0"/);
    // The dock: pick, move, Done.
    assert.match(html, />Tap a row to move it</);
    assert.match(html, /aria-label="Move up"/);
    assert.match(html, />Move to band…</);
    // The scrubber, left of the rows.
    assert.match(html, /data-slot="scrubber"[\s\S]*data-slot="band-bar"/);
  });

  test("read-only by default — the owner's too — and every row opens its entry", () => {
    for (const html of [
      render(<TierListView tierListId="tl-1" items={items} isOwner />),
      render(<TierListView tierListId="tl-1" items={items} isOwner={false} />),
      // Arrange is the owner's: a non-owner asking for it gets none.
      render(
        <TierListView
          tierListId="tl-1"
          items={items}
          isOwner={false}
          arranging
        />,
      ),
    ]) {
      assert.doesNotMatch(html, /aria-label="(Remove|Reorder) /);
      assert.doesNotMatch(html, /aria-label="Move up"/);
      assert.doesNotMatch(html, /aria-roledescription="sortable"/);
      assert.match(html, /href="\/places\/p-0"[^>]*>Entry 1</);
    }
  });

  test("CROSS-LOT 1: on someone else's list no crown, and the viewer's own score rides in the where line", () => {
    const friend = render(
      <TierListView tierListId="tl-1" items={items} isOwner={false} />,
    );
    assert.doesNotMatch(friend, /data-slot="crown"/);
    assert.match(friend, />You 2\.5</);
    // On your own list your score is the owner's: no You.
    const own = render(
      <TierListView tierListId="tl-1" items={items} isOwner />,
    );
    assert.doesNotMatch(own, />You \d/);
  });

  test("search and Show only narrow the rows; no match says so and offers Clear", () => {
    const one = render(
      <TierListView tierListId="tl-1" items={items} isOwner query="entry 12" />,
    );
    assert.match(one, />Entry 12</);
    assert.doesNotMatch(one, />Entry 1</);
    // Ranks survive the filter.
    assert.match(one, /<h3[^>]*>Unrated<\/h3>/);
    const none = render(
      <TierListView
        tierListId="tl-1"
        items={items}
        isOwner
        query="zzz"
        onClearSearch={() => {}}
      />,
    );
    assert.match(none, /No place matches “zzz”/);
    assert.match(none, />Clear search</);
    const onlyBad = render(
      <TierListView
        tierListId="tl-1"
        items={items}
        isOwner
        only={new Set([1])}
        onClearSearch={() => {}}
      />,
    );
    assert.match(onlyBad, /No places in these bands/);
  });
});

describe("TierListViewPage (restored header and tabs)", () => {
  const insights = {
    items: [],
    aiInsights: null,
    contentUpdatedAt: null,
    showPlaceStats: true,
  };

  test("owner of a place list: Edit order and Add in the dock, Map to /map?list=, share, details; tabs", () => {
    const html = render(
      <TierListViewPage data={data} insightsData={insights} />,
    );
    assert.match(html, /<h1[^>]*>Best Bars</);
    assert.match(html, />Friends</);
    assert.match(html, />12 places</);
    assert.match(html, /<button[^>]*>.*Edit order<\/button>/);
    assert.match(html, /<button[^>]*>.*Add a place<\/button>/);
    // L40: the place list's Map opens the map filtered to it.
    assert.match(
      html,
      /aria-label="Map"[^>]*href="\/map\?list=tl-1"|href="\/map\?list=tl-1"[^>]*aria-label="Map"/,
    );
    assert.doesNotMatch(html, /tierLists=/);
    // F-22: Details opens L2's sheet on the page, not the edit route.
    assert.match(html, /aria-label="Details"/);
    assert.doesNotMatch(html, /href="\/tier-lists\/tl-1\/edit"/);
    assert.match(html, />Rankings</);
    assert.match(html, />Insights</);
    assert.match(html, /placeholder="Search this list"/);
    // Moving and removing live in Edit order (DECISIONS 41).
    assert.doesNotMatch(html, /aria-label="(Lock|Unlock) editing"/);
    assert.doesNotMatch(html, /aria-label="(Remove|Reorder) /);
  });

  test("an owner's empty list asks for its first entry", () => {
    const html = render(
      <TierListViewPage
        data={{ ...data, items: [], itemCount: 0 }}
        insightsData={insights}
      />,
    );
    assert.match(html, />Nothing ranked yet\.</);
    assert.match(html, />Add from what you&#x27;ve tasted</);
    assert.doesNotMatch(html, /Edit order/);
  });

  test("not the owner, private, item list: none of the owner controls", () => {
    const html = render(
      <TierListViewPage
        data={{ ...data, isOwner: false, privacy: "PRIVATE", listType: "wine" }}
        insightsData={insights}
      />,
    );
    assert.doesNotMatch(html, /Add a wine|Edit order/);
    assert.doesNotMatch(html, /tierLists=/);
    assert.doesNotMatch(html, /\/edit"/);
    assert.match(html, />Private</);
  });
});

describe("Add entry rows (X23, X16)", () => {
  const row = {
    id: "w1",
    entityType: "wine" as const,
    name: "Barolo",
    subtitle: "Nebbiolo · 2016",
    myScore: 4 as number | null,
  };

  test("the whole row is a checkbox, and says where the entry lands", () => {
    const html = render(
      <CandidateRow
        row={row}
        onList={false}
        busy={false}
        onToggle={() => {}}
      />,
    );
    assert.match(
      html,
      /^<button type="button" role="checkbox" aria-checked="false" data-slot="add-entry-candidate"[^>]*>[\s\S]*>Barolo<[\s\S]*Nebbiolo · 2016[\s\S]*You 4 ·[\s\S]*>Very Good<\/span><\/span><\/button>$/,
    );
    assert.doesNotMatch(html, /disabled=""/);
    const unrated = render(
      <CandidateRow
        row={{ ...row, myScore: null }}
        onList={false}
        busy={false}
        onToggle={() => {}}
      />,
    );
    assert.match(unrated, />Unrated</);
    assert.doesNotMatch(unrated, /You /);
  });

  test("picked: checked; a suggestion says why before what it is", () => {
    const html = render(
      <CandidateRow
        row={{ ...row, reason: "In Garage · 2 bottles" }}
        onList={false}
        picked
        busy={false}
        onToggle={() => {}}
      />,
    );
    assert.match(html, /aria-checked="true"/);
    assert.match(html, />In Garage · 2 bottles · Nebbiolo · 2016</);
  });

  test("already on the board: On this list, and nothing to press", () => {
    const html = render(
      <CandidateRow row={row} onList busy={false} onToggle={() => {}} />,
    );
    assert.match(html, /disabled=""/);
    assert.match(html, />On this list</);
  });
});
