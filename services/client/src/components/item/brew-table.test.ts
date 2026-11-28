import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  brewFactLabel,
  brewGuide,
  brewPrefsVariables,
  formatBrewFact,
  parseBrewField,
  typicalBrew,
} from "./brew-table";

describe("typical brew table (ux-c L08, L3)", () => {
  test("a tea's category picks its row; matcha's form wins over category", () => {
    assert.equal(typicalBrew("TEA", { category: "green" })?.waterTempC, 80);
    assert.equal(typicalBrew("TEA", { category: "Pu-erh" })?.label, "pu-erh");
    const matcha = typicalBrew("TEA", {
      category: "green",
      form: "matcha_powder",
    });
    assert.equal(matcha?.label, "matcha");
    assert.equal(matcha?.steepSeconds, null);
  });

  test("a coffee's roast picks its row", () => {
    const row = typicalBrew("COFFEE", { roastLevel: "MEDIUM_DARK" });
    assert.deepEqual(
      [row?.waterTempC, row?.steepSeconds, row?.doseGrams, row?.waterMl],
      [91, 180, 15, 250],
    );
  });

  test("a style with no row has no typical guide", () => {
    assert.equal(typicalBrew("TEA", { category: "blend" }), null);
    assert.equal(typicalBrew("TEA", { category: null }), null);
    assert.equal(typicalBrew("COFFEE", { roastLevel: null }), null);
    assert.equal(typicalBrew("WINE", { category: "green" }), null);
  });

  test("no row and no numbers of your own: no guide at all", () => {
    assert.equal(brewGuide(null, null), null);
    assert.equal(
      brewGuide(null, {
        waterTempC: null,
        steepSeconds: null,
        doseGrams: null,
        waterMl: null,
      }),
      null,
    );
  });

  test("no row, but your own numbers: a guide that is all yours", () => {
    const guide = brewGuide(null, {
      waterTempC: 85,
      steepSeconds: 60,
      doseGrams: null,
      waterMl: null,
    });
    assert.equal(guide?.typicalFor, null);
    assert.deepEqual(
      guide?.facts.map((f) => [f.key, f.source]),
      [
        ["waterTempC", "yours"],
        ["steepSeconds", "yours"],
      ],
    );
    assert.equal(guide?.steepSeconds, 60);
  });

  test("your numbers override the typical row one by one", () => {
    const guide = brewGuide(typicalBrew("TEA", { category: "oolong" }), {
      waterTempC: 95,
      steepSeconds: null,
      doseGrams: null,
      waterMl: null,
    });
    assert.equal(guide?.typicalFor, "oolong");
    assert.deepEqual(
      guide?.facts.map((f) => [f.key, f.value, f.source]),
      [
        ["waterTempC", 95, "yours"],
        ["steepSeconds", 180, "typical"],
        ["doseGrams", 3, "typical"],
        ["waterMl", 250, "typical"],
      ],
    );
  });

  test("facts read as °C, m:ss, g and ml", () => {
    // KIT § 4: a narrow no-break space before a unit.
    assert.equal(
      formatBrewFact({ key: "waterTempC", value: 94 }),
      "94\u202F°C",
    );
    assert.equal(formatBrewFact({ key: "steepSeconds", value: 50 }), "0:50");
    assert.equal(
      formatBrewFact({ key: "doseGrams", value: 2.5 }),
      "2.5\u202Fg",
    );
    assert.equal(formatBrewFact({ key: "waterMl", value: 250 }), "250\u202Fml");
  });
});

describe("W-23 · the re-steep line", () => {
  test("oolong reads as the board's line", () => {
    const guide = brewGuide(typicalBrew("TEA", { category: "oolong" }), null);
    assert.equal(guide?.resteepLine, "3–4 more steeps, add 15 s each.");
  });
  test("a whole minute reads as minutes", () => {
    const guide = brewGuide(typicalBrew("TEA", { category: "white" }), null);
    assert.equal(guide?.resteepLine, "1–2 more steeps, add 1 min each.");
  });
  test("teas not usually re-steeped, coffee and an all-yours guide have none", () => {
    for (const row of [
      typicalBrew("TEA", { category: "black" }),
      typicalBrew("TEA", { form: "matcha_powder" }),
      typicalBrew("COFFEE", { roastLevel: "MEDIUM" }),
    ]) {
      assert.equal(brewGuide(row, null)?.resteepLine, null);
    }
    const mine = brewGuide(null, {
      waterTempC: 85,
      steepSeconds: null,
      doseGrams: null,
      waterMl: null,
    });
    assert.equal(mine?.resteepLine, null);
  });
});

describe("Your numbers", () => {
  test("labels name the leaf: Coffee or Tea, Water temp, Water", () => {
    assert.equal(brewFactLabel("doseGrams", "COFFEE"), "Coffee");
    assert.equal(brewFactLabel("doseGrams", "TEA"), "Tea");
    assert.equal(brewFactLabel("waterTempC", "TEA"), "Water temp");
    assert.equal(brewFactLabel("waterMl", "COFFEE"), "Water");
  });

  test("fields parse m:ss, refuse nonsense, and empty keeps the typical", () => {
    assert.deepEqual(parseBrewField("steepSeconds", "3:20"), {
      ok: true,
      value: 200,
    });
    assert.deepEqual(parseBrewField("steepSeconds", "45"), {
      ok: true,
      value: 45,
    });
    assert.deepEqual(parseBrewField("waterTempC", ""), {
      ok: true,
      value: null,
    });
    assert.equal(parseBrewField("steepSeconds", "3:75").ok, false);
    assert.equal(parseBrewField("waterTempC", "130").ok, false);
    assert.equal(parseBrewField("doseGrams", "-2").ok, false);
    assert.equal(parseBrewField("waterMl", "lots").ok, false);
  });

  test("the write names only the item and the numbers, never a person", () => {
    const vars = brewPrefsVariables("COFFEE", "i1", {
      waterTempC: 91,
      steepSeconds: 200,
      doseGrams: null,
      waterMl: null,
    });
    assert.deepEqual(vars, {
      itemType: "COFFEE",
      itemId: "i1",
      waterTempC: 91,
      steepSeconds: 200,
      doseGrams: null,
      waterMl: null,
    });
  });

  test("only a tea or a coffee can carry brew numbers", () => {
    const none = {
      waterTempC: null,
      steepSeconds: null,
      doseGrams: null,
      waterMl: null,
    };
    assert.equal(brewPrefsVariables("BEER", "i1", none), null);
    assert.equal(brewPrefsVariables("WINE", "i1", none), null);
    assert.notEqual(brewPrefsVariables("TEA", "i1", none), null);
  });
});
