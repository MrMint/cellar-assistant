import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  type ItemCardSource,
  itemCardFromCellarItem,
  itemCardFromFragment,
  itemCardFromItem,
  subtitleDescriptor,
} from "./adapter";
import { ItemCardFragment } from "./fragments";

const edges = <T>(...nodes: T[]) => ({
  edges: nodes.map((node) => ({ node })),
});

const wine: ItemCardSource = {
  id: "w1",
  type: "WINE",
  name: "Barolo",
  isFavorite: true,
  score: { average: 4.25, count: 8 },
  images: edges({
    fileId: "f1",
    placeholder: "png;base64,AAAA",
    file: { url: "https://files.test/f1?sig" },
  }),
  brands: edges(
    { isPrimary: false, brand: { name: "Négociant" } },
    { isPrimary: true, brand: { name: "Vietti" } },
  ),
  vintage: "2016-01-01",
  variety: "NEBBIOLO",
};

describe("itemCardFromItem", () => {
  test("maps every field the old transform produced", () => {
    assert.deepEqual(itemCardFromItem(wine), {
      id: "w1",
      itemId: "w1",
      name: "Barolo",
      vintage: "2016",
      subtitle: "Vietti · Nebbiolo",
      displayImageUrl: "https://files.test/f1?sig",
      placeholder: "png;base64,AAAA",
      score: 4.25,
      reviewCount: 8,
      reviewed: undefined,
      favoriteCount: null,
      isFavorite: true,
    });
  });

  test("the primary brand wins over page order; else the first", () => {
    assert.equal(itemCardFromItem(wine).subtitle, "Vietti · Nebbiolo");
    const noPrimary = {
      ...wine,
      brands: edges(
        { brand: { name: "First" } },
        { brand: { name: "Second" } },
      ),
    };
    assert.equal(itemCardFromItem(noPrimary).subtitle, "First · Nebbiolo");
  });

  test("a bare item: every optional section comes back hidden", () => {
    const card = itemCardFromItem({ id: "b1", type: "BEER", name: "Pils" });
    assert.equal(card.vintage, undefined);
    assert.equal(card.subtitle, undefined);
    assert.equal(card.displayImageUrl, undefined);
    assert.equal(card.placeholder, null);
    assert.equal(card.score, null);
    assert.equal(card.reviewCount, null);
    assert.equal(card.favoriteCount, null);
    assert.equal(card.reviewed, undefined);
    assert.equal(card.isFavorite, false);
  });

  test("no reviews: count 0 shown, score hidden (null average)", () => {
    const card = itemCardFromItem({
      ...wine,
      score: { average: null, count: 0 },
    });
    assert.equal(card.reviewCount, 0);
    assert.equal(card.score, null);
  });

  test("an image without a file url (not selected) shows the fallback", () => {
    const card = itemCardFromItem({
      ...wine,
      images: edges({ fileId: "f", placeholder: null }),
    });
    assert.equal(card.displayImageUrl, undefined);
    assert.equal(card.placeholder, null);
  });

  test("sake vintage comes from vintageYear; coffee and tea have none", () => {
    assert.equal(
      itemCardFromItem({ id: "s", type: "SAKE", name: "S", vintageYear: 2021 })
        .vintage,
      "2021",
    );
    assert.equal(
      itemCardFromItem({
        id: "c",
        type: "COFFEE",
        name: "C",
        vintage: "2020-01-01",
      }).vintage,
      undefined,
    );
  });

  test("G6/G7 when present: favourite count and the gold-star flag", () => {
    const card = itemCardFromItem({
      ...wine,
      favoriteCount: 12,
      myReview: { score: 5 },
    });
    assert.equal(card.favoriteCount, 12);
    assert.equal(card.reviewed, true);
    assert.equal(
      itemCardFromItem({ ...wine, myReview: null }).reviewed,
      false,
      "selected-but-null means 'not reviewed', not 'unknown'",
    );
  });
});

describe("subtitleDescriptor — the old subtitle_field aliases", () => {
  const cases: [ItemCardSource, string][] = [
    [{ id: "1", type: "WINE", name: "", variety: "MERLOT" }, "MERLOT"],
    [{ id: "1", type: "BEER", name: "", beerStyle: "IPA" }, "IPA"],
    [{ id: "1", type: "SPIRIT", name: "", spiritStyle: "PEATED" }, "PEATED"],
    [{ id: "1", type: "COFFEE", name: "", roastLevel: "DARK" }, "DARK"],
    [{ id: "1", type: "SAKE", name: "", category: "junmai" }, "junmai"],
    [{ id: "1", type: "TEA", name: "", category: "oolong" }, "oolong"],
  ];
  for (const [item, expected] of cases) {
    test(item.type, () => assert.equal(subtitleDescriptor(item), expected));
  }

  test("only the descriptor (no brand) still makes a subtitle", () => {
    assert.equal(
      itemCardFromItem({ id: "t", type: "TEA", name: "", category: "pu_erh" })
        .subtitle,
      "Pu Erh",
    );
  });
});

describe("itemCardFromCellarItem", () => {
  test("id is the bottle; itemId is the catalog item", () => {
    const card = itemCardFromCellarItem({ id: "bottle-9", item: wine });
    assert.equal(card.id, "bottle-9");
    assert.equal(card.itemId, "w1");
    assert.equal(card.name, "Barolo");
  });
});

describe("itemCardFromFragment", () => {
  test("a full ItemCard fragment result, G6/G7 included", () => {
    const data = {
      __typename: "Wine",
      id: "w1",
      type: "WINE",
      name: "Barolo",
      isFavorite: false,
      favoriteCount: 3,
      myReview: { __typename: "ItemReview", id: "r1", score: 4 },
      score: { average: 4, count: 1 },
      images: { edges: [] },
      brands: { edges: [] },
      vintage: "2016-01-01",
      variety: "NEBBIOLO",
    };
    const card = itemCardFromFragment(
      data as unknown as Parameters<typeof itemCardFromFragment>[0],
    );
    assert.equal(card.favoriteCount, 3);
    assert.equal(card.reviewed, true);
    assert.equal(card.vintage, "2016");
    assert.equal(card.subtitle, "Nebbiolo");
    assert.equal(card.displayImageUrl, undefined);
    assert.ok(ItemCardFragment);
  });
});
