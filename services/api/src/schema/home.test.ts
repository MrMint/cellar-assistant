/**
 * Home "Today" (X10) — `Viewer.openBottles`, `Viewer.aiJobs`,
 * `Viewer.friendsFeed` and `CellarItem.cellar`, executed against a stub
 * sidecar. Pinned: each addresses only the viewer's own actor, takes no user
 * id from the document, and a failure's message never crosses (N07).
 */
import type {
  ActivityEntryDto,
  AiJobDto,
  CellarItemDto,
  DrinkSoonDto,
  Page,
  PageArgs,
} from "@cellar-assistant/contracts";
import { activityFeedCursor } from "@cellar-assistant/contracts";
import { execute, parse } from "graphql";
import { describe, expect, it } from "vitest";
import { stubSidecar, testContext } from "../testing.ts";
import { schema } from "./index.ts";

const run = (document: string, context: ReturnType<typeof testContext>) =>
  execute({ schema, document: parse(document), contextValue: context });

const viewer = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "test@test.com",
  emailVerified: true,
  role: "user" as const,
};
const CELLAR_ID = "c5555555-5555-4555-8555-555555555555";
const WINE_ID = "33333333-3333-4333-8333-333333333333";
const FRIEND = "f2222222-2222-4222-8222-222222222222";

const bottle: CellarItemDto = {
  id: "b1111111-1111-4111-8111-111111111111",
  cellarId: CELLAR_ID,
  createdBy: viewer.id,
  item: { type: "WINE", id: WINE_ID },
  openAt: "2026-10-05T12:00:00.000Z",
  emptyAt: null,
  percentageRemaining: 40,
  displayImageId: null,
  sourceType: null,
  sourcePlaceId: null,
  sourceMenuItemId: null,
  distance: null,
  createdAt: "2026-10-01T12:00:00.000Z",
  updatedAt: "2026-10-05T12:00:00.000Z",
  packagedOn: null,
  acquiredOn: null,
  drinkFrom: null,
  drinkUntil: null,
  priceAmount: null,
  priceCurrency: null,
  location: null,
};

const cellar = {
  id: CELLAR_ID,
  name: "Home Cellar",
  privacy: "PRIVATE" as const,
  createdById: viewer.id,
  coOwnerIds: [],
  itemCount: 1,
  itemCounts: {
    total: 1,
    byType: { WINE: 1, BEER: 0, SPIRIT: 0, COFFEE: 0, SAKE: 0, TEA: 0 },
  },
  createdAt: "2026-10-01T12:00:00.000Z",
  updatedAt: "2026-10-01T12:00:00.000Z",
};

const page = <T>(nodes: T[], hasNextPage = false): Page<T> => ({
  entries: nodes.map((node, index) => ({ cursor: `c${index}`, node })),
  hasNextPage,
  hasPreviousPage: false,
  totalCount: nodes.length,
});

describe("Viewer.openBottles (X10 Continue)", () => {
  it("pages the viewer's own collection actor and names each bottle's cellar", async () => {
    const { invoke, calls } = stubSidecar({
      "CellarsCollectionActor.openBottles": () => page([bottle], true),
      "CellarActor.get": () => cellar,
    });
    const result = await run(
      `{ me { openBottles(first: 6) {
          totalCount pageInfo { hasNextPage endCursor }
          edges { node { id percentageRemaining openAt cellar { id name } } }
      } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls[0]).toMatchObject({
      actorType: "CellarsCollectionActor",
      actorId: viewer.id,
      method: "openBottles",
    });
    expect(calls[0]?.args[1]).toMatchObject({
      first: 6,
    } satisfies Partial<PageArgs>);
    expect(result.data?.me).toEqual({
      openBottles: {
        totalCount: 1,
        pageInfo: { hasNextPage: true, endCursor: "c0" },
        edges: [
          {
            node: {
              id: bottle.id,
              percentageRemaining: 40,
              openAt: bottle.openAt,
              cellar: { id: CELLAR_ID, name: "Home Cellar" },
            },
          },
        ],
      },
    });
  });
});

describe("Viewer.drinkSoon (ux-c L02)", () => {
  const OTHER_CELLAR = "c6666666-6666-4666-8666-666666666666";
  const sealed = (id: string, until: string): DrinkSoonDto => ({
    bottle: { ...bottle, id, openAt: null, cellarId: OTHER_CELLAR },
    reason: "SEALED",
    urgency: "SOON",
    openDays: null,
    openLifeDays: null,
    window: {
      from: null,
      fromSource: null,
      until,
      untilSource: "typical",
    },
    typicalFor: "IPA",
    ratio: null,
  });
  const opened: DrinkSoonDto = {
    bottle,
    reason: "OPENED",
    urgency: "PAST",
    openDays: 9,
    openLifeDays: [3, 5],
    window: null,
    typicalFor: "red wine",
    ratio: 1.8,
  };

  it("fans out over the viewer's own cellars and merges in one order", async () => {
    const { invoke, calls } = stubSidecar({
      "CellarsCollectionActor.list": () => page([CELLAR_ID, OTHER_CELLAR]),
      "CellarActor.drinkSoon": (actorId) =>
        actorId === CELLAR_ID
          ? page([sealed("b-late", "2027-02-01"), opened])
          : page([sealed("b-early", "2026-12-15")]),
    });
    const result = await run(
      `{ me { drinkSoon(first: 5) {
          edges { node {
            reason urgency openDays openLifeFromDays openLifeUntilDays typicalFor
            window { until untilSource }
            bottle { id }
          } }
      } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls[0]).toMatchObject({
      actorType: "CellarsCollectionActor",
      actorId: viewer.id,
      method: "list",
    });
    expect(calls[0]?.args[2]).toBe("MINE");
    const me = result.data?.me as
      | { drinkSoon: { edges: { node: Record<string, unknown> }[] } }
      | undefined;
    const nodes = me?.drinkSoon.edges.map((edge) => edge.node) ?? [];
    expect(nodes.map((node) => (node.bottle as { id: string }).id)).toEqual([
      bottle.id,
      "b-early",
      "b-late",
    ]);
    expect(nodes[0]).toMatchObject({
      reason: "OPENED",
      urgency: "PAST",
      openDays: 9,
      openLifeFromDays: 3,
      openLifeUntilDays: 5,
      typicalFor: "red wine",
      window: null,
    });
    expect(nodes[1]).toMatchObject({
      reason: "SEALED",
      window: { until: "2026-12-15", untilSource: "TYPICAL" },
    });
  });

  it("one cellar failing costs only its own bottles", async () => {
    const { invoke } = stubSidecar({
      "CellarsCollectionActor.list": () => page([CELLAR_ID, OTHER_CELLAR]),
      "CellarActor.drinkSoon": (actorId) => {
        if (actorId === CELLAR_ID) throw new Error("gone");
        return page([sealed("b-early", "2026-12-15")]);
      },
    });
    const result = await run(
      "{ me { drinkSoon(first: 5) { edges { node { bottle { id } } } } } }",
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(JSON.stringify(result.data)).toContain("b-early");
  });
});

const job = (overrides: Partial<AiJobDto>): AiJobDto => ({
  id: "MENU_SCAN:s1",
  kind: "MENU_SCAN",
  status: "RUNNING",
  subjectId: "s1",
  itemType: null,
  placeId: null,
  placeName: null,
  count: null,
  tierListName: null,
  recipeId: null,
  recipeName: null,
  startedAt: "2026-10-05T12:00:00.000Z",
  finishedAt: null,
  failureCode: null,
  failureReason: null,
  retryAt: null,
  ...overrides,
});

describe("Viewer.aiJobs (X10 job tray)", () => {
  it("returns the viewer's jobs with N07's typed failure", async () => {
    const { invoke, calls } = stubSidecar({
      "AiJobsCollectionActor.list": () => [
        job({ placeName: "Cork & Barrel" }),
        job({
          id: "TIER_LIST_INSIGHTS:t1",
          kind: "TIER_LIST_INSIGHTS",
          status: "FAILED",
          subjectId: "t1",
          tierListName: "Reds",
          finishedAt: "2026-10-05T12:01:00.000Z",
          failureCode: "BUDGET_EXCEEDED",
          failureReason: "USER_CAP",
          retryAt: "2026-10-05T18:00:00.000Z",
        }),
      ],
    });
    const result = await run(
      `{ me { aiJobs(first: 30) { edges { node {
          id kind status subjectId placeName tierListName finishedAt
          failureCode failureReason retryAt
      } } } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      actorType: "AiJobsCollectionActor",
      actorId: viewer.id,
      method: "list",
    });
    const me = result.data?.me as
      | { aiJobs: { edges: { node: Record<string, unknown> }[] } }
      | undefined;
    const jobs = me?.aiJobs.edges.map((edge) => edge.node) ?? [];
    expect(jobs.map((j) => [j.kind, j.status])).toEqual([
      ["MENU_SCAN", "RUNNING"],
      ["TIER_LIST_INSIGHTS", "FAILED"],
    ]);
    expect(jobs[1]).toMatchObject({
      failureCode: "BUDGET_EXCEEDED",
      failureReason: "USER_CAP",
      retryAt: "2026-10-05T18:00:00.000Z",
    });
  });
});

const entry = (minute: number, id: string): ActivityEntryDto => ({
  kind: "REVIEWED",
  id,
  occurredAt: `2026-10-05T12:${String(minute).padStart(2, "0")}:00.000Z`,
  userId: FRIEND,
  item: { type: "WINE", id: WINE_ID },
  placeId: null,
  review: {
    id,
    itemId: WINE_ID,
    itemType: "WINE",
    userId: FRIEND,
    score: 4,
    text: null,
    createdAt: "2026-10-05T12:00:00.000Z",
    updatedAt: "2026-10-05T12:00:00.000Z",
  },
  tierListItem: null,
  rank: null,
  cellarId: null,
  cellarItemId: null,
  checkIn: null,
});

describe("Viewer.friendsFeed (X10 Friends)", () => {
  it("hands the cursor and kinds to the viewer's own actor, and its page back unchanged", async () => {
    const first = entry(30, "a1111111-1111-4111-8111-111111111111");
    const cursor = activityFeedCursor(first);
    const { invoke, calls } = stubSidecar({
      "FriendsCollectionActor.friendsFeed": () => ({
        entries: [{ cursor, node: first }],
        hasNextPage: true,
        hasPreviousPage: true,
        totalCount: null,
      }),
    });
    const result = await run(
      `{ me { friendsFeed(first: 1, after: "feed:2026-10-05T12:40:00.000Z|REVIEWED|b1111111-1111-4111-8111-111111111111", kinds: [REVIEWED]) {
          pageInfo { hasNextPage endCursor }
          edges { cursor node { id kind } }
      } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls[0]).toMatchObject({
      actorType: "FriendsCollectionActor",
      actorId: viewer.id,
      method: "friendsFeed",
    });
    expect(calls[0]?.args[1]).toEqual({ kinds: ["REVIEWED"] });
    expect(calls[0]?.args[2]).toEqual({
      first: 1,
      after:
        "feed:2026-10-05T12:40:00.000Z|REVIEWED|b1111111-1111-4111-8111-111111111111",
    });
    expect(result.data?.me).toEqual({
      friendsFeed: {
        pageInfo: { hasNextPage: true, endCursor: cursor },
        edges: [
          { cursor, node: { id: `REVIEWED:${first.id}`, kind: "REVIEWED" } },
        ],
      },
    });
  });
});
