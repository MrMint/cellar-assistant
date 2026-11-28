/**
 * Which tab is lit on the Me hub's own pages (H-17): /taste-profile is reached
 * from Me, so the Me tab stays lit there.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { activeTab, litTab } from "./nav";

describe("activeTab under Me", () => {
  test("/taste-profile lights the Me tab", () => {
    assert.equal(activeTab("/taste-profile"), "me");
    assert.equal(activeTab("/taste-profile/anything"), "me");
  });
});

/**
 * F-171 (W3-5): the Recipes boards light only More on recipe routes, so the
 * tab bar and rail draw no tab current there; More's own rule
 * (`isMoreRoute`) lights it. The trail still puts recipes under Cellars.
 */
describe("the tab drawn current on recipe routes", () => {
  test("no tab is lit: More is", () => {
    assert.equal(litTab("/recipes"), undefined);
    assert.equal(litTab("/recipes/bar"), undefined);
    assert.equal(litTab("/recipes/r1"), undefined);
    assert.equal(litTab("/cellars/c1/items"), "cellars");
    assert.equal(litTab("/brands/b1"), "cellars");
    assert.equal(activeTab("/recipes/r1"), "cellars", "the trail's root");
  });
});
