/**
 * Home's Friends feed (X10): sentences, and bursts folded into one line.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  BURST_WINDOW_MS,
  type FeedNode,
  feedEntriesFromNodes,
  groupBursts,
  sentenceText,
} from "./feed";

const VIEWER = "viewer";
const SAM = {
  __typename: "UserProfile",
  id: "sam",
  displayName: "Sam Lee",
  avatarUrl: null,
};
const ANA = {
  __typename: "UserProfile",
  id: "ana",
  displayName: "Ana",
  avatarUrl: null,
};

const at = (minutesAgo: number) =>
  new Date(
    Date.parse("2026-10-09T12:00:00.000Z") - minutesAgo * 60_000,
  ).toISOString();

let serial = 0;
const item = (name: string) => ({
  __typename: "Beer",
  id: `w-${name}`,
  type: "BEER",
  name,
  isWantToTry: false,
  images: { edges: [] },
});

const base = (user: typeof SAM, minutesAgo: number) => {
  serial += 1;
  return {
    __typename: "ActivityEntry",
    id: `e${serial}`,
    occurredAt: at(minutesAgo),
    rank: null,
    cellarItemId: null,
    user,
    item: null,
    place: null,
    review: null,
    tierListItem: null,
    cellar: null,
    checkIn: null,
  };
};

const added = (
  user: typeof SAM,
  minutesAgo: number,
  name: string,
  cellar = { id: "c1", name: "Weekend Wines" },
) =>
  ({
    ...base(user, minutesAgo),
    kind: "ADDED",
    cellarItemId: `b-${serial}`,
    item: item(name),
    cellar: { __typename: "Cellar", ...cellar },
  }) as unknown as FeedNode;

const reviewed = (
  user: typeof SAM,
  minutesAgo: number,
  name: string,
  score: number,
) =>
  ({
    ...base(user, minutesAgo),
    kind: "REVIEWED",
    item: item(name),
    review: { __typename: "ItemReview", id: `r-${serial}`, score, text: null },
  }) as unknown as FeedNode;

const drank = (
  user: typeof SAM,
  minutesAgo: number,
  name: string,
  extra: {
    score?: number | null;
    note?: string | null;
    companions?: (typeof SAM)[];
    companionIds?: string[];
    place?: string | null;
  } = {},
) =>
  ({
    ...base(user, minutesAgo),
    kind: "CHECKED_IN",
    item: item(name),
    checkIn: {
      __typename: "ItemCheckIn",
      id: `k-${serial}`,
      score: extra.score ?? null,
      note: extra.note ?? null,
      tags: [],
      companionIds: extra.companionIds ?? [],
      place:
        extra.place === undefined || extra.place === null
          ? null
          : {
              __typename: "Place",
              id: "p1",
              name: extra.place,
              displayName: null,
            },
      companions: {
        edges: (extra.companions ?? []).map((node) => ({ node })),
      },
    },
  }) as unknown as FeedNode;

const ranked = (
  user: typeof SAM,
  minutesAgo: number,
  name: string,
  rank: number,
) =>
  ({
    ...base(user, minutesAgo),
    kind: "TIER_LISTED",
    rank,
    item: item(name),
    tierListItem: {
      __typename: "TierListItem",
      id: `t-${serial}`,
      tierListId: "l1",
      tierList: { __typename: "TierList", id: "l1", name: "Reds, ranked" },
    },
  }) as unknown as FeedNode;

const bursts = (nodes: FeedNode[]) =>
  groupBursts(feedEntriesFromNodes(nodes, VIEWER));

describe("sentences", () => {
  test("one of each kind reads as a sentence with its links", () => {
    const [add, rate, had, rank] = bursts([
      added(SAM, 1, "Barolo"),
      reviewed(ANA, 2, "Pliny", 4.5),
      drank(SAM, 3, "Lagavulin", { score: 4, place: "Old Mill" }),
      ranked(ANA, 4, "Barolo", 2),
    ]);
    assert.equal(
      sentenceText(add?.sentence ?? []),
      "Sam Lee added Barolo to Weekend Wines",
    );
    assert.deepEqual(
      add?.sentence.filter((t) => t.href !== undefined).map((t) => t.href),
      ["/beers/w-Barolo", "/cellars/c1/items"],
    );
    assert.equal(sentenceText(rate?.sentence ?? []), "Ana rated Pliny ★4.5");
    assert.equal(
      sentenceText(had?.sentence ?? []),
      "Sam Lee had Lagavulin · ★4 · at Old Mill",
    );
    assert.equal(
      sentenceText(rank?.sentence ?? []),
      "Ana ranked Barolo #2 in Reds, ranked",
    );
  });

  test("a drink the viewer was at says 'with you'", () => {
    const [had] = bursts([
      drank(SAM, 1, "Negroni", {
        companions: [{ ...ANA, id: VIEWER, displayName: "Riley" }, ANA],
        companionIds: [VIEWER, "ana"],
      }),
    ]);
    assert.equal(
      sentenceText(had?.sentence ?? []),
      "Sam Lee had Negroni · with you and Ana",
    );
  });

  test("a log's note is the line under it", () => {
    const [had] = bursts([
      drank(SAM, 1, "Negroni", { note: "Bitter, bright" }),
    ]);
    assert.equal(had?.detail, "Bitter, bright");
  });
});

describe("bursts", () => {
  test("a run of additions to one cellar is one line, linking the cellar", () => {
    const [burst, ...rest] = bursts([
      added(SAM, 1, "Barolo"),
      added(SAM, 5, "Barbaresco"),
      added(SAM, 9, "Chianti"),
      added(SAM, 12, "Brunello"),
    ]);
    assert.equal(rest.length, 0);
    assert.equal(burst?.entries.length, 4);
    assert.equal(
      sentenceText(burst?.sentence ?? []),
      "Sam Lee added 4 bottles to Weekend Wines",
    );
    assert.equal(burst?.detail, "Barolo, Barbaresco, Chianti and 1 more");
    assert.equal(burst?.href, "/cellars/c1/items");
  });

  test("ratings in a row become 'rated N things' with the scores listed", () => {
    const [burst] = bursts([
      reviewed(SAM, 1, "Barolo", 4.5),
      reviewed(SAM, 2, "Pliny", 4),
    ]);
    assert.equal(sentenceText(burst?.sentence ?? []), "Sam Lee rated 2 things");
    assert.equal(burst?.detail, "Barolo ★4.5 · Pliny ★4");
  });

  test("another person, another kind, another cellar, or a long gap breaks a burst", () => {
    const split = bursts([
      added(SAM, 1, "A"),
      added(ANA, 2, "B"),
      added(SAM, 3, "C"),
      reviewed(SAM, 4, "D", 3),
      added(SAM, 5, "E", { id: "c2", name: "Garage" }),
      added(SAM, 6 + BURST_WINDOW_MS / 60_000, "F", {
        id: "c2",
        name: "Garage",
      }),
    ]);
    assert.equal(split.length, 6);
  });

  test("a burst cut by a page boundary joins up when the next page lands", () => {
    const page1 = [added(SAM, 1, "A"), added(SAM, 2, "B")];
    const page2 = [added(SAM, 3, "C")];
    assert.equal(bursts(page1).length, 1);
    const joined = bursts([...page1, ...page2]);
    assert.equal(joined.length, 1);
    assert.equal(joined[0]?.entries.length, 3);
    assert.equal(joined[0]?.id, bursts(page1)[0]?.id);
  });
});
