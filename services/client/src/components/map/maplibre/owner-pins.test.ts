import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { MapDataItem, PlaceResult } from "../types";
import { splitOwnerPins } from "./owner-pins";

const place = (id: string, extra: Partial<PlaceResult> = {}): PlaceResult => ({
  id,
  name: id,
  primary_category: "cafe",
  categories: ["cafe"],
  location: { coordinates: [0, 0] },
  ...extra,
});

describe("the owner's pins (F-196)", () => {
  test("a place on one of my lists, in a band, draws as my pin, not a plain one", () => {
    const items: MapDataItem[] = [
      place("ranked", { my_band: 4, photo_url: "https://x/p.jpg" }),
      place("unrated", { my_band: 0 }),
      place("public"),
      {
        is_cluster: true,
        cluster_id: 1,
        cluster_count: 3,
        cluster_center: { coordinates: [0, 0] },
      },
    ];
    const { owner, rest } = splitOwnerPins(items);
    assert.deepEqual(
      owner.map((pin) => [pin.place.id, pin.band]),
      [["ranked", 4]],
    );
    assert.deepEqual(
      rest.map((item) => ("is_cluster" in item ? "cluster" : item.id)),
      ["unrated", "public", "cluster"],
    );
  });

  test("the pin carries the photo and the public rating with its count", () => {
    const [pin] = splitOwnerPins([
      place("p", {
        my_band: 5,
        photo_url: "https://x/p.jpg",
        rating: 4.62,
        rating_count: 210,
      }),
    ]).owner;
    assert.equal(pin?.photo, "https://x/p.jpg");
    assert.equal(pin?.rating, "4.6");
    assert.equal(pin?.label, "p, Outstanding, rated 4.6 from 210");
  });

  test("no rating, no rating words", () => {
    const [pin] = splitOwnerPins([place("p", { my_band: 2 })]).owner;
    assert.equal(pin?.rating, null);
    assert.equal(pin?.photo, null);
    assert.equal(pin?.label, "p, Mediocre");
  });
});
