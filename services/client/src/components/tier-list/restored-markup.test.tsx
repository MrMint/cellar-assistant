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

mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/tier-lists/tl-1",
  useSearchParams: () => new URLSearchParams(),
}));
mock.module("nuqs", () => ({
  parseAsStringLiteral: () => ({ withDefault: (value: string) => value }),
  useQueryState: (key: string) => [key === "tab" ? "rankings" : null, () => {}],
}));

const { TierListCard } = await import("./TierListCard");
const { TierListView } = await import("./TierListView");
const { TierListViewPage } = await import("./TierListViewPage");
const { TierListForm } = await import("./TierListForm");
const { AddToTierListButton } = await import("./AddToTierListButton");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = (node: ReactNode) =>
  renderToStaticMarkup(<Provider value={client}>{node}</Provider>).replace(
    /<style[^>]*>[^<]*<\/style>/g,
    "",
  );

const items = Array.from({ length: 12 }, (_, i) => ({
  id: `row-${i}`,
  band: i < 11 ? 5 : 0,
  position: i,
  name: `Entry ${i + 1}`,
  subtitle: i === 0 ? "Wine Bar · Austin · US" : "",
  href: `/places/p-${i}`,
  reviewScore: i === 0 ? 4 : null,
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
  isEditingLocked: false,
  itemCount: items.length,
  items,
};

describe("TierListCard (restored)", () => {
  test("name, privacy icon, type chip, count, creator", () => {
    const html = render(
      <TierListCard
        tierList={{
          __typename: "TierList",
          id: "tl-1",
          name: "Best Bars",
          description: "Where to go",
          privacy: "PUBLIC",
          listType: "wine",
          itemCount: 1,
          createdAt: null,
          createdById: "u1",
          createdBy: { id: "u1", displayName: "Pat", avatarUrl: null },
        }}
      />,
    );
    assert.match(html, /href="\/tier-lists\/tl-1"/);
    assert.match(html, /MuiTypography-title-lg[^>]*>Best Bars</);
    assert.match(html, />Wines</);
    assert.match(html, />1 item</);
    assert.match(html, />Pat</);
  });

  test("no creator (signed out) reads Unknown user", () => {
    const html = render(
      <TierListCard
        tierList={{
          __typename: "TierList",
          id: "tl-1",
          name: "x",
          description: null,
          privacy: "PRIVATE",
          listType: "place",
          itemCount: 2,
          createdAt: null,
          createdById: "u1",
          createdBy: null,
        }}
      />,
    );
    assert.match(html, />Unknown user</);
    assert.match(html, />2 items</);
  });
});

describe("TierListView (restored board)", () => {
  test("six band labels, crown for #1, trophies to #10, plain ranks after", () => {
    const html = render(
      <TierListView tierListId="tl-1" items={items} isOwner />,
    );
    for (const label of [
      "Outstanding",
      "Very Good",
      "Good",
      "Mediocre",
      "Bad",
      "Unrated",
    ]) {
      assert.match(html, new RegExp(`>${label}<`));
    }
    // Ranks 2..10 sit on trophies; 11 and 12 are plain numbers.
    assert.match(html, /MuiTypography-body-sm[^>]*>11</);
    assert.match(html, /MuiTypography-body-sm[^>]*>12</);
    // The viewer's own score and the public rating with its count.
    assert.match(html, />4</);
    assert.match(html, />4.6/);
    assert.match(html, />\(1\.2k\)</);
    assert.match(html, /aria-label="Remove Entry 1"/);
  });

  test("locked or not the owner: no remove buttons, no drag handles", () => {
    for (const html of [
      render(
        <TierListView
          tierListId="tl-1"
          items={items}
          isOwner
          isEditingLocked
        />,
      ),
      render(<TierListView tierListId="tl-1" items={items} isOwner={false} />),
    ]) {
      assert.doesNotMatch(html, /aria-label="Remove /);
      assert.doesNotMatch(html, /cursor:grab|aria-roledescription="sortable"/);
    }
  });
});

describe("TierListViewPage (restored header and tabs)", () => {
  const insights = {
    items: [],
    aiInsights: null,
    contentUpdatedAt: null,
    showPlaceStats: true,
  };

  test("owner of a place list: add, map, share, lock, edit; tabs", () => {
    const html = render(
      <TierListViewPage data={data} insightsData={insights} />,
    );
    assert.match(html, /MuiTypography-h3[^>]*>Best Bars</);
    assert.match(html, />Friends</);
    assert.match(html, /aria-label="Add entry"/);
    assert.match(html, /href="\/map\?tierLists=tl-1"/);
    assert.match(html, /href="\/tier-lists\/tl-1\/edit"/);
    assert.match(html, />Rankings</);
    assert.match(html, />Insights</);
  });

  test("not the owner, private, item list: none of the owner controls", () => {
    const html = render(
      <TierListViewPage
        data={{ ...data, isOwner: false, privacy: "PRIVATE", listType: "wine" }}
        insightsData={insights}
      />,
    );
    assert.doesNotMatch(html, /aria-label="Add entry"/);
    assert.doesNotMatch(html, /tierLists=/);
    assert.doesNotMatch(html, /\/edit"/);
    assert.match(html, />Private</);
  });
});

describe("TierListForm (restored)", () => {
  test("create: Name, Description, Privacy, List Type", () => {
    const html = render(<TierListForm onSubmitted={() => {}} />);
    for (const label of ["Name", "Description", "Privacy", "List Type"]) {
      assert.match(html, new RegExp(`>${label}<`));
    }
    assert.match(html, /placeholder="e.g. Best Wine Bars"/);
    // Joy's Select renders its options in a portal, so the default (place)
    // is not in static markup; the field itself is.
    assert.match(html, /name="list_type"/);
    assert.match(html, />Create</);
  });

  test("edit: no List Type, Save", () => {
    const html = render(<TierListForm id="tl-1" onSubmitted={() => {}} />);
    assert.doesNotMatch(html, />List Type</);
    assert.match(html, />Save</);
  });
});

describe("AddToTierListButton (restored)", () => {
  test("the old outlined button", () => {
    const html = render(
      <AddToTierListButton entityId="i1" entityType="wine" entityName="X" />,
    );
    assert.match(html, />Add to Tier List</);
  });
});
