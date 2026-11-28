import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { MapDataItem, PlaceResult } from "../types";
import {
  beyondView,
  extentOf,
  firstView,
  listChip,
  pointsFrom,
} from "./own-places";

const place = (id: string, lng: number, lat: number): PlaceResult => ({
  id,
  name: id,
  primary_category: "cafe",
  categories: ["cafe"],
  location: { coordinates: [lng, lat] },
});

// Two places in town and a cluster of 5 to the east; the view is 150 km off.
const items: MapDataItem[] = [
  place("a", -89.4, 43.07),
  place("b", -89.38, 43.08),
  {
    is_cluster: true,
    cluster_id: 1,
    cluster_count: 5,
    cluster_center: { coordinates: [-89.3, 43.1] },
  },
];
const points = pointsFrom(items);
const farView = { north: 45, south: 44, east: -89, west: -90 };

describe("your places beyond this view (F-33, F-34)", () => {
  test("counts every one of yours outside the view, clusters by their size", () => {
    assert.equal(beyondView(points, farView).total, 7);
    assert.equal(
      beyondView(points, { north: 44, south: 43, east: -89, west: -90 }).total,
      0,
    );
  });

  test("names the edge each lies past (desktop's edge arrows)", () => {
    const view = { north: 43.09, south: 43.0, east: -89.35, west: -89.45 };
    const beyond = beyondView(points, view);
    assert.equal(beyond.total, 5);
    assert.deepEqual(beyond.edges, { left: 0, right: 5, up: 0, down: 0 });
    assert.deepEqual(beyondView(points, farView).edges, {
      left: 0,
      right: 0,
      up: 0,
      down: 7,
    });
  });

  test("the extent holds them all", () => {
    assert.deepEqual(extentOf(points), {
      west: -89.4,
      east: -89.3,
      south: 43.07,
      north: 43.1,
    });
    assert.equal(extentOf([]), null);
  });
});

describe("the map's first view (F-33, F-191)", () => {
  const extent = extentOf(points);

  test("with no location, it opens on your places, not 150 km away", () => {
    assert.deepEqual(firstView({ extent, located: false, list: false }), {
      kind: "fit",
      bounds: extent,
    });
  });

  test("with a location, it stays on you; a list's link always opens on the list", () => {
    assert.equal(firstView({ extent, located: true, list: false }), null);
    assert.deepEqual(firstView({ extent, located: true, list: true }), {
      kind: "fit",
      bounds: extent,
    });
  });

  test("one place is a centre, not a zero-size box", () => {
    const one = extentOf(pointsFrom([place("a", -89.4, 43.07)]));
    assert.deepEqual(firstView({ extent: one, located: false, list: false }), {
      kind: "center",
      longitude: -89.4,
      latitude: 43.07,
    });
    assert.equal(firstView({ extent: null, located: false, list: true }), null);
  });
});

describe("the list chip for /map?list= (F-191, CC-6)", () => {
  test("a friend's list is named, and Mine is not lit for it", () => {
    assert.deepEqual(
      listChip({
        listId: "L",
        list: { name: "Their bars", createdById: "friend" },
        viewerId: "me",
      }),
      { name: "Their bars", mine: false },
    );
  });

  test("my own list is named too, and counts as mine", () => {
    assert.deepEqual(
      listChip({
        listId: "L",
        list: { name: "Cafes", createdById: "me" },
        viewerId: "me",
      }),
      { name: "Cafes", mine: true },
    );
  });

  test("no list link, no chip; a list not read yet is a plain 'List'", () => {
    assert.equal(listChip({ listId: null, list: null, viewerId: "me" }), null);
    assert.deepEqual(listChip({ listId: "L", list: null, viewerId: "me" }), {
      name: "List",
      mine: false,
    });
  });
});
