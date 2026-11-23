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

const { TierListCard } = await import("./TierListCard");
const { TierListView } = await import("./TierListView");
const { TierListViewPage } = await import("./TierListViewPage");
const { TierListForm } = await import("./TierListForm");
const { AddToTierListButton } = await import("./AddToTierListButton");
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
  itemCount: items.length,
  items,
  history: null,
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
    assert.match(html, /href="\/tier-lists\/tl-1"[\s\S]*>Best Bars</);
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
  test("arranging: six band labels, crown for #1, trophies to #10, plain ranks after", () => {
    const html = render(
      <TierListView tierListId="tl-1" items={items} isOwner arranging />,
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
    // Ranks 2..10 sit on trophies; 11 and 12 are plain numbers, each ahead
    // of its name, and each row ends in its remove button.
    assert.match(html, />11<[\s\S]*?>Entry 11<[\s\S]*?"Remove Entry 11"/);
    assert.match(html, />12<[\s\S]*?>Entry 12<[\s\S]*?"Remove Entry 12"/);
    // The owner's score and the public rating with its count.
    assert.match(html, />4</);
    assert.match(html, />4.6/);
    assert.match(html, />\(1\.2k\)</);
    assert.match(html, /aria-label="Remove Entry 1"/);
    // #1's crown says its rank in words, and each drag handle is named.
    assert.match(html, />Rank 1</);
    assert.match(html, /<button[^>]*aria-label="Reorder Entry 1"/);
    // Arranging, a row is not a link: a stray tap must not navigate away.
    assert.doesNotMatch(html, /href="\/places\/p-0"/);
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
      assert.doesNotMatch(html, /aria-label="Remove /);
      assert.doesNotMatch(html, /cursor:grab|aria-roledescription="sortable"/);
      assert.match(html, /href="\/places\/p-0"[^>]*>Entry 1</);
    }
  });

  test("X23: on someone else's list, a You chip beside the owner's score", () => {
    const friend = render(
      <TierListView tierListId="tl-1" items={items} isOwner={false} />,
    );
    assert.match(
      friend,
      /Your rating: <\/span><span aria-hidden="true">You <\/span>2\.5/,
    );
    // On your own list your score is the owner's: no chip.
    const own = render(
      <TierListView tierListId="tl-1" items={items} isOwner />,
    );
    assert.doesNotMatch(own, /data-slot="viewer-score"/);
  });
});

describe("TierListViewPage (restored header and tabs)", () => {
  const insights = {
    items: [],
    aiInsights: null,
    contentUpdatedAt: null,
    showPlaceStats: true,
  };

  test("owner of a place list: Arrange, map, share, edit; tabs; no padlock", () => {
    const html = render(
      <TierListViewPage data={data} insightsData={insights} />,
    );
    assert.match(html, /<h1[^>]*>Best Bars</);
    assert.match(html, />Friends</);
    assert.match(html, /<button[^>]*>.*Arrange<\/button>/);
    assert.match(html, /href="\/map\?tierLists=tl-1"/);
    assert.match(html, /href="\/tier-lists\/tl-1\/edit"/);
    assert.match(html, />Rankings</);
    assert.match(html, />Insights</);
    // Add entry, Undo and the remove buttons live in Arrange (X23/D4).
    assert.doesNotMatch(html, /Add entry/);
    assert.doesNotMatch(html, /aria-label="(Lock|Unlock) editing"/);
    assert.doesNotMatch(html, /aria-label="Remove /);
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
    assert.doesNotMatch(html, />Arrange</);
  });

  test("not the owner, private, item list: none of the owner controls", () => {
    const html = render(
      <TierListViewPage
        data={{ ...data, isOwner: false, privacy: "PRIVATE", listType: "wine" }}
        insightsData={insights}
      />,
    );
    assert.doesNotMatch(html, /Add entry|>Arrange</);
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
    // The Select renders its options in a portal, so the default (place)
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
