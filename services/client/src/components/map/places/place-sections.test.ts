import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { directionsTarget, hoursLines, type PlaceWhere } from "./PlaceSections";

const place = (extra: Partial<PlaceWhere> = {}): PlaceWhere => ({
  id: "p1",
  name: "Corner Tap",
  street_address: null,
  locality: "Portland",
  region: "OR",
  postcode: null,
  location: null,
  ...extra,
});

describe("directionsTarget", () => {
  test("the street address when there is one", () => {
    const target = directionsTarget(place({ street_address: "12 Main St" }));
    assert.equal(target.label, "Directions");
    assert.match(
      target.url,
      /destination=12%20Main%20St%2C%20Portland%2C%20OR$/,
    );
  });

  test("with no street address, the pin's coordinates, and says so (ruling 5)", () => {
    const target = directionsTarget(
      place({ location: { coordinates: [-122.68, 45.52] } }),
    );
    assert.equal(target.label, "Directions to the pin");
    assert.match(target.url, /destination=45\.52,-122\.68$/);
  });
});

describe("hoursLines", () => {
  test("Google's weekday lines as they are", () => {
    assert.deepEqual(
      hoursLines({ weekdayDescriptions: ["Monday: 9 AM – 5 PM"] }),
      ["Monday: 9 AM – 5 PM"],
    );
  });

  test("periods become a line per day, with Closed for the rest", () => {
    const lines = hoursLines({
      periods: [
        { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17 } },
      ],
    });
    assert.equal(lines.length, 7);
    assert.equal(lines[1], "Monday: 9:00 AM – 5:00 PM");
    assert.equal(lines[0], "Sunday: Closed");
  });

  test("nothing to show is no lines, so Info hides", () => {
    assert.deepEqual(hoursLines(null), []);
    assert.deepEqual(hoursLines(""), []);
  });
});
