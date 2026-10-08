/**
 * The rankings adapters: the scope control (N15), the card's score/count
 * source (pinned against `82450ad1`'s `RankingsClient`), rank numerals, and
 * the empty states.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  RANKING_SEGMENTS,
  rankingRowFromEntry,
  rankingsCacheKey,
  rankingsEmptyState,
  scopeOfSegment,
  segmentFromParam,
  withRanks,
} from "./adapter";

describe("the scope control (N15: Me · Friends · Everyone, Me by default)", () => {
  test("three labelled segments in that order, each a server scope", () => {
    assert.deepEqual(
      RANKING_SEGMENTS.map((s) => [s.label, s.scope]),
      [
        ["Me", "ME"],
        ["Friends", "FRIENDS"],
        ["Everyone", "EVERYONE"],
      ],
    );
  });
  test("?scope= is untrusted: absent, unknown or the old JSON is Me", () => {
    assert.equal(segmentFromParam(null), "me");
    assert.equal(segmentFromParam(undefined), "me");
    assert.equal(segmentFromParam(""), "me");
    assert.equal(segmentFromParam("ME_AND_FRIENDS"), "me");
    assert.equal(segmentFromParam('["FRIENDS"]'), "me");
    assert.equal(segmentFromParam("friends"), "friends");
    assert.equal(segmentFromParam("everyone"), "everyone");
  });
  test("segment → scope", () => {
    assert.equal(scopeOfSegment("me"), "ME");
    assert.equal(scopeOfSegment("friends"), "FRIENDS");
    assert.equal(scopeOfSegment("everyone"), "EVERYONE");
  });
});

describe("withRanks", () => {
  test("1-based, in board order", () => {
    assert.deepEqual(
      withRanks([{ id: "a" }, { id: "b" }, { id: "c" }]).map((r) => r.rank),
      [1, 2, 3],
    );
  });
});

describe("rankingRowFromEntry", () => {
  const entry = {
    __typename: "RankingEntry",
    itemId: "s1",
    itemType: "SAKE",
    score: 4.5,
    reviewCount: 3,
    item: {
      __typename: "Sake",
      id: "s1",
      type: "SAKE",
      name: "Dassai 23",
      isFavorite: false,
      favoriteCount: 2,
      myReview: null,
      score: { average: 3.1, count: 40 },
      images: { edges: [] },
      brands: {
        edges: [{ node: { isPrimary: true, brand: { name: "Asahi Shuzo" } } }],
      },
      vintageYear: 2021,
      category: "JUNMAI_DAIGINJO",
    },
  };

  test("a sake ranks (the old fragments had none), scored by the scope", () => {
    const row = rankingRowFromEntry(entry as never);
    assert.equal(row.type, "SAKE");
    assert.equal(row.item.id, "s1");
    assert.equal(row.item.name, "Dassai 23");
    assert.equal(row.item.vintage, "2021");
    // The scope's average and count, as the old card took x.score / x.count.
    assert.equal(row.item.score, 4.5);
    assert.equal(row.item.reviewCount, 3);
    assert.equal(row.item.favoriteCount, 2);
    assert.equal(row.item.reviewed, false);
    assert.match(row.item.subtitle ?? "", /^Asahi Shuzo · /);
  });
});

describe("rankingsEmptyState (one line, one action)", () => {
  test("Me with nothing rated points at something to rate", () => {
    const me = rankingsEmptyState("me", true, false);
    assert.equal(me.title, "Nothing rated yet.");
    assert.deepEqual(me.action, {
      label: "Find something to rate",
      href: "/search",
    });
  });
  test("no friends and friends-without-reviews read differently", () => {
    const none = rankingsEmptyState("friends", false, false);
    const quiet = rankingsEmptyState("friends", true, false);
    assert.notEqual(none.title, quiet.title);
    assert.equal(none.action?.href, "/friends");
    assert.equal(quiet.action, null);
  });
  test("a type filter explains an empty board before the scope does", () => {
    assert.match(rankingsEmptyState("me", true, true).title, /those types/);
  });
});

test("rankingsCacheKey keeps scroll restore per filter", () => {
  assert.equal(rankingsCacheKey(undefined, "me"), "rankings-all-me");
  assert.equal(
    rankingsCacheKey(["WINE", "BEER"], "friends"),
    "rankings-WINE,BEER-friends",
  );
});
