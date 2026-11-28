/**
 * X11 / D2: `/cellars` and `/tier-lists` in three sections — Yours, From
 * friends, Discover — with the Cellar tab's Cellars · Bar segments (D1) and
 * the first-run states (N15). Server-rendered, the way the first paint is.
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
  useSearchParams: () => new URLSearchParams(),
}));

const { Cellars, uniqueCellarCards } = await import("./Cellars");
const { sectionPageSize } = await import("../cellar-api/pagination");
const { CellarSegments, CELLAR_SEGMENTS } = await import("./CellarSegments");
const { TierListsPage } = await import("../tier-list/TierListsPage");
const { textOf } = await import("@/test-support/markup");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = (node: ReactNode) =>
  stripStyleBlocks(
    renderToStaticMarkup(<Provider value={client}>{node}</Provider>),
  );

const person = (id: string, name: string) => ({
  __typename: "UserProfile",
  id,
  displayName: name,
  avatarUrl: null,
});

const cellarEdge = (id: string, name: string, ownerId: string) => ({
  cursor: id,
  node: {
    __typename: "Cellar",
    id,
    name,
    createdById: ownerId,
    coOwnerIds: [],
    createdBy: person(ownerId, ownerId),
    coOwners: { edges: [] },
    itemCounts: {
      __typename: "ItemTypeCounts",
      beer: 0,
      wine: 2,
      spirit: 0,
      coffee: 0,
      sake: 0,
      tea: 0,
      total: 2,
    },
  },
});

const seed = (edges: ReturnType<typeof cellarEdge>[], hasNextPage = false) => ({
  page: {
    rows: edges as never[],
    endCursor: edges.at(-1)?.cursor ?? null,
    hasNextPage,
    totalCount: edges.length + (hasNextPage ? 10 : 0),
  },
  failure: null,
});

const sectionTitles = (html: string) =>
  [...html.matchAll(/<h2\b[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);

describe("/cellars sections", () => {
  test("Yours, From friends and Discover, in that order, each with its own cards", () => {
    const html = render(
      <Cellars
        userId="me"
        sections={{
          MINE: seed([cellarEdge("c1", "Home Cellar", "me")]),
          FRIENDS: seed([cellarEdge("c2", "Weekend Wines", "friend")]),
          DISCOVER: seed([cellarEdge("c3", "A stranger's", "stranger")], true),
        }}
      />,
    );
    assert.deepEqual(sectionTitles(html), [
      "Yours",
      "From friends",
      "Discover",
    ]);
    const yours = html.slice(
      html.indexOf('data-section="MINE"'),
      html.indexOf('data-section="FRIENDS"'),
    );
    assert.match(textOf(yours), /Home Cellar/);
    // A stranger's cellar is never among yours.
    assert.doesNotMatch(textOf(yours), /A stranger's/);
    // Discover has more: one "Show more", for that section only.
    assert.equal(html.match(/Show more/g)?.length, 1);
    assert.match(textOf(html), /Show more\s+in Discover/);
  });

  test("first run: Yours says so with one action; empty friends and discover are not drawn", () => {
    const html = render(
      <Cellars
        userId="me"
        sections={{ MINE: seed([]), FRIENDS: seed([]), DISCOVER: seed([]) }}
      />,
    );
    assert.deepEqual(sectionTitles(html), ["Yours"]);
    assert.match(textOf(html), /Your cellar is waiting\./);
    assert.match(html, /href="\/cellars\/add"[^>]*>(?:<[^>]+>)*New cellar/);
  });

  test("Discover pages are short; Yours a screenful", () => {
    assert.ok(sectionPageSize("DISCOVER") < sectionPageSize("MINE"));
  });

  test("a cellar seen on two pages is shown once", () => {
    const edge = cellarEdge("c1", "Home Cellar", "me");
    assert.equal(uniqueCellarCards([edge, edge] as never).length, 1);
  });
});

describe("Cellars · Bar (D1)", () => {
  test("two links, the current one marked; Bar is recipes", () => {
    const html = render(<CellarSegments current="bar" />);
    assert.match(html, /<nav\b[^>]*aria-label="Cellar"/);
    assert.deepEqual(
      CELLAR_SEGMENTS.map((s) => `${s.label} -> ${s.href}`),
      ["Cellars -> /cellars", "Your bar -> /recipes"],
    );
    assert.match(
      html,
      /href="\/recipes"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/recipes"/,
    );
    assert.equal(html.match(/aria-current="page"/g)?.length, 1);
  });

  test("/cellars carries them, Cellars current", () => {
    const html = render(
      <Cellars
        userId="me"
        sections={{ MINE: seed([]), FRIENDS: seed([]), DISCOVER: seed([]) }}
      />,
    );
    assert.match(
      html,
      /href="\/cellars"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/cellars"/,
    );
  });
});

const listSeed = (
  rows: { id: string; name: string; createdById: string }[],
) => ({
  page: {
    rows: rows.map((row) => ({
      __typename: "TierList",
      privacy: "PUBLIC",
      listType: "place",
      itemCount: 3,
      contentUpdatedAt: "2026-10-01T00:00:00.000Z",
      createdBy: {
        id: row.createdById,
        displayName: row.createdById,
        avatarUrl: null,
      },
      top: { edges: [] },
      bands: { edges: [] },
      ...row,
    })) as never[],
    endCursor: null,
    hasNextPage: false,
    totalCount: rows.length,
  },
  failure: null,
});

describe("/tier-lists sections", () => {
  test("an empty Yours carries the one New list; strangers' lists sit under Discover", () => {
    const html = render(
      <TierListsPage
        sections={{
          MINE: listSeed([]),
          FRIENDS: listSeed([]),
          DISCOVER: listSeed([
            { id: "t9", name: "Madison drinking spots", createdById: "Test" },
          ]),
        }}
      />,
    );
    assert.deepEqual(sectionTitles(html), ["Yours", "Discover"]);
    assert.match(textOf(html), /Nothing ranked yet/);
    // Social-Lists ruling 4: one New list on the empty index, the empty card's.
    assert.equal(html.match(/>New list</g)?.length, 1);
    const discover = html.slice(html.indexOf('data-section="DISCOVER"'));
    assert.match(textOf(discover), /Madison drinking spots/);
    assert.match(textOf(discover), /Test · 3 places/);
  });
});

describe("/cellars cards (lot-cellars-shelves-01)", () => {
  const withExtras = (
    edge: ReturnType<typeof cellarEdge>,
    open: number,
    names: string[],
  ) => ({
    ...edge,
    node: {
      ...edge.node,
      open: { bottleCount: open },
      recent: {
        edges: names.map((name, i) => ({
          node: {
            __typename: "CellarItemGroup",
            count: 1,
            openCount: 0,
            match: null,
            lead: {
              __typename: "CellarItem",
              id: `${edge.node.id}-b${i}`,
              type: "WINE",
              openAt: null,
              emptyAt: null,
              percentageRemaining: 100,
              createdAt: null,
              item: { __typename: "Item", id: `w${i}`, type: "WINE", name },
            },
          },
        })),
      },
    },
  });

  test("yours: the count line, kinds in order, Edit; a friend's: whose it is, no Edit", () => {
    const html = render(
      <Cellars
        userId="me"
        sections={{
          MINE: seed([withExtras(cellarEdge("c1", "Home", "me"), 1, [])]),
          FRIENDS: seed([
            withExtras(cellarEdge("c2", "Lake House", "Test Two"), 0, []),
          ]),
          DISCOVER: seed([]),
        }}
      />,
    );
    const text = textOf(html);
    assert.match(text, /Cellars/);
    assert.match(html, /href="\/cellars\/add"/);
    assert.match(text, /Home\s*Edit\s*2 bottles · 1 open\s*2 Wine/);
    assert.match(
      html,
      /aria-label="Edit Home"[^>]*|href="\/cellars\/c1\/edit"/,
    );
    assert.doesNotMatch(html, /href="\/cellars\/c2\/edit"/);
    assert.match(text, /Lake House\s*.*Test Two ·\s*2 bottles\s*2 Wine/);
    // Four wells on every card, filled or bare.
    assert.equal(html.match(/data-slot="cellar-card-mosaic"/g)?.length, 2);
  });

  test("the mosaic: a label plate for a bottle with no photo", () => {
    const html = render(
      <Cellars
        userId="me"
        sections={{
          MINE: seed([
            withExtras(cellarEdge("c1", "Home", "me"), 0, [
              "Hillside Garnacha",
            ]),
          ]),
          FRIENDS: seed([]),
          DISCOVER: seed([]),
        }}
      />,
    );
    assert.equal(html.match(/data-slot="label-plate"/g)?.length, 1);
    assert.match(textOf(html), /Hillside Garnacha/);
  });
});
