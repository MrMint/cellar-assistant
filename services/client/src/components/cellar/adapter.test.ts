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
  cellarItemsCacheKey,
  cellarItemsVariables,
  ITEMS_PAGE_SIZE,
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
});

describe("cellarItemsVariables (first page and later pages agree)", () => {
  test("no search: name order, no semantic query, no filter", () => {
    assert.deepEqual(
      cellarItemsVariables("c1", { search: "", types: [] }, null),
      {
        cellarId: "c1",
        first: ITEMS_PAGE_SIZE,
        after: null,
        types: null,
        sort: "NAME_ASC",
        semanticQuery: null,
      },
    );
    assert.equal(ITEMS_PAGE_SIZE, 50, "the old page size");
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
      "NAME_ASC",
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
    ]);
    assert.equal(keys.size, 4);
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
