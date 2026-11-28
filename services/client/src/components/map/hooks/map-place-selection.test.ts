import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { urlClosedPlace } from "./useMapPlaceSelection";

describe("the URL closing the open place (F-190)", () => {
  test("a pick whose ?placeId= has not landed yet does not close it", () => {
    // Desktop: the pane opened on the pick, and the URL's placeId was still
    // null for a render; closing on that closed the pane at once.
    assert.equal(urlClosedPlace(null, null), false);
  });

  test("Back, taking ?placeId= away, closes it", () => {
    assert.equal(urlClosedPlace("p1", null), true);
  });

  test("a placeId arriving or changing never closes it", () => {
    assert.equal(urlClosedPlace(null, "p1"), false);
    assert.equal(urlClosedPlace("p1", "p2"), false);
    assert.equal(urlClosedPlace("p1", "p1"), false);
  });
});
