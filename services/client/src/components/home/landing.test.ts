/**
 * Home's small decisions (`landing.ts`): the count line, the new-person
 * Home, "Rate the n", and the 25 m rule.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  bottleCountLine,
  formatMetres,
  isNewPerson,
  placeYouAreAt,
  rateLabel,
} from "./landing";

const stats = (wine: number, beer = 0) => ({
  itemCounts: { wine, beer, spirit: 0, coffee: 0, sake: 0, tea: 0 },
});

describe("the count line and the new person (CROSS-LOT 3)", () => {
  test("a new person's Home shows no count at all, never 0", () => {
    assert.equal(isNewPerson(stats(0)), true);
    assert.equal(bottleCountLine(stats(0)), null);
  });

  test("everyone else's counts every kind", () => {
    assert.equal(isNewPerson(stats(1)), false);
    assert.equal(bottleCountLine(stats(1)), "1 bottle");
    assert.equal(bottleCountLine(stats(1200, 40)), "1,240 bottles");
  });
});

describe("rateLabel", () => {
  test("Rate the n, Rate it, or nothing", () => {
    assert.equal(rateLabel(15), "Rate the 15");
    assert.equal(rateLabel(1), "Rate it");
    assert.equal(rateLabel(0), null);
  });
});

describe("placeYouAreAt (DECISIONS 23)", () => {
  // About 0.0001° of latitude is 11 m.
  const here = { lat: 43.05, lng: -88.0 };
  const place = (id: string, dLat: number) => ({
    id,
    coordinates: [here.lng, here.lat + dLat] as [number, number],
  });

  test("the nearest place within 25 m is where you are", () => {
    const at = placeYouAreAt(
      [place("far", 0.01), place("close", 0.0002), place("closest", 0.0001)],
      here,
    );
    assert.equal(at?.place.id, "closest");
  });

  test("nothing within 25 m: not at a place", () => {
    assert.equal(placeYouAreAt([place("31m", 0.00028)], here), null);
  });

  test("distances in the kit's form: a narrow no-break space before the unit", () => {
    assert.equal(formatMetres(21.4), "21 m");
    assert.equal(formatMetres(1234), "1.2 km");
  });
});
