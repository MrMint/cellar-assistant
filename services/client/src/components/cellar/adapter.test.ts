/**
 * The cellars adapters: new API shapes → the old components' props, pinned
 * against what `82450ad1`'s `Cellars.tsx`, `EditCellarClient.tsx` and the
 * items page computed from the Hasura rows.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  canAddToCellar,
  cellarBottleHref,
  cellarCardFromSource,
  cellarCardItemCounts,
  cellarGridItemFromSource,
  editCoOwnerOptions,
  userFromProfile,
} from "./adapter";
import {
  CELLAR_SORTS,
  CELLAR_STATUSES,
  type CellarSort,
  type CellarStatus,
  cellarItemsCacheKey,
  cellarItemsVariables,
  ITEMS_PAGE_SIZE,
  parseCellarSort,
  parseCellarStatus,
  parseItemTypes,
} from "./cellarItemsQuery";
import { virtualTotal } from "./virtualTotal";

const ana = { id: "u-ana", displayName: "Ana", avatarUrl: "https://a/ana.png" };
const bo = { id: "u-bo", displayName: "Bo", avatarUrl: null };
const cy = { id: "u-cy", displayName: "Cy" };

describe("cellarCardFromSource (old Cellars.tsx mapping)", () => {
  test("creator, co-owners in order, plural counts", () => {
    assert.deepEqual(
      cellarCardFromSource({
        id: "c1",
        name: "Basement",
        createdById: "u-ana",
        createdBy: ana,
        coOwners: { edges: [{ node: bo }, { node: cy }] },
        itemCounts: { wine: 3, beer: 0, spirit: 1, coffee: 0, sake: 2, tea: 5 },
      }),
      {
        id: "c1",
        name: "Basement",
        createdBy: ana,
        coOwners: [
          { id: "u-bo", displayName: "Bo", avatarUrl: "" },
          { id: "u-cy", displayName: "Cy", avatarUrl: "" },
        ],
        itemCounts: {
          wines: 3,
          beers: 0,
          spirits: 1,
          coffees: 0,
          sakes: 2,
          teas: 5,
        },
      },
    );
  });

  test("a missing creator profile keeps the creator's id, so canEdit holds", () => {
    const card = cellarCardFromSource({
      id: "c1",
      name: "X",
      createdById: "u-ana",
      createdBy: null,
    });
    assert.deepEqual(card.createdBy, {
      id: "u-ana",
      displayName: "",
      avatarUrl: "",
    });
    assert.deepEqual(card.coOwners, []);
  });

  test("missing counts are zero, as `?.count ?? 0` made them", () => {
    assert.deepEqual(cellarCardItemCounts(null), {
      wines: 0,
      beers: 0,
      spirits: 0,
      coffees: 0,
      sakes: 0,
      teas: 0,
    });
    assert.equal(cellarCardItemCounts({ wine: null }).wines, 0);
  });

  test("a null avatar becomes the old non-null empty string", () => {
    assert.equal(userFromProfile(bo).avatarUrl, "");
    assert.equal(userFromProfile(ana).avatarUrl, ana.avatarUrl);
  });
});

describe("canAddToCellar (old items page canAdd)", () => {
  const cellar = { createdById: "u-ana", coOwnerIds: ["u-bo"] };
  test("creator and co-owner may; anyone else and nobody may not", () => {
    assert.equal(canAddToCellar(cellar, "u-ana"), true);
    assert.equal(canAddToCellar(cellar, "u-bo"), true);
    assert.equal(canAddToCellar(cellar, "u-cy"), false);
    assert.equal(canAddToCellar(cellar, null), false);
  });
});

describe("editCoOwnerOptions (old EditCellarClient options)", () => {
  test("friends then the viewer, minus the creator", () => {
    assert.deepEqual(
      editCoOwnerOptions({
        friends: [ana, cy],
        viewer: bo,
        createdById: "u-ana",
        coOwners: [],
      }).map((o) => o.id),
      ["u-cy", "u-bo"],
    );
  });

  test("a co-owner who is no longer a friend is still an option, once", () => {
    const options = editCoOwnerOptions({
      friends: [cy],
      viewer: ana,
      createdById: "u-ana",
      coOwners: [bo, cy],
    });
    assert.deepEqual(
      options.map((o) => o.id),
      ["u-cy", "u-bo"],
    );
    assert.equal(options[1]?.displayName, "Bo", "by name, not by id");
  });
});

describe("cellarGridItemFromSource + cellarBottleHref", () => {
  const cell = cellarGridItemFromSource({
    id: "bottle-1",
    item: { id: "item-9", type: "SPIRIT", name: "Laphroaig" },
  });

  test("card id is the bottle, itemId the catalog item (decision 1)", () => {
    assert.equal(cell.type, "SPIRIT");
    assert.equal(cell.item.id, "bottle-1");
    assert.equal(cell.item.itemId, "item-9");
  });

  test("href is absolute, and on the bottle id (decision 1)", () => {
    assert.equal(cellarBottleHref("c1", cell), "/cellars/c1/spirits/bottle-1");
  });

  test("the bottle's own state rides along; a missing level is full", () => {
    assert.deepEqual(cell.bottle, {
      openAt: null,
      emptyAt: null,
      percentageRemaining: 100,
    });
    const open = cellarGridItemFromSource({
      id: "b2",
      item: { id: "i", type: "WINE", name: "W" },
      openAt: "2026-10-01T00:00:00.000Z",
      emptyAt: null,
      percentageRemaining: 35,
    });
    assert.deepEqual(open.bottle, {
      openAt: "2026-10-01T00:00:00.000Z",
      emptyAt: null,
      percentageRemaining: 35,
    });
  });

  test("the bottle's chosen photo beats the item's first image (G15)", () => {
    const withImages = {
      id: "i",
      type: "WINE" as const,
      name: "W",
      images: {
        edges: [
          { node: { placeholder: "item", file: { url: "https://f/item" } } },
        ],
      },
    };
    const own = cellarGridItemFromSource({
      id: "b",
      item: withImages,
      displayImage: { placeholder: "own", file: { url: "https://f/own" } },
    });
    assert.equal(own.item.displayImageUrl, "https://f/own");
    assert.equal(own.item.placeholder, "own");
    const fallback = cellarGridItemFromSource({
      id: "b",
      item: withImages,
      displayImage: null,
    });
    assert.equal(fallback.item.displayImageUrl, "https://f/item");
  });
});

describe("cellarItemsVariables (first page and later pages agree)", () => {
  test("no search: open first, in the cellar, no semantic query, no filter", () => {
    assert.deepEqual(
      cellarItemsVariables("c1", { search: "", types: [] }, null),
      {
        cellarId: "c1",
        first: ITEMS_PAGE_SIZE,
        after: null,
        types: null,
        sort: "OPEN_FIRST",
        status: "ACTIVE",
        semanticQuery: null,
      },
    );
    assert.equal(ITEMS_PAGE_SIZE, 50, "the old page size");
  });

  test("the sort chip's four orders are the API's sorts (N13b)", () => {
    const sortOf = (sort: CellarSort) =>
      cellarItemsVariables("c1", { search: "", types: [], sort }, null).sort;
    assert.equal(sortOf("open"), "OPEN_FIRST");
    assert.equal(sortOf("recent"), "ADDED_DESC");
    assert.equal(sortOf("almost-empty"), "PERCENTAGE_ASC");
    assert.equal(sortOf("a-z"), "NAME_ASC");
    assert.deepEqual(
      CELLAR_SORTS.map((sort) => sort.label),
      ["Open first", "Recently added", "Almost empty", "A–Z"],
    );
  });

  test("the status segment: In cellar · Finished · All (N13b)", () => {
    const statusOf = (status: CellarStatus) =>
      cellarItemsVariables("c1", { search: "", types: [], status }, null)
        .status;
    assert.equal(statusOf("in-cellar"), "ACTIVE");
    assert.equal(statusOf("finished"), "EMPTY");
    assert.equal(statusOf("all"), "ALL");
    assert.deepEqual(
      CELLAR_STATUSES.map((status) => status.label),
      ["In cellar", "Finished", "All"],
    );
  });

  test("?sort= and ?status= fall back to the defaults on anything unknown", () => {
    assert.equal(parseCellarSort("recent"), "recent");
    assert.equal(parseCellarSort("NAME_ASC"), "open");
    assert.equal(parseCellarSort(""), "open");
    assert.equal(parseCellarSort(null), "open");
    assert.equal(parseCellarStatus("finished"), "finished");
    assert.equal(parseCellarStatus("EMPTY"), "in-cellar");
    assert.equal(parseCellarStatus(undefined), "in-cellar");
  });

  test("a search overrides the sort, trimmed; blank is no search", () => {
    const vars = cellarItemsVariables(
      "c1",
      { search: "  smoky ", types: [] },
      "cur",
    );
    assert.equal(vars.sort, null);
    assert.equal(vars.semanticQuery, "smoky");
    assert.equal(vars.after, "cur");
    assert.equal(
      cellarItemsVariables("c1", { search: "   ", types: [] }, null).sort,
      "OPEN_FIRST",
    );
    // A search orders by match, but the status still filters.
    assert.equal(
      cellarItemsVariables(
        "c1",
        { search: "smoky", types: [], sort: "a-z", status: "all" },
        null,
      ).status,
      "ALL",
    );
  });

  test("some types filter; all six is no filter, as the old where clause had it", () => {
    assert.deepEqual(
      cellarItemsVariables("c1", { search: "", types: ["WINE", "TEA"] }, null)
        .types,
      ["WINE", "TEA"],
    );
    assert.equal(
      cellarItemsVariables(
        "c1",
        {
          search: "",
          types: ["WINE", "BEER", "SPIRIT", "COFFEE", "SAKE", "TEA"],
        },
        null,
      ).types,
      null,
    );
  });

  test("?types= members are validated and de-duplicated", () => {
    assert.deepEqual(parseItemTypes(["WINE", "wine", "BOGUS", "WINE", "TEA"]), [
      "WINE",
      "TEA",
    ]);
  });

  test("the grid cache key separates cellar, search and filter", () => {
    const keys = new Set([
      cellarItemsCacheKey("c1", { search: "", types: [] }),
      cellarItemsCacheKey("c2", { search: "", types: [] }),
      cellarItemsCacheKey("c1", { search: "a", types: [] }),
      cellarItemsCacheKey("c1", { search: "", types: ["WINE"] }),
      cellarItemsCacheKey("c1", { search: "", types: [], sort: "a-z" }),
      cellarItemsCacheKey("c1", { search: "", types: [], status: "all" }),
    ]);
    assert.equal(keys.size, 6);
    // An absent sort is the default sort: one cache entry, not two.
    assert.equal(
      cellarItemsCacheKey("c1", { search: "", types: [] }),
      cellarItemsCacheKey("c1", {
        search: "",
        types: [],
        sort: "open",
        status: "in-cellar",
      }),
    );
  });
});

describe("virtualTotal (Relay paging under the old VirtualGrid)", () => {
  const rows = [1, 2, 3];
  test("nothing more: exactly the rows, even if the count is stale", () => {
    assert.equal(virtualTotal({ rows, hasNextPage: false, totalCount: 9 }), 3);
  });
  test("more: the count when it is ahead, else one past the rows", () => {
    assert.equal(virtualTotal({ rows, hasNextPage: true, totalCount: 9 }), 9);
    assert.equal(
      virtualTotal({ rows, hasNextPage: true, totalCount: null }),
      4,
    );
    assert.equal(virtualTotal({ rows, hasNextPage: true, totalCount: 2 }), 4);
  });
});
