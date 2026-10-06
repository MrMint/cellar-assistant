/**
 * `ITEM_FORM_RULES` against `ITEM_TYPE_SPECS` — the client's half of the
 * one statement of what each item type is.
 *
 * The form rules stay hand-written: labels, help text, picker order and which
 * `ReferenceOptionsQuery` alias feeds a picker are UI decisions the spec has
 * no business making. What the form must not do is *disagree* with the spec
 * about a fact, because every such disagreement has already happened once:
 *
 *  - a key the input does not accept (sake's `vintage` vs `vintageYear`,
 *    `item-form-keys.test.ts`);
 *  - a missing `required`, which lets a confirm through that the actor then
 *    rejects **inside the outbox** (`itemFormRules.ts`'s header);
 *  - a picker whose options are not the column's vocabulary
 *    (`static-options.test.ts`).
 *
 * So this holds, per type: the attribute keys, each field's kind and
 * requiredness, which reference table or enum backs each picker (and, for an
 * enum, exactly which labels), `canCreateDirectly`, `descriptionRequired` and
 * the bag key — all against the spec, which the actors hold to the database
 * (`services/actors/src/lib/item-spec-schema.test.ts`) and the API holds its
 * GraphQL types to (`services/api/src/schema/item-spec-parity.test.ts`).
 *
 * ## Why it imports the spec by subpath
 *
 * Through the `./item-types` subpath rather than the package root, for the
 * same reason `src/lib/items/barcode.ts` uses `./barcodes`: the root barrel
 * reaches `node:crypto`. The spec module imports nothing at runtime but
 * `enums.ts`.
 *
 *   bun run --filter @cellar-assistant/client test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ITEM_TYPE_SPECS,
  type ItemAttributeSpec,
  itemAttributeEntries,
} from "@cellar-assistant/contracts/item-types";
import {
  ATTRIBUTE_INPUT_KEY,
  type AttributeField,
  attributesFrom,
  attributesToSave,
  ITEM_FORM_RULES,
  STATIC_OPTIONS,
} from "../../components/item-api/itemFormRules.ts";
import { ITEM_TYPES } from "../../components/item-api/itemTypes.ts";

/** `wine_style` → `wineStyle`: the `ReferenceOptionsQuery` alias convention. */
const aliasOf = (reference: string): string =>
  reference.replace(/_([a-z])/g, (_match, letter: string) =>
    letter.toUpperCase(),
  );

/** The form kind a spec attribute implies. */
const formKindOf = (attribute: ItemAttributeSpec): AttributeField["kind"] => {
  if (attribute.vocabulary?.kind === "reference") return "reference";
  if (attribute.vocabulary?.kind === "static") return "static";
  switch (attribute.kind) {
    case "text":
      return "text";
    case "date":
      return "date";
    case "year":
      return "year";
    case "integer":
    case "decimal":
      return "number";
    case "boolean":
      return "boolean";
  }
};

describe("ITEM_FORM_RULES against ITEM_TYPE_SPECS", () => {
  test("covers exactly the spec's item types", () => {
    assert.deepEqual(
      [...ITEM_TYPES].sort(),
      Object.keys(ITEM_TYPE_SPECS).sort(),
    );
  });

  for (const type of ITEM_TYPES) {
    const spec = ITEM_TYPE_SPECS[type];
    const rules = ITEM_FORM_RULES[type];
    const byKey = new Map(rules.attributes.map((field) => [field.key, field]));

    test(`${type}: one form field per spec attribute`, () => {
      assert.deepEqual(
        [...byKey.keys()].sort(),
        itemAttributeEntries(type)
          .map(([key]) => key)
          .sort(),
      );
    });

    test(`${type}: kind, requiredness and vocabulary match the spec`, () => {
      for (const [key, attribute] of itemAttributeEntries(type)) {
        const field = byKey.get(key);
        assert.ok(field, `${type}.${key} has no form field`);
        assert.equal(field.kind, formKindOf(attribute), `${type}.${key} kind`);
        assert.equal(
          field.required === true,
          attribute.required,
          `${type}.${key} required`,
        );
        const vocabulary = attribute.vocabulary;
        if (vocabulary?.kind === "reference") {
          assert.equal(
            field.reference,
            aliasOf(vocabulary.reference),
            `${type}.${key} reads the wrong reference table`,
          );
        }
        if (vocabulary?.kind === "static") {
          const options =
            field.options === undefined
              ? undefined
              : STATIC_OPTIONS[field.options];
          assert.deepEqual(
            [...(options ?? [])].sort(),
            [...vocabulary.values].sort(),
            `${type}.${key} offers labels its enum does not have, or misses some`,
          );
        }
      }
    });

    test(`${type}: create rules and bag key match the spec`, () => {
      assert.equal(rules.canCreateDirectly, !spec.onboardingRequired);
      assert.equal(rules.descriptionRequired, spec.descriptionRequired);
      assert.equal(ATTRIBUTE_INPUT_KEY[type], spec.bag);
    });
  }
});

/**
 * UI parity G12/G13 — the edit form's round trip for the new attributes, and
 * above all the tri-state booleans: a saved `false` must come back as `false`
 * (not "not recorded"), and a `null` must come back untouched (not `false`).
 * Load is `attributesFrom` over what `ItemAttributesFragment` returns; save is
 * `attributesToSave`, the bag `updateItem` receives.
 */
describe("edit form round trip (UI parity G12, G13)", () => {
  test("TEA: booleans and the six text fields survive load → shown → save unchanged", () => {
    const loaded = {
      __typename: "Tea",
      category: null,
      region: "Uji",
      oxidationLevel: "light",
      processing: "steamed",
      ingredients: null,
      steepingTemperature: "80°C",
      steepingTime: "2 min",
      flavorProfile: "grassy",
      isOrganic: false,
      isFairTrade: null,
    };
    const shown = attributesFrom(loaded, "TEA");
    assert.equal(
      shown.isOrganic,
      "false",
      "a recorded false is shown as false",
    );
    assert.equal(shown.isFairTrade, undefined, "null stays 'not recorded'");

    const saved = attributesToSave("TEA", shown);
    assert.deepEqual(saved, {
      region: "Uji",
      oxidationLevel: "light",
      processing: "steamed",
      steepingTemperature: "80°C",
      steepingTime: "2 min",
      flavorProfile: "grassy",
      isOrganic: false,
    });
    assert.equal("isFairTrade" in saved, false, "not recorded is not cleared");

    // Ticking the boxes sends true, not the string "true".
    const ticked = attributesToSave("TEA", {
      ...shown,
      isOrganic: "true",
      isFairTrade: "true",
    });
    assert.equal(ticked.isOrganic, true);
    assert.equal(ticked.isFairTrade, true);
  });

  test("SAKE: the four G12 fields round-trip, numerics as numbers", () => {
    const loaded = {
      __typename: "Sake",
      sakeMeterValue: -2.5,
      acidity: 1.4,
      aminoAcid: null,
      yeastStrain: "kyokai no. 9",
    };
    assert.deepEqual(attributesToSave("SAKE", attributesFrom(loaded, "SAKE")), {
      sakeMeterValue: -2.5,
      acidity: 1.4,
      yeastStrain: "kyokai no. 9",
    });
  });
});
