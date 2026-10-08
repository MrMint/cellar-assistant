import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { emptyFormValues } from "./adapter";
import {
  brandCompatible,
  type CatalogCandidate,
  catalogMatchSummary,
  catalogSearchText,
  findCatalogMatch,
  normalizeName,
  readVintage,
  sameVintage,
  tellingWords,
  wordsAgree,
} from "./catalog-match";

const candidate = (
  id: string,
  name: string,
  vintage: string | undefined,
  extra: Partial<CatalogCandidate> = {},
): CatalogCandidate => ({
  item: { id, itemId: id, name, vintage },
  type: "WINE",
  source: "search",
  distance: 0.2,
  ...extra,
});

const wine = (name: string, vintage: string) => ({
  ...emptyFormValues(),
  name,
  attributes: { vintage, style: "RED" },
});

const match = (
  type: ApiItemType,
  values: ReturnType<typeof wine>,
  candidates: CatalogCandidate[],
  excludeItemIds: string[] = [],
  brandName = "",
) => findCatalogMatch({ type, values, brandName, candidates, excludeItemIds });

describe("readVintage / sameVintage — the explicit vintage compare", () => {
  test("the vintage attribute per type, as a year", () => {
    assert.equal(readVintage("WINE", wine("X", "2015")), "2015");
    assert.equal(readVintage("WINE", wine("X", "2015-01-01")), "2015");
    assert.equal(readVintage("WINE", wine("X", "")), undefined);
    assert.equal(
      readVintage("SAKE", {
        ...emptyFormValues(),
        attributes: { vintageYear: "2021" },
      }),
      "2021",
    );
    assert.equal(readVintage("COFFEE", wine("X", "2015")), undefined);
  });

  test("equal years, or both absent; a missing side is not a match", () => {
    assert.equal(sameVintage("WINE", "2015", { vintage: "2015" }), true);
    assert.equal(sameVintage("WINE", "2015", { vintage: "2016" }), false);
    assert.equal(sameVintage("WINE", undefined, { vintage: "2015" }), false);
    assert.equal(sameVintage("WINE", "2015", { vintage: undefined }), false);
    assert.equal(sameVintage("BEER", undefined, { vintage: undefined }), true);
    assert.equal(sameVintage("TEA", undefined, { vintage: undefined }), true);
  });

  // X19: a wine's NULL vintage is non-vintage — an answer, compared like one.
  test("NV matches NV and nothing else; a wine read with no vintage matches nothing", () => {
    assert.equal(sameVintage("WINE", "NV", { vintage: "NV" }), true);
    assert.equal(sameVintage("WINE", "N.V.", { vintage: "NV" }), true);
    assert.equal(sameVintage("WINE", "NV", { vintage: "2015" }), false);
    assert.equal(sameVintage("WINE", "2015", { vintage: "NV" }), false);
    assert.equal(sameVintage("WINE", undefined, { vintage: "NV" }), false);
    assert.equal(sameVintage("WINE", undefined, { vintage: undefined }), false);
    assert.equal(readVintage("WINE", wine("Krug", "NV")), "NV");
    assert.equal(readVintage("WINE", wine("Krug", "Non-Vintage")), "NV");
  });
});

describe("normalizeName", () => {
  test("case, accents and punctuation are set aside; kanji survive", () => {
    assert.equal(normalizeName("Château  Margaux!"), "chateau margaux");
    assert.equal(normalizeName("CHATEAU-MARGAUX"), "chateau margaux");
    assert.equal(normalizeName("獺祭 純米大吟醸"), "獺祭 純米大吟醸");
  });
});

describe("catalogSearchText", () => {
  test("the name, with the brand in front unless it already carries it", () => {
    assert.equal(
      catalogSearchText({ name: "Rubesco", brandName: "Lungarotti" }),
      "Lungarotti Rubesco",
    );
    assert.equal(
      catalogSearchText({
        name: "Château Margaux",
        brandName: "Chateau Margaux",
      }),
      "Château Margaux",
    );
    assert.equal(catalogSearchText({ name: "  ", brandName: "X" }), null);
  });
});

describe("findCatalogMatch (N19)", () => {
  const read = wine("Château Margaux", "2015");

  test("a neighbour at another vintage is never the bottle in hand", () => {
    assert.equal(
      match("WINE", read, [candidate("a", "Château Margaux", "2016")]),
      null,
    );
  });

  test("the same name at the same vintage is an exact match", () => {
    const found = match("WINE", read, [
      candidate("near", "Pavillon Rouge du Château Margaux", "2015", {
        distance: 0.05,
      }),
      candidate("same", "Chateau Margaux", "2015", { distance: 0.3 }),
    ]);
    assert.equal(found?.item.itemId, "same");
    assert.equal(found?.exact, true);
  });

  test("a close neighbour with a different name is offered, not exact", () => {
    const found = match("WINE", read, [
      candidate("near", "Pavillon Rouge du Château Margaux", "2015"),
    ]);
    assert.equal(found?.item.itemId, "near");
    assert.equal(found?.exact, false);
  });

  test("the brand-prefixed name counts as the name read", () => {
    const found = match(
      "WINE",
      wine("Rubesco", "2018"),
      [candidate("r", "Lungarotti Rubesco", "2018")],
      [],
      "Lungarotti",
    );
    assert.equal(found?.exact, true);
  });

  test("a same-name hit filed under another producer is not offered", () => {
    // Names repeat across producers; the label named Jordan, so "+1 bottle"
    // of Other Estate's would file the wrong one in a tap.
    const found = match(
      "WINE",
      wine("Reserve Cabernet Sauvignon", "2018"),
      [
        candidate("other", "Reserve Cabernet Sauvignon", "2018", {
          brandName: "Other Estate",
        }),
      ],
      [],
      "Jordan",
    );
    assert.equal(found, null);
    assert.equal(
      match("WINE", wine("Reserve Cabernet Sauvignon", "2018"), [
        candidate("other", "Reserve Cabernet Sauvignon", "2018", {
          brandName: "Other Estate",
        }),
      ])?.exact,
      false,
      "offered, not exact, when the label named no brand at all",
    );
  });

  test("the item's brand, read as the brand or inside the name, is exact", () => {
    assert.equal(
      match(
        "WINE",
        wine("Reserve Cabernet Sauvignon", "2018"),
        [
          candidate("j", "Reserve Cabernet Sauvignon", "2018", {
            brandName: "Jordan",
          }),
        ],
        [],
        "JORDAN",
      )?.exact,
      true,
    );
    assert.equal(
      match("WINE", read, [
        candidate("m", "Château Margaux", "2015", {
          brandName: "Chateau Margaux",
        }),
      ])?.exact,
      true,
    );
    assert.equal(
      match("WINE", wine("Margaux Reserve", "2015"), [
        candidate("m", "Margaux Reserve", "2015", { brandName: "Margaux R" }),
      ])?.exact,
      false,
      "whole words only",
    );
  });

  test("an exact hit further down beats a nearer brand clash", () => {
    const found = match(
      "WINE",
      wine("Reserve Cabernet Sauvignon", "2018"),
      [
        candidate("clash", "Reserve Cabernet Sauvignon", "2018", {
          brandName: "Other Estate",
          distance: 0.01,
        }),
        candidate("mine", "Reserve Cabernet Sauvignon", "2018", {
          brandName: "Jordan",
          distance: 0.2,
        }),
      ],
      [],
      "Jordan",
    );
    assert.equal(found?.item.itemId, "mine");
    assert.equal(found?.exact, true);
  });

  test("another type, or an item the person declined, is never offered", () => {
    assert.equal(
      match("WINE", read, [
        candidate("beer", "Château Margaux", "2015", { type: "BEER" }),
      ]),
      null,
    );
    assert.equal(
      match("WINE", read, [candidate("no", "Château Margaux", "2015")], ["no"]),
      null,
    );
  });

  test("a barcode hit at the same vintage leads, and is exact", () => {
    const found = match("WINE", read, [
      candidate("s", "Château Margaux", "2015"),
      candidate("b", "Margaux GV", "2015", { source: "barcode" }),
    ]);
    assert.equal(found?.item.itemId, "b");
    assert.equal(found?.exact, true);
  });

  test("nothing to compare against is no match", () => {
    assert.equal(match("WINE", read, []), null);
  });

  test("maxDistance bounds near-misses, not exact name hits (N08 hybrid search)", () => {
    const within = (candidates: CatalogCandidate[]) =>
      findCatalogMatch({
        type: "WINE",
        values: read,
        brandName: "",
        candidates,
        maxDistance: 0.5,
      });
    // The name match can bring in an item beyond the vector cutoff, or one
    // with no embedding at all: offered only when it is the very name read.
    assert.equal(
      within([candidate("far", "Château Margaux", "2015", { distance: 0.9 })])
        ?.exact,
      true,
    );
    assert.equal(
      within([
        candidate("none", "Château Margaux", "2015", { distance: undefined }),
      ])?.item.itemId,
      "none",
    );
    // A near-miss beyond the cutoff, or with no distance, is never a guess.
    assert.equal(
      within([candidate("far", "Margaux Rouge", "2015", { distance: 0.9 })]),
      null,
    );
    assert.equal(
      within([
        candidate("none", "Margaux Rouge", "2015", { distance: undefined }),
      ]),
      null,
    );
    assert.equal(
      within([
        candidate("far", "Margaux Rouge", "2015", { distance: 0.9 }),
        candidate("near", "Margaux Blanc", "2015", { distance: 0.3 }),
      ])?.item.itemId,
      "near",
    );
  });
});

describe("what may be offered at all (unrelated neighbours inside the cutoff)", () => {
  const within = (
    values: ReturnType<typeof wine>,
    candidates: CatalogCandidate[],
    brandName = "",
  ) =>
    findCatalogMatch({
      type: "WINE",
      values,
      brandName,
      candidates,
      maxDistance: 0.5,
    });

  test("a read of Muga 2019 is not offered Catena Zapata 2019 (distance 0.479)", () => {
    assert.equal(
      within(wine("Muga Reserva Rioja", "2019"), [
        candidate("catena", "Catena Zapata Malbec Argentino", "2019", {
          distance: 0.479,
          brandName: "Bodega Catena Zapata",
        }),
      ]),
      null,
    );
  });

  test("a wine not in the catalogue is not offered Muga (distance 0.456)", () => {
    assert.equal(
      within(wine("Bodega Inexistente Tinto Especial", "2018"), [
        candidate("muga", "Muga Reserva Rioja", "2018", {
          distance: 0.456,
          brandName: "Bodegas Muga",
        }),
      ]),
      null,
    );
  });

  test("the same words in another order are still offered", () => {
    const found = within(
      wine("Muga Rioja Reserva", "2018"),
      [
        candidate("muga", "Muga Reserva Rioja", "2018", {
          distance: 0.1,
          brandName: "Bodegas Muga",
        }),
      ],
      "Muga",
    );
    assert.equal(found?.item.itemId, "muga");
    assert.equal(found?.exact, false);
  });

  test("a barcode hit is the product key, whatever its words", () => {
    assert.equal(
      within(wine("Muga Reserva Rioja", "2018"), [
        candidate("b", "Something Else", "2018", { source: "barcode" }),
      ])?.item.itemId,
      "b",
    );
  });
});

describe("tellingWords / wordsAgree / brandCompatible", () => {
  test("filler and years are set aside", () => {
    assert.deepEqual(
      Array.from(tellingWords("Château de la Tour 2015", "Bodegas Tour")),
      ["tour"],
    );
  });

  test("wordsAgree is at least half the telling words shared", () => {
    const read = { name: "Château Margaux", brandName: "" };
    assert.equal(wordsAgree({ name: "Margaux Rouge" }, read), true);
    assert.equal(
      wordsAgree({ name: "Pavillon Rouge du Château Margaux" }, read),
      true,
    );
    assert.equal(wordsAgree({ name: "Palmer Alter Ego Rouge" }, read), false);
    assert.equal(wordsAgree({ name: "Château" }, read), false);
  });

  test("a brand contradicts only when the label named one", () => {
    const named = { name: "Reserva Rioja", brandName: "Muga" };
    assert.equal(brandCompatible("Bodegas Muga", named), true);
    assert.equal(brandCompatible("Bodega Catena Zapata", named), false);
    assert.equal(brandCompatible(undefined, named), true);
    assert.equal(
      brandCompatible("Bodega Catena Zapata", {
        name: "Reserva Rioja",
        brandName: "",
      }),
      true,
    );
    assert.equal(
      brandCompatible("Muga", { name: "Muga Reserva", brandName: "Bodegas" }),
      true,
      "a brand read as only boilerplate names nobody",
    );
  });
});

describe("catalogMatchSummary — the item's own details, not the read's", () => {
  test("vintage and the card subtitle, skipping what is missing", () => {
    const hit = {
      ...candidate("m", "Muga Reserva Rioja", "2018"),
      exact: true,
    };
    assert.equal(
      catalogMatchSummary({
        ...hit,
        item: { ...hit.item, subtitle: "Tempranillo" },
      }),
      "2018 · Tempranillo",
    );
    assert.equal(catalogMatchSummary(hit), "2018");
    assert.equal(
      catalogMatchSummary({
        ...hit,
        item: { ...hit.item, vintage: undefined },
      }),
      "",
    );
  });
});
