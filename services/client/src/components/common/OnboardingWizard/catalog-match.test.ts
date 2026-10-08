import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { emptyFormValues } from "./adapter";
import {
  type CatalogCandidate,
  catalogSearchText,
  findCatalogMatch,
  normalizeName,
  readVintage,
  sameVintage,
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
    assert.equal(sameVintage("WINE", undefined, { vintage: undefined }), true);
    assert.equal(sameVintage("TEA", undefined, { vintage: undefined }), true);
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
});
