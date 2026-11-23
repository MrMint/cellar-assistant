/**
 * Which tab is lit on the Me hub's own pages (H-17): /taste-profile is reached
 * from Me, so the Me tab stays lit there.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { activeTab } from "./nav";

describe("activeTab under Me", () => {
  test("/taste-profile lights the Me tab", () => {
    assert.equal(activeTab("/taste-profile"), "me");
    assert.equal(activeTab("/taste-profile/anything"), "me");
  });
});
