import { describe, expect, it } from "bun:test";
import { kindsFromUrl, tierListIdsFromUrl } from "./map-url";

describe("tierListIdsFromUrl (L40: /map?list=<id>)", () => {
  it("reads a tier list's map link into the map's tierListIds", () => {
    expect(tierListIdsFromUrl({ list: "list-1", tierLists: [] })).toEqual([
      "list-1",
    ]);
  });

  it("keeps the older tierLists param and adds the list once", () => {
    expect(tierListIdsFromUrl({ list: "b", tierLists: ["a", "b"] })).toEqual([
      "a",
      "b",
    ]);
    expect(tierListIdsFromUrl({ list: "c", tierLists: ["a"] })).toEqual([
      "a",
      "c",
    ]);
  });

  it("ignores an empty or missing list", () => {
    expect(tierListIdsFromUrl({ list: null, tierLists: ["a"] })).toEqual(["a"]);
    expect(tierListIdsFromUrl({ list: "  ", tierLists: [] })).toEqual([]);
  });
});

describe("kindsFromUrl", () => {
  it("keeps the chips' kinds in the board's order and drops the rest", () => {
    expect(kindsFromUrl(["bar", "wine", "coffee"])).toEqual(["coffee", "bar"]);
    expect(kindsFromUrl([])).toEqual([]);
  });
});
