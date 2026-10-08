/**
 * The brand adapters, pinned against what `82450ad1`'s `toBrandCardItems`
 * and the brand page handed `BrandCard` / `BrandDetails`.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  brandCardFromSource,
  brandDetailsFromSource,
  brandItemFromLink,
  inferBrandType,
  itemLinkFromFragment,
} from "./adapter";

describe("brandCardFromSource (old toBrandCardItems)", () => {
  test("snake_case card props, item_count from G23, no parent or places", () => {
    assert.deepEqual(
      brandCardFromSource({
        id: "b1",
        name: "Vietti",
        brandType: "winery",
        description: "Castiglione Falletto",
        logoUrl: null,
        parentBrandId: "b0",
        itemCount: 7,
      }),
      {
        id: "b1",
        name: "Vietti",
        description: "Castiglione Falletto",
        logo_url: null,
        brand_type: "winery",
        parent_brand_id: "b0",
        item_count: 7,
      },
    );
  });
  test("X23: no stored type reads as its first item's producer, else none", () => {
    assert.equal(
      brandCardFromSource({
        id: "b",
        name: "Ridge",
        brandType: null,
        firstItemType: "WINE",
      }).brand_type,
      "winery",
    );
    assert.equal(
      brandCardFromSource({ id: "b", name: "X", brandType: null }).brand_type,
      null,
    );
  });
});

describe("brandItemFromLink (ItemBrand → the old item_brands row)", () => {
  test("the item sits under its type's relation, with is_primary (G24)", () => {
    assert.deepEqual(
      brandItemFromLink({
        id: "l1",
        isPrimary: true,
        item: { id: "s1", type: "SAKE", name: "Dassai" },
      }),
      { id: "l1", is_primary: true, sake: { id: "s1", name: "Dassai" } },
    );
  });
  test("a wine's vintage is the year, not the raw date", () => {
    assert.deepEqual(
      brandItemFromLink({
        id: "l2",
        isPrimary: false,
        item: { id: "w1", type: "WINE", name: "Barolo", vintage: "2016-01-01" },
      }).wine,
      { id: "w1", name: "Barolo", vintage: "2016" },
    );
  });
  test("reads a BrandItemLink node", () => {
    assert.deepEqual(
      itemLinkFromFragment({
        __typename: "ItemBrand",
        id: "l3",
        isPrimary: false,
        item: { __typename: "Beer", id: "be1", type: "BEER", name: "Pils" },
      } as never),
      {
        id: "l3",
        isPrimary: false,
        item: { id: "be1", type: "BEER", name: "Pils", vintage: null },
      },
    );
  });
});

describe("brandDetailsFromSource", () => {
  test("parent, children, places and the given item links", () => {
    const details = brandDetailsFromSource(
      {
        id: "b1",
        name: "Vietti",
        brandType: "winery",
        createdAt: "2019-06-01T00:00:00Z",
        parentBrand: { id: "b0", name: "Krause", brandType: "manufacturer" },
        childBrands: {
          edges: [
            { node: { id: "b2", name: "Vietti Moscato", brandType: null } },
          ],
        },
        places: {
          edges: [
            {
              node: {
                id: "pb1",
                relationshipType: "owned_by",
                place: { id: "p1", name: "Cantina" },
              },
            },
          ],
        },
      },
      [
        {
          id: "l1",
          isPrimary: true,
          item: { id: "w1", type: "WINE", name: "Barolo" },
        },
      ],
    );
    assert.deepEqual(details.parent_brand, {
      id: "b0",
      name: "Krause",
      brand_type: "manufacturer",
    });
    assert.deepEqual(details.child_brands, [
      { id: "b2", name: "Vietti Moscato", brand_type: "other" },
    ]);
    assert.deepEqual(details.place_brands, [
      {
        id: "pb1",
        relationship_type: "owned_by",
        place: { id: "p1", name: "Cantina" },
      },
    ]);
    assert.equal(details.item_brands.length, 1);
  });
});

test("inferBrandType: a stored type wins; `other` and unset defer to the first item", () => {
  assert.equal(inferBrandType("distillery", "WINE"), "distillery");
  assert.equal(inferBrandType("restaurant_chain", null), "restaurant_chain");
  assert.equal(inferBrandType("other", "BEER"), "brewery");
  assert.equal(inferBrandType(undefined, "SAKE"), "kura");
  assert.equal(inferBrandType(null, "COFFEE"), "roastery");
  assert.equal(inferBrandType(null, "TEA"), "tea_house");
  assert.equal(inferBrandType(null, "SPIRIT"), "distillery");
  assert.equal(inferBrandType("other", null), null);
});
