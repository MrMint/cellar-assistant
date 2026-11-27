import { describe, expect, it } from "bun:test";
import type { MapDataItem, PlaceResult } from "../types";
import {
  categoryWords,
  directionsOf,
  distanceWords,
  kindCounts,
  matchesKinds,
  metersBetween,
  placeKind,
  placesInView,
  placeWhere,
} from "./map-places";

const place = (
  id: string,
  primary: string,
  [lng, lat]: [number, number],
  extra: Partial<PlaceResult> = {},
): PlaceResult => ({
  id,
  name: id,
  primary_category: primary,
  categories: [primary],
  location: { coordinates: [lng, lat] },
  ...extra,
});

describe("placeKind", () => {
  it("sorts a place into coffee, food, bar or other by its categories", () => {
    expect(placeKind(place("a", "coffee_shop", [0, 0]))).toBe("coffee");
    expect(placeKind(place("b", "cafe", [0, 0]))).toBe("coffee");
    expect(placeKind(place("c", "italian_restaurant", [0, 0]))).toBe("food");
    expect(placeKind(place("d", "wine_bar", [0, 0]))).toBe("bar");
    expect(placeKind(place("e", "brewery", [0, 0]))).toBe("bar");
    expect(placeKind(place("f", "grocery_store", [0, 0]))).toBe("other");
  });

  it("falls back to the other categories when the primary says nothing", () => {
    expect(
      placeKind(
        place("g", "point_of_interest", [0, 0], {
          categories: ["point_of_interest", "pub"],
        }),
      ),
    ).toBe("bar");
  });
});

describe("placesInView", () => {
  const bounds = { north: 1, south: -1, east: 1, west: -1 };
  const items: MapDataItem[] = [
    place("in", "cafe", [0.5, 0.5]),
    place("out", "cafe", [2, 0]),
    {
      is_cluster: true,
      cluster_id: 1,
      cluster_count: 3,
      cluster_center: { coordinates: [0, 0] },
    },
  ];

  it("keeps the places inside the bounds and drops clusters", () => {
    expect(placesInView(items, bounds).map((p) => p.id)).toEqual(["in"]);
  });

  it("keeps every place while the bounds are unknown", () => {
    expect(placesInView(items, null).map((p) => p.id)).toEqual(["in", "out"]);
  });

  it("orders the places nearest the origin first", () => {
    const near = place("near", "cafe", [0.001, 0]);
    const far = place("far", "cafe", [0.5, 0]);
    expect(
      placesInView([far, near], bounds, { latitude: 0, longitude: 0 }).map(
        (p) => p.id,
      ),
    ).toEqual(["near", "far"]);
  });
});

describe("kindCounts and matchesKinds", () => {
  const places = [
    place("a", "cafe", [0, 0]),
    place("b", "pub", [0, 0]),
    place("c", "cafe", [0, 0]),
  ];

  it("counts each kind", () => {
    expect(kindCounts(places)).toEqual({
      coffee: 2,
      food: 0,
      bar: 1,
      other: 0,
    });
  });

  it("matches every place when no kind is chosen", () => {
    expect(places.filter((p) => matchesKinds(p, []))).toHaveLength(3);
    expect(places.filter((p) => matchesKinds(p, ["bar"]))).toHaveLength(1);
  });
});

describe("distance words (KIT § 4: narrow no-break space before units)", () => {
  it("measures metres between two points", () => {
    const m = metersBetween(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0.01 },
    );
    expect(Math.round(m)).toBe(1112);
  });

  it("says Here within 25 m, metres under a kilometre, then km", () => {
    expect(distanceWords(12)).toBe("Here");
    expect(distanceWords(87)).toBe("90 m");
    expect(distanceWords(1234)).toBe("1.2 km");
    expect(distanceWords(23456)).toBe("23 km");
  });
});

describe("placeWhere", () => {
  it("joins the kind words and the distance from the origin", () => {
    const p = place("a", "coffee_shop", [0, 0.001]);
    expect(placeWhere(p, { latitude: 0, longitude: 0 })).toBe(
      "Coffee shop · 110 m",
    );
    expect(placeWhere(p, null)).toBe("Coffee shop");
  });

  it("names the category in sentence case", () => {
    expect(categoryWords("italian_restaurant")).toBe("Italian restaurant");
    expect(categoryWords("unknown")).toBe("Place");
  });
});

describe("directionsOf (ruling 5)", () => {
  it("goes to the street address when there is one", () => {
    const d = directionsOf(
      place("a", "cafe", [-88, 43], {
        street_address: "1 Main St",
        locality: "Tosa",
      }),
    );
    expect(d.label).toBe("Directions");
    expect(d.href).toContain("destination=1%20Main%20St%2C%20Tosa");
  });

  it("goes to the coordinates and says so without one", () => {
    const d = directionsOf(place("a", "cafe", [-88.1, 43.2]));
    expect(d.label).toBe("Directions to the pin");
    expect(d.href).toContain("destination=43.2%2C-88.1");
  });
});
