import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ownListEntries } from "./own-list-entries";
import type { PlaceListEntry } from "./PlaceSections";
import { planBandChange, planRemove } from "./place-entry-edit";

const mine: PlaceListEntry = {
  id: "e1",
  band: 4,
  tier_list: { id: "my-list", name: "Cafes" },
};
const friends: PlaceListEntry = {
  id: "e2",
  band: 5,
  tier_list: { id: "friend-list", name: "Their bars" },
};
const owners = new Map([
  ["my-list", "me"],
  ["friend-list", "friend"],
]);
const own = ownListEntries([mine, friends], owners, "me");
const rows = [
  { id: "a", band: 5 },
  { id: "e1", band: 4 },
  { id: "b", band: 4 },
  { id: "c", band: 3 },
];

describe("Change the band from the place's More sheet (F-201)", () => {
  test("moves my entry to the end of the chosen band, one call on my list", () => {
    assert.deepEqual(planBandChange(own, "e1", rows, 5), {
      tierListId: "my-list",
      call: { band: 5, orderedIds: ["a", "e1"] },
      band: 5,
      rank: 2,
    });
  });

  test("never writes to a list I don't own", () => {
    assert.equal(planBandChange(own, "e2", rows, 3), null);
  });

  test("choosing the band it is already in writes nothing", () => {
    assert.equal(planBandChange(own, "e1", rows, 4), null);
  });
});

describe("Remove from list from the place's More sheet (F-201)", () => {
  test("removes my entry from my list", () => {
    assert.deepEqual(planRemove(own, "e1"), {
      tierListId: "my-list",
      id: "e1",
    });
  });

  test("never removes from a list I don't own", () => {
    assert.equal(planRemove(own, "e2"), null);
    // Unknown owners (not read yet) count as not mine.
    assert.equal(
      planRemove(ownListEntries([mine], new Map(), "me"), "e1"),
      null,
    );
  });
});
