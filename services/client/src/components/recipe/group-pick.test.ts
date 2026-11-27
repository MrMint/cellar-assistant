import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { shownVersion } from "./group-pick";

const versions = [
  { id: "top", createdAt: "2026-03-01T00:00:00Z" },
  { id: "original", createdAt: "2026-01-01T00:00:00Z" },
  { id: "late", createdAt: "2026-05-01T00:00:00Z" },
];

describe("shownVersion (MC-pick)", () => {
  test("the community pick is shown, labelled as the pick", () => {
    assert.deepEqual(shownVersion("late", versions), {
      id: "late",
      isPick: true,
    });
  });

  test("no pick: the original (oldest), never the vote leader", () => {
    // `top` is first in the API's order (the canonical, which the author's
    // own votes can move); the page still shows the original.
    assert.deepEqual(shownVersion(null, versions), {
      id: "original",
      isPick: false,
    });
  });

  test("a pick the viewer can't see falls back to the original", () => {
    assert.deepEqual(shownVersion("hidden", versions), {
      id: "original",
      isPick: false,
    });
  });

  test("no versions: nothing to show; missing dates keep the API's order", () => {
    assert.equal(shownVersion(null, []), null);
    assert.deepEqual(
      shownVersion(null, [{ id: "a" }, { id: "b", createdAt: null }]),
      { id: "a", isPick: false },
    );
  });
});
