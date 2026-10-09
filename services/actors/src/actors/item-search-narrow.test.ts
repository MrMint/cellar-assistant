/**
 * `narrowToNamed` (X12) — pure, so its edges are pinned here without a
 * database; `item-search-actor.test.ts` drives it through the actor.
 */
import type { ItemSearchHit } from "@cellar-assistant/contracts";
import {
  ITEM_SEARCH_NARROW_DISTANCE_GAP,
  ITEM_SEARCH_NARROW_STRONG_NAME,
} from "@cellar-assistant/contracts";
import { describe, expect, it } from "vitest";
import { LEXICAL_THRESHOLD, narrowToNamed } from "./item-search-actor.ts";

const hit = (
  id: string,
  distance: number | null,
  lexicalSimilarity: number | null,
): ItemSearchHit => ({
  type: "SPIRIT",
  id,
  name: id,
  distance,
  lexicalSimilarity,
});

const ids = (hits: readonly ItemSearchHit[]) => hits.map((h) => h.id);

describe("narrowToNamed (X12)", () => {
  it("returns every hit when no name matches strongly", () => {
    const hits = [
      hit("makers-46", 0.25, 0),
      hit("buffalo-trace", 0.31, 0.5),
      hit("wild-turkey", 0.31, 0.05),
    ];
    expect(ids(narrowToNamed(hits))).toEqual(ids(hits));
  });

  it("keeps name matches and hits within the gap of the named one, in order", () => {
    const hits = [
      hit("eh-taylor", 0.359, 0.06),
      hit("buffalo-trace", 0.371, 1),
      hit("eagle-rare-17", 0.382, 0),
      hit("lagavulin-8", 0.6, 0.77),
      hit("monkey-47", 0.54, 0),
    ];
    expect(ids(narrowToNamed(hits))).toEqual([
      "eh-taylor",
      "buffalo-trace",
      "eagle-rare-17",
      "lagavulin-8",
    ]);
  });

  it("measures the gap from the nearest strong name hit", () => {
    const anchor = 0.3;
    const hits = [
      hit("far-named", 0.5, 1),
      hit("near-named", anchor, ITEM_SEARCH_NARROW_STRONG_NAME),
      hit("inside", anchor + ITEM_SEARCH_NARROW_DISTANCE_GAP - 0.001, 0),
      hit("outside", anchor + ITEM_SEARCH_NARROW_DISTANCE_GAP + 0.001, 0),
    ];
    expect(ids(narrowToNamed(hits))).toEqual([
      "far-named",
      "near-named",
      "inside",
    ]);
  });

  it("keeps a weaker name match at the lexical threshold, drops one below", () => {
    const hits = [
      hit("named", 0.3, 1),
      hit("at-threshold", 0.9, LEXICAL_THRESHOLD),
      hit("below", 0.9, LEXICAL_THRESHOLD - 0.01),
    ];
    expect(ids(narrowToNamed(hits))).toEqual(["named", "at-threshold"]);
  });

  it("narrows to the name matches alone when the named item has no vector", () => {
    const hits = [
      hit("unembedded", null, 1),
      hit("nearest", 0.01, 0),
      hit("sibling", null, 0.7),
    ];
    expect(ids(narrowToNamed(hits))).toEqual(["unembedded", "sibling"]);
  });
});
