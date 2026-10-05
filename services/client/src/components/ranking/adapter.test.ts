/**
 * The rankings adapters, pinned against what `82450ad1`'s `RankingsClient`
 * computed: the toggles' meaning, the card's score/count source, and the
 * empty states the scope enum made necessary.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseReviewersParam } from "@/utilities/reviewers-param";
import {
  rankingRowFromEntry,
  rankingsCacheKey,
  rankingsEmptyMessage,
  scopeFromReviewers,
} from "./adapter";

describe("scopeFromReviewers (the old toggles → RankingScope)", () => {
  test("the four states, one-for-one", () => {
    assert.equal(scopeFromReviewers([]), "EVERYONE");
    assert.equal(scopeFromReviewers(undefined), "EVERYONE");
    assert.equal(scopeFromReviewers(["ME"]), "ME");
    assert.equal(scopeFromReviewers(["FRIENDS"]), "FRIENDS");
    assert.equal(scopeFromReviewers(["FRIENDS", "ME"]), "ME_AND_FRIENDS");
  });
});

describe("parseReviewersParam (the old ?reviewers= JSON, untrusted)", () => {
  test("production links still filter", () => {
    assert.deepEqual(parseReviewersParam('["ME","FRIENDS"]'), [
      "ME",
      "FRIENDS",
    ]);
  });
  test("bad input is no filter, not a crash; unknowns and repeats drop", () => {
    assert.deepEqual(parseReviewersParam("[ME"), []);
    assert.deepEqual(parseReviewersParam('{"ME":1}'), []);
    assert.deepEqual(parseReviewersParam(null), []);
    assert.deepEqual(parseReviewersParam('["ME","x","ME"]'), ["ME"]);
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

describe("rankingsEmptyMessage", () => {
  test("the old message outside a friends scope", () => {
    assert.equal(rankingsEmptyMessage("EVERYONE", false), "No rankings found");
    assert.equal(rankingsEmptyMessage("ME", true), "No rankings found");
  });
  test("no friends and friends-without-reviews read differently", () => {
    const none = rankingsEmptyMessage("FRIENDS", false);
    const quiet = rankingsEmptyMessage("FRIENDS", true);
    assert.match(none, /no friends yet/);
    assert.match(quiet, /friends have not reviewed/);
    assert.notEqual(none, quiet);
    assert.match(rankingsEmptyMessage("ME_AND_FRIENDS", false), /no friends/);
  });
});

test("rankingsCacheKey keeps scroll restore per filter", () => {
  assert.equal(rankingsCacheKey(undefined, undefined), "rankings-all-all");
  assert.equal(
    rankingsCacheKey(["WINE", "BEER"], ["ME"]),
    "rankings-WINE,BEER-ME",
  );
});
