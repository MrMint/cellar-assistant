/**
 * K2 · what a saved draft still needs, and the write that finishes it.
 * Drafts here are the demo seed's (`services/actors/scripts/demo-seed-data.ts`
 * `DRAFTS`), plus made-up ones for the other kinds.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { REQUIRED_ITEM_ATTRIBUTES } from "@cellar-assistant/contracts/items";
import { buildSchema, type DocumentNode, Kind, validate } from "graphql";
import { queryCostRule } from "../../../../api/src/limits.ts";
import {
  bottlesLine,
  chipWord,
  confirmInput,
  type Draft,
  finishPlan,
  kindSpec,
  needCounts,
  needsOf,
  restoreInput,
  rowOf,
  STRENGTH_KEY,
} from "./needs";
import * as queries from "./queries";

const GARNACHA: Draft = {
  id: "11111111-1111-4111-8111-111111111111",
  itemType: "WINE",
  cellarId: "c-home",
  displayName: "Hillside Garnacha",
  displayMaker: "Demo Valley Cellars",
  draftFields: {
    name: "Hillside Garnacha",
    brandName: "Demo Valley Cellars",
    country: "SPAIN",
  },
  confirmedFields: ["name", "brandName"],
  vintageAnswer: "UNANSWERED",
  imageId: null,
};

const ROSE: Draft = {
  id: "22222222-2222-4222-8222-222222222222",
  itemType: "WINE",
  cellarId: "c-lake",
  displayName: "Dockside Rosé",
  displayMaker: null,
  draftFields: { name: "Dockside Rosé", attributes: { style: "ROSE" } },
  confirmedFields: ["name"],
  vintageAnswer: "UNANSWERED",
  imageId: null,
};

const COFFEE: Draft = {
  id: "33333333-3333-4333-8333-333333333333",
  itemType: "COFFEE",
  cellarId: "c-home",
  displayName: "Morning Field",
  displayMaker: null,
  draftFields: { name: "Morning Field", attributes: { roastLevel: "MEDIUM" } },
  confirmedFields: [],
  vintageAnswer: "UNANSWERED",
  imageId: null,
};

describe("needs", () => {
  test("the seed's wines: what each misses, in the row's words", () => {
    const garnacha = rowOf(GARNACHA);
    assert.deepEqual(garnacha.needs, ["style", "strength", "vintage"]);
    assert.equal(garnacha.needLine, "Needs style, strength and vintage");
    assert.equal(garnacha.detail, "Demo Valley Cellars");

    const rose = rowOf(ROSE);
    assert.deepEqual(rose.needs, ["maker", "strength", "vintage"]);
    assert.equal(rose.needLine, "Needs winery, strength and vintage");
    assert.match(rose.detail, /Ros/);
  });

  test("coffee and tea need origin, never strength or vintage", () => {
    const row = rowOf(COFFEE);
    assert.deepEqual(row.needs, ["maker", "origin"]);
    assert.equal(row.needLine, "Needs roaster and origin");
    assert.deepEqual(
      needsOf("TEA", { name: "x", brandName: "y" }, "UNANSWERED"),
      ["style", "origin"],
    );
  });

  test("a beer is never asked for a vintage", () => {
    assert.deepEqual(
      needsOf(
        "BEER",
        {
          name: "x",
          brandName: "y",
          attributes: { style: "IPA", [STRENGTH_KEY]: 6 },
        },
        "UNANSWERED",
      ),
      [],
    );
  });

  test("a draft without a name is still a row", () => {
    const row = rowOf({ ...COFFEE, draftFields: {}, displayName: null });
    assert.equal(row.title, "Unnamed coffee");
    assert.equal(row.needs[0], "name");
  });

  test("the server's floor is inside the needs: no needs left means it confirms", () => {
    for (const type of [
      "WINE",
      "BEER",
      "SPIRIT",
      "COFFEE",
      "SAKE",
      "TEA",
    ] as const) {
      const spec = kindSpec(type);
      for (const required of REQUIRED_ITEM_ATTRIBUTES[type]) {
        assert.ok(
          required.field === spec.style.key || required.field === STRENGTH_KEY,
          `${type}.${required.field} is a need`,
        );
      }
    }
  });

  test("chip counts: most first, zeros hidden", () => {
    const rows = [GARNACHA, ROSE, COFFEE].map(rowOf);
    // Ties keep the chips' own order (Name, Maker, Style, Strength, ...).
    assert.deepEqual(needCounts(rows), [
      { need: "maker", count: 2 },
      { need: "strength", count: 2 },
      { need: "vintage", count: 2 },
      { need: "style", count: 1 },
      { need: "origin", count: 1 },
    ]);
    assert.equal(bottlesLine(1), "1 bottle");
    assert.equal(bottlesLine(50), "50 bottles");
  });
});

describe("finishPlan", () => {
  test("filling one need of several keeps the draft listed", () => {
    const plan = finishPlan(ROSE, { maker: "Demo Valley Cellars" });
    assert.equal(plan.complete, false);
    assert.deepEqual(plan.needs, ["strength", "vintage"]);
    assert.equal(plan.save.fields.brandName, "Demo Valley Cellars");
    assert.ok(plan.save.confirmedFields.includes("brandName"));
  });

  test("filling every need completes it; NV is an explicit null vintage", () => {
    const plan = finishPlan(ROSE, {
      maker: "Demo Valley Cellars",
      strength: 12.5,
      vintage: "NV",
    });
    assert.equal(plan.complete, true);
    assert.equal(plan.save.vintageAnswer, "NON_VINTAGE");
    const input = confirmInput(plan);
    assert.equal(input.name, "Dockside Rosé");
    assert.equal(input.attributes.vintage, null);
    assert.equal(input.attributes[STRENGTH_KEY], 12.5);
  });

  test("blank edits change nothing and confirm nothing", () => {
    const plan = finishPlan(COFFEE, { maker: "  ", origin: "" });
    assert.deepEqual(plan.save.fields, COFFEE.draftFields);
    assert.deepEqual(plan.save.confirmedFields, []);
  });

  test("writes stay on the draft's own cellar: the save names it, the confirm names none", () => {
    const plan = finishPlan(GARNACHA, {
      style: "RED",
      strength: 14,
      vintage: 2019,
    });
    assert.equal(plan.save.cellarId, "c-home");
    assert.equal(plan.complete, true);
    const input = confirmInput(plan) as Record<string, unknown>;
    assert.equal("cellarId" in input, false);
    assert.equal("cellarItemId" in input, false);
    assert.equal(
      input.attributes && (input.attributes as { vintage: string }).vintage,
      "2019-01-01",
    );
  });

  test("Undo puts back exactly what was saved before", () => {
    assert.deepEqual(restoreInput(ROSE), {
      onboardingId: ROSE.id,
      cellarId: "c-lake",
      fields: ROSE.draftFields,
      confirmedFields: ["name"],
      vintageAnswer: "UNANSWERED",
    });
  });
});

describe("drafts documents stay under the API's row limit", () => {
  const schema = buildSchema(
    readFileSync(
      fileURLToPath(
        new URL(
          "../../../../../packages/schema/schema.graphql",
          import.meta.url,
        ),
      ),
      "utf8",
    ),
  );
  const operations = Object.entries(queries).filter(
    (entry): entry is [string, DocumentNode] =>
      typeof entry[1] === "object" &&
      entry[1] !== null &&
      (entry[1] as { kind?: unknown }).kind === Kind.DOCUMENT &&
      (entry[1] as DocumentNode).definitions.some(
        (d) => d.kind === Kind.OPERATION_DEFINITION,
      ),
  );
  test("there are documents to check", () => {
    assert.ok(operations.length >= 5, `found ${operations.length}`);
  });
  for (const [name, document] of operations) {
    test(name, () => {
      assert.deepEqual(
        validate(schema, document, [queryCostRule()]).map((e) => e.message),
        [],
      );
    });
  }
});

describe("chipWord: the kind's own word for the Maker chip", () => {
  test("rows of one kind use that kind's word; mixed kinds keep Maker", () => {
    assert.equal(chipWord("maker", [rowOf(GARNACHA), rowOf(ROSE)]), "Winery");
    assert.equal(chipWord("maker", [rowOf(COFFEE)]), "Roaster");
    assert.equal(chipWord("maker", [rowOf(GARNACHA), rowOf(COFFEE)]), "Maker");
    assert.equal(chipWord("style", [rowOf(GARNACHA)]), "Style");
  });
});
