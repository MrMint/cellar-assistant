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

/**
 * F-171 (W3-5): the Recipes boards light only More on recipe routes, so no
 * tab claims them; More's own rule (`isMoreRoute`) lights it.
 */
describe("activeTab on recipe routes", () => {
  test("no tab is lit: More is", () => {
    assert.equal(activeTab("/recipes"), undefined);
    assert.equal(activeTab("/recipes/bar"), undefined);
    assert.equal(activeTab("/recipes/r1"), undefined);
    assert.equal(activeTab("/cellars/c1/items"), "cellars");
    assert.equal(activeTab("/brands/b1"), "cellars");
  });
});
