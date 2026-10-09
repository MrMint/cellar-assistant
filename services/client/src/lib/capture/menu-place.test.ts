import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  formatDistance,
  menuPlaceHint,
  nearestKnownPlace,
  otherPlaces,
  SUGGEST_WITHIN_METERS,
} from "./menu-place.ts";

const cork = { id: "cork", name: "Cork & Barrel", distanceMeters: 40 };
const mill = { id: "mill", name: "Old Mill", distanceMeters: 900 };
const ember = { id: "ember", name: "Ember", distanceMeters: 120 };

describe("the menu's place (X06)", () => {
  test("the nearest known place is asked about, in any order", () => {
    assert.equal(nearestKnownPlace([mill, ember, cork])?.id, "cork");
  });

  test("nothing is asked about when the nearest is too far to be here", () => {
    assert.equal(nearestKnownPlace([mill]), null);
    assert.equal(nearestKnownPlace([]), null);
    assert.equal(
      nearestKnownPlace([{ ...mill, distanceMeters: SUGGEST_WITHIN_METERS }])
        ?.id,
      "mill",
    );
  });

  test("a distance that is not a number is never the nearest", () => {
    assert.equal(
      nearestKnownPlace([{ ...cork, distanceMeters: Number.NaN }, ember])?.id,
      "ember",
    );
  });

  test("the picker lists the others nearest first, without the guess", () => {
    assert.deepEqual(
      otherPlaces([mill, cork, ember], "cork").map((p) => p.id),
      ["ember", "mill"],
    );
    assert.deepEqual(
      otherPlaces([mill, cork], null).map((p) => p.id),
      ["cork", "mill"],
    );
  });

  test("a confirmed place is the placeId; the same guess is not repeated", () => {
    assert.deepEqual(
      menuPlaceHint({
        confirmed: cork,
        nearest: cork,
        location: { latitude: 43.07, longitude: -89.38 },
      }),
      { placeId: "cork", latitude: 43.07, longitude: -89.38 },
    );
  });

  test("a guess passed over rides along only as the estimate", () => {
    assert.deepEqual(
      menuPlaceHint({ confirmed: ember, nearest: cork, location: null }),
      { placeId: "ember", estimatedPlaceId: "cork" },
    );
    assert.deepEqual(
      menuPlaceHint({ confirmed: null, nearest: null, location: null }),
      {},
    );
  });

  test("distances read like a phone's", () => {
    assert.equal(formatDistance(3), "10 m");
    assert.equal(formatDistance(347), "350 m");
    assert.equal(formatDistance(1234), "1.2 km");
    assert.equal(formatDistance(12_400), "12 km");
    assert.equal(formatDistance(Number.NaN), "");
  });
});
