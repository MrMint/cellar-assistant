import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  cellarRow,
  friendProfileView,
  friendsSinceLine,
  listRow,
  logPageResult,
  logRow,
  moreLine,
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
    tierLists: { totalCount: 0, edges: [] },
    cellars: { totalCount: 0, edges: [] },
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
          edges: [
            {
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
    assert.equal(view.tierListCount, 26);
    assert.equal(
      moreLine(view.tierLists.length, view.tierListCount),
      "Showing 1 of 26",
    );
    assert.equal(view.logs.rows.length, 1);
    assert.equal(view.logs.hasNextPage, true);
    assert.equal(view.logs.endCursor, "k:1");
    assert.equal(view.logs.totalCount, 14);
  });
});

describe("moreLine", () => {
  test("only when the page did not show the whole section", () => {
    assert.equal(moreLine(5, 5), null);
    assert.equal(moreLine(20, 21), "Showing 20 of 21");
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
