import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  cellarPageResult,
  cellarRow,
  DELETED_RECIPE_TITLE,
  friendProfileView,
  friendsSinceLine,
  listPageResult,
  listRow,
  logPageResult,
  logRow,
  mutualFriendsLine,
  sharesNothing,
} from "./adapter";

type ProfileArg = Parameters<typeof friendProfileView>[0];
type LogArg = Parameters<typeof logRow>[0];

const entry = (overrides: Partial<Record<string, unknown>> = {}): LogArg =>
  ({
    __typename: "ItemCheckIn",
    id: "e1",
    createdAt: "2026-10-05T12:00:00.000Z",
    score: 4.5,
    note: "Smoky, long finish",
    tags: ["smoke", "peat"],
    companionIds: [],
    companions: { edges: [] },
    place: null,
    item: {
      __typename: "Wine",
      id: "w1",
      type: "WINE",
      name: "Barolo Riserva",
      vintage: "2016-01-01",
    },
    recipe: null,
    ...overrides,
  }) as unknown as LogArg;

const profile = (overrides: Partial<Record<string, unknown>> = {}) =>
  ({
    __typename: "FriendProfile",
    id: "f1",
    since: "2026-03-14T09:00:00.000Z",
    user: {
      __typename: "UserProfile",
      id: "f1",
      displayName: "Sam",
      avatarUrl: null,
    },
    tierLists: {
      totalCount: 0,
      pageInfo: { hasNextPage: false, endCursor: null },
      edges: [],
    },
    cellars: {
      totalCount: 0,
      pageInfo: { hasNextPage: false, endCursor: null },
      edges: [],
    },
    checkIns: {
      totalCount: 0,
      pageInfo: { hasNextPage: false, endCursor: null },
      edges: [],
    },
    ...overrides,
  }) as unknown as ProfileArg;

describe("friendsSinceLine", () => {
  test("month and year from the instant's UTC parts", () => {
    assert.equal(
      friendsSinceLine("2026-03-14T09:00:00.000Z"),
      "Friends since Mar 2026",
    );
    assert.equal(
      friendsSinceLine("2025-12-31T23:59:59.000Z"),
      "Friends since Dec 2025",
    );
  });

  test("an unreadable instant says only Friends", () => {
    assert.equal(friendsSinceLine("not a date"), "Friends");
  });
});

describe("rows", () => {
  test("a tier list says its entries and its sharing, never PRIVATE", () => {
    assert.deepEqual(
      listRow({
        __typename: "TierList",
        id: "t1",
        name: "Reds",
        itemCount: 9,
        privacy: "FRIENDS",
      } as Parameters<typeof listRow>[0]),
      {
        id: "t1",
        name: "Reds",
        href: "/tier-lists/t1",
        description: "9 entries · Friends only",
      },
    );
    assert.equal(
      listRow({
        __typename: "TierList",
        id: "t2",
        name: "Empty",
        itemCount: 0,
        privacy: "PUBLIC",
      } as Parameters<typeof listRow>[0]).description,
      "Public",
    );
  });

  test("a tier list with its kind reads 'Beer · 6 ranked' and carries the band strip (F-52)", () => {
    const row = listRow({
      __typename: "TierList",
      id: "t3",
      name: "Pale ales",
      itemCount: 6,
      privacy: "FRIENDS",
      listType: "beer",
      bands: { edges: [5, 5, 4, 3, 1, 1].map((band) => ({ node: { band } })) },
    } as unknown as Parameters<typeof listRow>[0]);
    assert.equal(row.description, "Beer · 6 ranked");
    assert.equal(row.listType, "beer");
    assert.deepEqual(
      row.strip?.segments.map((segment) => segment.count),
      [2, 1, 1, 0, 2],
    );
  });

  test("a cellar names its bottles, and says nothing at zero", () => {
    const row = (total: number) =>
      cellarRow({
        __typename: "Cellar",
        id: "c1",
        name: "Bar cart",
        itemCounts: { total },
      } as Parameters<typeof cellarRow>[0]);
    assert.equal(row(12).description, "12 bottles");
    assert.equal(row(1).description, "1 bottle");
    assert.equal(row(0).description, undefined);
    assert.equal(row(3).href, "/cellars/c1");
  });

  test("a log entry: vintage first, item link, score, note, where and who with", () => {
    const row = logRow(
      entry({
        companionIds: ["a", "b"],
        companions: {
          edges: [
            {
              node: { __typename: "UserProfile", id: "a", displayName: "Ana" },
            },
          ],
        },
        place: {
          __typename: "Place",
          id: "p1",
          name: "cork and barrel",
          displayName: "Cork & Barrel",
        },
      }),
    );
    assert.equal(row.title, "2016 Barolo Riserva");
    assert.equal(row.href, "/wines/w1");
    assert.equal(row.itemType, "WINE");
    assert.equal(row.score, 4.5);
    assert.equal(row.note, "Smoky, long finish");
    assert.deepEqual(row.tags, ["smoke", "peat"]);
    assert.match(row.context, /^with Ana/);
    assert.match(row.context, /at Cork & Barrel$/);
  });

  test("ux-c L08: a Made-it log names its recipe and links into it", () => {
    const row = logRow(
      entry({
        item: null,
        recipe: { __typename: "Recipe", id: "r1", name: "Negroni" },
      }),
    );
    assert.equal(row.kind, "recipe");
    assert.equal(row.title, "Negroni");
    assert.equal(row.href, "/recipes/r1");
    assert.equal(row.itemType, null);
  });

  test("L44: a log whose recipe was deleted says so, and links nowhere", () => {
    const row = logRow(entry({ item: null, recipe: null }));
    assert.equal(row.kind, "recipe");
    assert.equal(row.title, DELETED_RECIPE_TITLE);
    assert.equal(row.href, null);
  });

  test("a blank note is no note", () => {
    assert.equal(logRow(entry({ note: "   " })).note, null);
    assert.equal(logRow(entry({ note: null })).note, null);
  });
});

describe("friendProfileView", () => {
  test("a friend who shares nothing is one empty profile", () => {
    const view = friendProfileView(profile());
    assert.equal(view.name, "Sam");
    assert.equal(view.sinceLine, "Friends since Mar 2026");
    assert.ok(sharesNothing(view));
  });

  test("sections, their totals, and the log's first page", () => {
    const view = friendProfileView(
      profile({
        tierLists: {
          totalCount: 26,
          pageInfo: { hasNextPage: true, endCursor: "t:1" },
          edges: [
            {
              cursor: "t:1",
              node: {
                __typename: "TierList",
                id: "t1",
                name: "Reds",
                itemCount: 2,
                privacy: "PUBLIC",
              },
            },
          ],
        },
        checkIns: {
          totalCount: 14,
          pageInfo: { hasNextPage: true, endCursor: "k:1" },
          edges: [{ cursor: "k:1", node: entry() }],
        },
      }),
    );
    assert.ok(!sharesNothing(view));
    assert.equal(view.tierLists.totalCount, 26);
    assert.equal(view.tierLists.rows.length, 1);
    assert.equal(view.tierLists.hasNextPage, true);
    assert.equal(view.tierLists.endCursor, "t:1");
    assert.equal(view.logs.rows.length, 1);
    assert.equal(view.logs.hasNextPage, true);
    assert.equal(view.logs.endCursor, "k:1");
    assert.equal(view.logs.totalCount, 14);
  });
});

describe("logPageResult", () => {
  test("a refusal passes through as the failure, not as an empty page", () => {
    const refused = logPageResult({
      __typename: "NotFoundError",
      code: "NOT_FOUND",
      message: "This profile doesn't exist or isn't shared with you.",
    } as unknown as Parameters<typeof logPageResult>[0]);
    assert.equal(refused.ok, false);
    assert.equal(logPageResult(undefined).ok, false);
  });
});

describe("listPageResult / cellarPageResult (leftovers 6)", () => {
  test("the page after the first 20: rows, cursor, and whether more remain", () => {
    const next = listPageResult({
      __typename: "FriendProfile",
      id: "f1",
      tierLists: {
        totalCount: 21,
        pageInfo: { hasNextPage: false, endCursor: "t:20" },
        edges: [
          {
            cursor: "t:20",
            node: {
              __typename: "TierList",
              id: "t20",
              name: "Whites",
              itemCount: 0,
              privacy: "FRIENDS",
            },
          },
        ],
      },
    } as unknown as Parameters<typeof listPageResult>[0]);
    assert.ok(next.ok);
    if (!next.ok) return;
    assert.deepEqual(
      next.data.rows.map((row) => [row.id, row.href, row.description]),
      [["t20", "/tier-lists/t20", "Friends only"]],
    );
    assert.equal(next.data.endCursor, "t:20");
    assert.equal(next.data.hasNextPage, false);
    assert.equal(next.data.totalCount, 21);

    const cellars = cellarPageResult({
      __typename: "FriendProfile",
      id: "f1",
      cellars: {
        totalCount: 22,
        pageInfo: { hasNextPage: true, endCursor: "c:20" },
        edges: [
          {
            cursor: "c:20",
            node: {
              __typename: "Cellar",
              id: "c20",
              name: "Garage",
              itemCounts: { total: 3 },
            },
          },
        ],
      },
    } as unknown as Parameters<typeof cellarPageResult>[0]);
    assert.ok(cellars.ok);
    if (!cellars.ok) return;
    assert.deepEqual(
      cellars.data.rows.map((row) => [row.id, row.description]),
      [["c20", "3 bottles"]],
    );
    assert.equal(cellars.data.hasNextPage, true);
  });

  test("a refusal passes through as the failure", () => {
    const refusal = {
      __typename: "NotFoundError",
      code: "NOT_FOUND",
      message: "This profile doesn't exist or isn't shared with you.",
    };
    assert.equal(
      listPageResult(refusal as unknown as Parameters<typeof listPageResult>[0])
        .ok,
      false,
    );
    assert.equal(
      cellarPageResult(
        refusal as unknown as Parameters<typeof cellarPageResult>[0],
      ).ok,
      false,
    );
  });
});

describe("mutualFriendsLine (F-94)", () => {
  const ana = { displayName: "Ana" };
  test("names the first, then counts the rest", () => {
    assert.equal(mutualFriendsLine({ count: 1, first: ana }), "Friend of Ana");
    assert.equal(
      mutualFriendsLine({ count: 2, first: ana }),
      "Friend of Ana and 1 other",
    );
    assert.equal(
      mutualFriendsLine({ count: 4, first: ana }),
      "Friend of Ana and 3 others",
    );
  });
  test("nothing when there are none", () => {
    assert.equal(mutualFriendsLine({ count: 0, first: null }), null);
    assert.equal(mutualFriendsLine(null), null);
  });
});
