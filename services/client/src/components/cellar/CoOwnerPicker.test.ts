/**
 * The co-owner picker's search matches friends by name only. Each cmdk item's
 * `value` is the friend's id, and cmdk's default fuzzy filter would score
 * that uuid as well, so a short query kept nearly everyone in the list.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { defaultFilter } from "cmdk";
import { matchFriendName } from "./CoOwnerPicker";

const id = "3fca2b9e-0c1d-4e5f-a6b7-c8d9e0f1a2b3";

describe("CoOwnerPicker search", () => {
  test("the default filter would match a uuid the name does not contain", () => {
    // The reason for a custom filter: "ca" is in no part of "Bo Lindqvist",
    // but it is a subsequence of the id.
    assert.ok(defaultFilter(id, "ca", ["Bo Lindqvist"]) > 0);
    assert.equal(matchFriendName(id, "ca", ["Bo Lindqvist"]), 0);
  });

  test("a name containing the query matches, case aside", () => {
    assert.equal(matchFriendName(id, "lind", ["Bo Lindqvist"]), 1);
    assert.equal(matchFriendName(id, "  BO ", ["Bo Lindqvist"]), 1);
  });

  test("an empty query keeps everyone", () => {
    assert.equal(matchFriendName(id, "", ["Bo Lindqvist"]), 1);
    assert.equal(matchFriendName(id, "   ", []), 1);
  });

  test("no keywords, no match for a real query", () => {
    assert.equal(matchFriendName(id, "bo", []), 0);
    assert.equal(matchFriendName(id, "bo"), 0);
  });
});
