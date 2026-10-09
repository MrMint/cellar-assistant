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
  renderToStaticMarkup(<Provider value={client}>{node}</Provider>).replace(
    /<style[^>]*>[^<]*<\/style>/g,
    "",
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
      ["Cellars -> /cellars", "Bar -> /recipes"],
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
      description: null,
      privacy: "PUBLIC",
      listType: "wine",
      itemCount: 3,
      createdAt: "2026-10-01T00:00:00.000Z",
      createdBy: {
        id: row.createdById,
        displayName: row.createdById,
        avatarUrl: null,
      },
      ...row,
    })) as never[],
    endCursor: null,
    hasNextPage: false,
    totalCount: rows.length,
  },
  failure: null,
});

describe("/tier-lists sections", () => {
  test("Yours empty says so with New tier list; strangers' lists sit under Discover", () => {
    const html = render(
      <TierListsPage
        sections={{
          MINE: listSeed([]),
          FRIENDS: listSeed([]),
          DISCOVER: listSeed([
            { id: "t9", name: "apiwave public", createdById: "stranger" },
          ]),
        }}
      />,
    );
    assert.deepEqual(sectionTitles(html), ["Yours", "Discover"]);
    assert.match(textOf(html), /Nothing ranked yet\./);
    assert.match(
      html,
      /href="\/tier-lists\/add"[^>]*>(?:<[^>]+>)*New tier list/,
    );
    const discover = html.slice(html.indexOf('data-section="DISCOVER"'));
    assert.match(textOf(discover), /apiwave public/);
  });
});
