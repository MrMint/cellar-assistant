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
} from "./adapter";

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
      wine: { vintage: "2015", alcoholContentPercentage: "strong" },
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

  test("anything that is not an object reads as nothing", () => {
    assert.deepEqual(
      formDefaultsFromOnboarding("BEER", "nonsense"),
      emptyDefaults(),
    );
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
    assert.equal(
      saveBlocker("SAKE", { ...emptyDefaults().values, name: "Dassai" }),
      null,
    );
  });
});

describe("canQuickAdd (Q7, the E2c guard)", () => {
  const defaults = formDefaultsFromOnboarding("WINE", wineDefaults);

  test("the old rule — confidence ≥ 0.9 — with a label actually read", () => {
    assert.equal(
      canQuickAdd({
        type: "WINE",
        labelSent: true,
        confidence: 0.95,
        defaults,
      }),
      true,
    );
    assert.equal(
      canQuickAdd({
        type: "WINE",
        labelSent: true,
        confidence: 0.89,
        defaults,
      }),
      false,
    );
  });

  test("never without a photographed label, whatever the confidence", () => {
    assert.equal(
      canQuickAdd({ type: "WINE", labelSent: false, confidence: 1, defaults }),
      false,
    );
  });

  test("never when an unattended save would die in the outbox", () => {
    const noStyle = formDefaultsFromOnboarding("WINE", {
      ...wineDefaults,
      wine: { vintage: "2015-01-01" },
    });
    assert.equal(
      canQuickAdd({
        type: "WINE",
        labelSent: true,
        confidence: 1,
        defaults: noStyle,
      }),
      false,
    );
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
