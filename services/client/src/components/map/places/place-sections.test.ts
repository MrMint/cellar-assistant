import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ownListEntries } from "./own-list-entries";
import {
  directionsTarget,
  hoursLines,
  type PlaceListEntry,
  type PlaceWhere,
} from "./PlaceSections";

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

describe("ownListEntries (CC-3)", () => {
  // The viewer's own list, a friend's and a public list, all ranking it:
  // `Place.tierListEntries` is every list the viewer may see.
  const entries: PlaceListEntry[] = [
    {
      id: "e-friend",
      band: 5,
      tier_list: { id: "t-friend", name: "Ana's bars" },
    },
    {
      id: "e-public",
      band: 4,
      tier_list: { id: "t-public", name: "Best taps" },
    },
    { id: "e-mine", band: 3, tier_list: { id: "t-mine", name: "My bars" } },
    { id: "e-gone", band: 2, tier_list: null },
  ];
  const owners = new Map([
    ["t-friend", "u-friend"],
    ["t-public", "u-stranger"],
    ["t-mine", "u-me"],
  ]);

  test("keeps only lists the viewer made, in order", () => {
    assert.deepEqual(
      ownListEntries(entries, owners, "u-me").map((entry) => entry.id),
      ["e-mine"],
    );
  });

  test("a friend's or a public list is never shown as the viewer's", () => {
    assert.deepEqual(ownListEntries(entries.slice(0, 2), owners, "u-me"), []);
  });

  test("shows nothing while the viewer or an owner is unknown", () => {
    assert.deepEqual(ownListEntries(entries, owners, null), []);
    assert.deepEqual(ownListEntries(entries, new Map(), "u-me"), []);
  });
});
