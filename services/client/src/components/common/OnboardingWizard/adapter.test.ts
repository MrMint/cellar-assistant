import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  addAnotherHref,
  canQuickAdd,
  confirmInputFrom,
  emptyDefaults,
  finishedHref,
  formDefaultsFromOnboarding,
  quickAddDefaultsFrom,
  saveBlocker,
  skippedNotes,
} from "./adapter";
import {
  type CatalogCandidate,
  type CatalogMatch,
  findCatalogMatch,
} from "./catalog-match";

/** A wine as `startItemOnboarding` stores it: camelCase, bag nested. */
const wineDefaults = {
  name: "Château Margaux",
  description: "Grand vin.",
  country: "France",
  brandName: "Château Margaux",
  confidence: 0.95,
  wine: {
    vintage: "2015-01-01",
    style: "RED",
    variety: "CABERNET_SAUVIGNON",
    region: "Margaux",
  },
};

describe("formDefaultsFromOnboarding", () => {
  test("reads the nested bag and shows a date column as the old year field", () => {
    const { values, brandName, skipped } = formDefaultsFromOnboarding(
      "WINE",
      wineDefaults,
    );
    assert.equal(values.name, "Château Margaux");
    assert.equal(values.country, "France");
    assert.equal(values.attributes.vintage, "2015");
    assert.equal(values.attributes.style, "RED");
    assert.equal(brandName, "Château Margaux");
    assert.deepEqual(skipped, []);
  });

  test("a proposal a field cannot hold is reported, not dropped", () => {
    const { values, skipped } = formDefaultsFromOnboarding("WINE", {
      name: "X",
      wine: { vintage: "June 2015", alcoholContentPercentage: "strong" },
    });
    assert.equal(values.attributes.vintage, undefined);
    assert.deepEqual(
      skipped.map((entry) => [entry.path, entry.reason]),
      [
        ["attributes.vintage", "unusable"],
        ["attributes.alcoholContentPercentage", "unusable"],
      ],
    );
  });

  test("N02: a bare year fills a date column the form edits as a year", () => {
    const { values, skipped } = formDefaultsFromOnboarding("WINE", {
      name: "X",
      wine: { vintage: "2015", style: "RED" },
    });
    assert.equal(values.attributes.vintage, "2015");
    assert.deepEqual(skipped, []);
    assert.equal(
      confirmInputFrom("WINE", values, "").attributes.vintage,
      "2015-01-01",
      "and goes back to the date column on save",
    );
  });

  test("N02: a numeric year from the model is a year too", () => {
    const { values } = formDefaultsFromOnboarding("BEER", {
      name: "X",
      beer: { vintage: 2019 },
    });
    assert.equal(values.attributes.vintage, "2019");
  });

  test("a static picker only takes its own options", () => {
    const { values, skipped } = formDefaultsFromOnboarding("TEA", {
      name: "Sencha",
      tea: { form: "loose_leaf", caffeineLevel: "extreme", isOrganic: true },
    });
    assert.equal(values.attributes.form, "loose_leaf");
    assert.equal(values.attributes.isOrganic, "true");
    assert.equal(values.attributes.caffeineLevel, undefined);
    assert.equal(skipped[0]?.path, "attributes.caffeineLevel");
  });

  test("an all-caps label read is pre-filled smart-title-cased (N17)", () => {
    const { values, brandName } = formDefaultsFromOnboarding("WINE", {
      name: "CASTELLO DI MONTEROSSO",
      brandName: "CASTELLO DI MONTEROSSO",
      wine: { vintage: "2019-01-01" },
    });
    assert.equal(values.name, "Castello di Monterosso");
    assert.equal(brandName, "Castello di Monterosso");
  });

  test("anything that is not an object reads as nothing", () => {
    assert.deepEqual(
      formDefaultsFromOnboarding("BEER", "nonsense"),
      emptyDefaults(),
    );
  });
});

describe("skippedNotes (N19: the merge's skipped proposals, shown)", () => {
  test("what the label said, and why it is not in the field", () => {
    const { skipped } = formDefaultsFromOnboarding("WINE", {
      name: "X",
      wine: { alcoholContentPercentage: "strong" },
    });
    assert.deepEqual(skippedNotes("WINE", skipped), [
      "Alcohol Content: “strong” (the field is a number)",
    ]);
  });
});

describe("confirmInputFrom", () => {
  test("blank optionals are null, a year goes back to the date column", () => {
    const { values } = formDefaultsFromOnboarding("WINE", wineDefaults);
    const input = confirmInputFrom(
      "WINE",
      { ...values, description: "  " },
      "  ",
    );
    assert.equal(input.description, null);
    assert.equal(input.brandName, null);
    assert.equal(input.attributes.vintage, "2015-01-01");
    assert.equal(input.attributes.style, "RED");
    assert.ok(!("cellarId" in input), "the bottle is filed as its own step");
  });
});

describe("saveBlocker", () => {
  test("names the NOT NULL columns the outbox would otherwise swallow", () => {
    assert.equal(
      saveBlocker("WINE", {
        name: "X",
        description: "",
        country: "",
        attributes: {},
      }),
      "Vintage, Style cannot be empty.",
    );
    assert.equal(
      saveBlocker("COFFEE", {
        name: "X",
        description: "",
        country: "",
        attributes: {},
      }),
      "Description cannot be empty.",
    );
    assert.equal(
      saveBlocker("SAKE", emptyDefaults().values),
      "Name cannot be empty.",
    );
    // N03: every missing column at once, never one at a time.
    assert.equal(
      saveBlocker("WINE", emptyDefaults().values),
      "Name, Vintage, Style cannot be empty.",
    );
    assert.equal(
      saveBlocker("SAKE", { ...emptyDefaults().values, name: "Dassai" }),
      null,
    );
  });
});

describe("canQuickAdd (Q7, the E2c guard)", () => {
  const defaults = formDefaultsFromOnboarding("WINE", wineDefaults);
  const match: CatalogMatch = {
    item: { id: "m", itemId: "m", name: "Château Margaux", vintage: "2015" },
    type: "WINE",
    source: "search",
    distance: 0.1,
    exact: true,
  };
  const ok = {
    labelSent: true,
    confidence: 0.95,
    defaults,
    match,
    inCellar: true,
  };

  test("the old rule — confidence ≥ 0.9 — with a label actually read", () => {
    assert.equal(canQuickAdd(ok), true);
    assert.equal(canQuickAdd({ ...ok, confidence: 0.89 }), false);
  });

  test("never without a photographed label, whatever the confidence", () => {
    assert.equal(
      canQuickAdd({ ...ok, labelSent: false, confidence: 1 }),
      false,
    );
  });

  // N02: the countdown can only add another bottle of a known item, so it can
  // never create a catalogue row (D25).
  test("N02: never without a catalogue match, however complete the read", () => {
    assert.equal(
      canQuickAdd({ ...ok, confidence: 1, match: null }),
      false,
      "a label naming nothing the catalogue holds goes to the form",
    );
    assert.equal(canQuickAdd({ ...ok, match: undefined }), false);
  });

  test("N02: a near neighbour is offered with a tap, never counted down", () => {
    assert.equal(
      canQuickAdd({ ...ok, match: { ...match, exact: false } }),
      false,
    );
  });

  test("N02: a barcode hit or a same-name hit (equal vintage) qualifies", () => {
    const read = formDefaultsFromOnboarding("WINE", {
      ...wineDefaults,
      wine: { vintage: "2015" },
    });
    const sameName = findCatalogMatch({
      type: "WINE",
      values: read.values,
      brandName: read.brandName,
      candidates: [{ ...match, exact: undefined } as CatalogCandidate],
    });
    assert.equal(canQuickAdd({ ...ok, defaults: read, match: sameName }), true);
    const barcode = findCatalogMatch({
      type: "WINE",
      values: read.values,
      brandName: read.brandName,
      candidates: [
        {
          item: { id: "b", itemId: "b", name: "GV Margaux", vintage: "2015" },
          type: "WINE",
          source: "barcode",
        },
      ],
    });
    assert.equal(canQuickAdd({ ...ok, defaults: read, match: barcode }), true);
  });

  test("N02: the same item at another vintage is no match, so no countdown", () => {
    const read = formDefaultsFromOnboarding("WINE", {
      ...wineDefaults,
      wine: { vintage: "2016" },
    });
    const found = findCatalogMatch({
      type: "WINE",
      values: read.values,
      brandName: read.brandName,
      candidates: [{ ...match, source: "search" }],
    });
    assert.equal(found, null);
    assert.equal(canQuickAdd({ ...ok, defaults: read, match: found }), false);
  });

  test("N02: only into a cellar — another bottle means nothing elsewhere", () => {
    assert.equal(canQuickAdd({ ...ok, inCellar: false }), false);
  });
});

describe("quickAddDefaultsFrom", () => {
  test("the card summarises the values it would save", () => {
    const card = quickAddDefaultsFrom(
      "WINE",
      formDefaultsFromOnboarding("WINE", wineDefaults),
    );
    assert.deepEqual(card, {
      name: "Château Margaux",
      description: "Grand vin.",
      country: "France",
      brand_name: "Château Margaux",
      vintage: "2015",
      variety: "CABERNET_SAUVIGNON",
      style: "RED",
      region: "Margaux",
    });
  });
});

describe("where the final prompt goes", () => {
  test("the bottle in a cellar (decision 1), else the item", () => {
    assert.equal(
      finishedHref({
        type: "SAKE",
        itemId: "i",
        cellarId: "c",
        cellarItemId: "ci",
      }),
      "/cellars/c/sakes/ci",
    );
    assert.equal(finishedHref({ type: "WINE", itemId: "i" }), "/wines/i");
    assert.equal(addAnotherHref("c"), "/cellars/c/items/add");
    assert.equal(addAnotherHref(), "/add");
  });
});
