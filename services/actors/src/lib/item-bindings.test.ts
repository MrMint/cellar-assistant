/**
 * `ITEM_BINDINGS` and everything derived from it, against golden copies of the
 * hand-written lists and switch arms they replaced.
 *
 * Pure — no database. The literals below are the values `ItemActor` and
 * `ai/vocabulary.ts` spelled out before `ITEM_TYPE_SPECS` existed, copied
 * verbatim, so "the refactor changed nothing" is an assertion rather than a
 * hope. Order is asserted wherever order was observable: the embedding text
 * (what every stored vector was computed from) and the constrained list (the
 * order the item-defaults schema asks the model for its bag).
 *
 * The database half — that the spec's columns, requiredness and vocabularies
 * are what the tables really declare — is `item-spec-schema.test.ts`.
 */
import {
  COFFEE_PROCESSES,
  COFFEE_ROAST_LEVELS,
  COFFEE_SPECIES,
  ITEM_TYPE_SPECS,
  ITEM_TYPES,
  type ItemType,
  itemAttributeEntries,
  SAKE_SERVING_TEMPERATURES,
  TEA_CAFFEINE_LEVELS,
  TEA_FORMS,
  ValidationError,
} from "@cellar-assistant/contracts";
import { getTableColumns, getTableName } from "@cellar-assistant/db/orm";
import { describe, expect, it } from "vitest";
import {
  CONSTRAINED_ITEM_ATTRIBUTES,
  DATE_ITEM_ATTRIBUTES,
} from "./ai/vocabulary.ts";
import {
  attributeColumns,
  boundProperty,
  EMBEDDING_PROPERTIES,
  embeddingTextFor,
  ITEM_TABLES,
  type ItemRowOf,
  itemInsertValues,
  itemRowToDto,
} from "./item-bindings.ts";

/* -------------------------------------------------------------------------- */
/* Golden copies                                                               */
/* -------------------------------------------------------------------------- */

/** `ItemActor`'s `EMBEDDING_FIELDS`, verbatim (row property names). */
const GOLDEN_EMBEDDING_FIELDS: Record<ItemType, readonly string[]> = {
  WINE: [
    "name",
    "description",
    "vintage",
    "variety",
    "region",
    "style",
    "country",
    "specialDesignation",
    "vineyardDesignation",
    "alcoholContentPercentage",
  ],
  BEER: [
    "name",
    "description",
    "style",
    "vintage",
    "country",
    "internationalBitternessUnit",
    "alcoholContentPercentage",
  ],
  SPIRIT: [
    "name",
    "description",
    "type",
    "style",
    "vintage",
    "country",
    "alcoholContentPercentage",
  ],
  COFFEE: [
    "name",
    "description",
    "roastLevel",
    "process",
    "species",
    "cultivar",
    "country",
  ],
  SAKE: [
    "name",
    "description",
    "category",
    "type",
    "region",
    "country",
    "polishGrade",
    "riceVariety",
    "servingTemperature",
    "vintage",
    "alcoholContentPercentage",
  ],
  TEA: [
    "name",
    "description",
    "category",
    "form",
    "caffeineLevel",
    "region",
    "country",
    "cultivar",
    "harvestYear",
  ],
};

const ref = (
  field: string,
  column: string,
  reference: string,
  on = "attributes",
) => ({
  field,
  on,
  column,
  source: { kind: "reference", reference },
});
const stat = (field: string, column: string, values: readonly string[]) => ({
  field,
  on: "attributes",
  column,
  source: { kind: "static", values },
});

/** `ai/vocabulary.ts`'s `CONSTRAINED_ITEM_ATTRIBUTES`, verbatim, in order. */
const GOLDEN_CONSTRAINED = {
  WINE: [
    ref("country", "wines.country", "country", "input"),
    ref("style", "wines.style", "wine_style"),
    ref("variety", "wines.variety", "wine_variety"),
  ],
  BEER: [
    ref("country", "beers.country", "country", "input"),
    ref("style", "beers.style", "beer_style"),
  ],
  SPIRIT: [
    ref("country", "spirits.country", "country", "input"),
    ref("spiritType", "spirits.type", "spirit_type"),
  ],
  COFFEE: [
    ref("country", "coffees.country", "country", "input"),
    ref("cultivar", "coffees.cultivar", "coffee_cultivar"),
    stat("roastLevel", "coffees.roast_level", COFFEE_ROAST_LEVELS),
    stat("species", "coffees.species", COFFEE_SPECIES),
    stat("process", "coffees.process", COFFEE_PROCESSES),
  ],
  SAKE: [
    ref("country", "sakes.country", "country", "input"),
    ref("category", "sakes.category", "sake_category"),
    ref("sakeType", "sakes.type", "sake_type"),
    ref("riceVariety", "sakes.rice_variety", "sake_rice_variety"),
    stat(
      "servingTemperature",
      "sakes.serving_temperature",
      SAKE_SERVING_TEMPERATURES,
    ),
  ],
  TEA: [
    ref("country", "teas.country", "country", "input"),
    ref("category", "teas.category", "tea_category"),
    stat("form", "teas.form", TEA_FORMS),
    stat("caffeineLevel", "teas.caffeine_level", TEA_CAFFEINE_LEVELS),
  ],
};

/** `ai/vocabulary.ts`'s `DATE_ITEM_ATTRIBUTES`, verbatim. */
const GOLDEN_DATES = {
  WINE: ["vintage"],
  BEER: ["vintage"],
  SPIRIT: ["vintage"],
  COFFEE: [],
  SAKE: [],
  TEA: [],
};

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const CREATED = new Date("2026-01-02T03:04:05.000Z");
const core = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "N",
  description: "D",
  createdAt: CREATED,
  updatedAt: CREATED,
  createdById: "00000000-0000-4000-8000-000000000002",
  barcodeCode: "0123",
  country: "FRANCE",
  itemOnboardingId: "00000000-0000-4000-8000-000000000003",
};
const coreDto = {
  id: core.id,
  name: "N",
  description: "D",
  createdAt: CREATED.toISOString(),
  updatedAt: CREATED.toISOString(),
  createdById: core.createdById,
  barcodeCode: "0123",
  country: "FRANCE",
};

describe("ITEM_BINDINGS", () => {
  it("binds every spec attribute to a column of that name on the type's table", () => {
    for (const type of ITEM_TYPES) {
      const columns = getTableColumns(ITEM_TABLES[type]) as Record<
        string,
        { name: string }
      >;
      for (const [key, attribute] of itemAttributeEntries(type)) {
        const column = columns[boundProperty(type, key)];
        expect(column?.name, `${type}.${key}`).toBe(attribute.column);
      }
    }
  });

  it("names the spec's table", () => {
    for (const type of ITEM_TYPES) {
      expect(getTableName(ITEM_TABLES[type]), type).toBe(
        ITEM_TYPE_SPECS[type].table,
      );
    }
  });

  it("renames exactly the three wire keys that differ from their property", () => {
    const renamed = ITEM_TYPES.flatMap((type) =>
      itemAttributeEntries(type)
        .filter(([key]) => boundProperty(type, key) !== key)
        .map(([key]) => `${type}.${key}→${boundProperty(type, key)}`),
    );
    expect(renamed).toEqual([
      "SPIRIT.spiritType→type",
      "SAKE.sakeType→type",
      "SAKE.vintageYear→vintage",
    ]);
  });
});

describe("derived lists (golden)", () => {
  it("EMBEDDING_PROPERTIES is ItemActor's EMBEDDING_FIELDS, order included", () => {
    expect(EMBEDDING_PROPERTIES).toEqual(GOLDEN_EMBEDDING_FIELDS);
  });

  it("CONSTRAINED_ITEM_ATTRIBUTES is the hand list, order included", () => {
    expect(CONSTRAINED_ITEM_ATTRIBUTES).toEqual(GOLDEN_CONSTRAINED);
  });

  it("DATE_ITEM_ATTRIBUTES is the hand list", () => {
    expect(DATE_ITEM_ATTRIBUTES).toEqual(GOLDEN_DATES);
  });
});

describe("row → DTO (golden against the old switch arms)", () => {
  it("WINE", () => {
    const row = {
      ...core,
      vintage: "2020-01-01",
      variety: "MERLOT",
      region: "Bordeaux",
      wineryId: null,
      specialDesignation: "Reserve",
      vineyardDesignation: "Clos",
      alcoholContentPercentage: "13.5",
      style: "RED",
    } satisfies ItemRowOf<"WINE">;
    expect(itemRowToDto("WINE", row)).toEqual({
      ...coreDto,
      type: "WINE",
      vintage: "2020-01-01",
      variety: "MERLOT",
      region: "Bordeaux",
      style: "RED",
      specialDesignation: "Reserve",
      vineyardDesignation: "Clos",
      alcoholContentPercentage: 13.5,
    });
  });

  it("SPIRIT renames `type` to `spiritType` and nulls stay null", () => {
    const row = {
      ...core,
      type: "BOURBON",
      vintage: null,
      alcoholContentPercentage: null,
      style: null,
    } satisfies ItemRowOf<"SPIRIT">;
    expect(itemRowToDto("SPIRIT", row)).toEqual({
      ...coreDto,
      type: "SPIRIT",
      spiritType: "BOURBON",
      style: null,
      vintage: null,
      alcoholContentPercentage: null,
    });
  });

  it("SAKE renames `type`/`vintage` and parses both numerics", () => {
    const row = {
      ...core,
      itemOnboardingId: null,
      region: "Niigata",
      category: "daiginjo",
      type: "dry",
      polishGrade: "50.00",
      alcoholContentPercentage: "15.50",
      servingTemperature: "hiya" as const,
      riceVariety: "yamada_nishiki",
      yeastStrain: "kyokai no. 9",
      sakeMeterValue: "3.50",
      acidity: "1.40",
      aminoAcid: null,
      vintage: 2019,
    } satisfies ItemRowOf<"SAKE">;
    expect(itemRowToDto("SAKE", row)).toEqual({
      ...coreDto,
      type: "SAKE",
      category: "daiginjo",
      sakeType: "dry",
      region: "Niigata",
      polishGrade: 50,
      servingTemperature: "hiya",
      riceVariety: "yamada_nishiki",
      vintageYear: 2019,
      alcoholContentPercentage: 15.5,
      // UI parity G12: the four columns that were never read.
      sakeMeterValue: 3.5,
      acidity: 1.4,
      aminoAcid: null,
      yeastStrain: "kyokai no. 9",
    });
  });

  it("TEA reads the eight G13 columns, booleans as booleans and null as null", () => {
    const row = {
      ...core,
      itemOnboardingId: null,
      category: null,
      form: null,
      caffeineLevel: null,
      region: null,
      cultivar: null,
      harvestYear: null,
      oxidationLevel: "light",
      processing: "steamed",
      ingredients: null,
      steepingTemperature: "80°C",
      steepingTime: "2 min",
      flavorProfile: "grassy",
      isOrganic: false,
      isFairTrade: null,
    } satisfies ItemRowOf<"TEA">;
    expect(itemRowToDto("TEA", row)).toMatchObject({
      type: "TEA",
      oxidationLevel: "light",
      processing: "steamed",
      ingredients: null,
      steepingTemperature: "80°C",
      steepingTime: "2 min",
      flavorProfile: "grassy",
      // `false` is a recorded answer; it must not collapse into "not recorded".
      isOrganic: false,
      isFairTrade: null,
    });
    expect(
      attributeColumns("TEA", { isOrganic: true, isFairTrade: null }),
    ).toEqual({ isOrganic: true, isFairTrade: null });
  });
});

describe("the write half (golden against #insertValues / #updateValues)", () => {
  it("a beer insert carries every attribute, numerics as strings", () => {
    expect(
      itemInsertValues(
        "BEER",
        {
          name: "ignored — the row's name wins",
          itemOnboardingId: core.itemOnboardingId,
          beer: { style: "ALTBIER", alcoholContentPercentage: 5.2 },
        },
        { id: core.id, name: "N", createdById: core.createdById },
      ),
    ).toEqual({
      id: core.id,
      name: "N",
      description: null,
      country: null,
      barcodeCode: null,
      createdById: core.createdById,
      itemOnboardingId: core.itemOnboardingId,
      style: "ALTBIER",
      vintage: null,
      internationalBitternessUnit: null,
      alcoholContentPercentage: "5.2",
    });
  });

  it("a tea needs no onboarding row; a beer does", () => {
    const row = { id: core.id, name: "N", createdById: core.createdById };
    expect(
      itemInsertValues("TEA", { name: "N", tea: {} }, row).itemOnboardingId,
    ).toBeNull();
    expect(() => itemInsertValues("BEER", { name: "N" }, row)).toThrow(
      /beers\.item_onboarding_id is NOT NULL/,
    );
  });

  it("refuses a malformed itemOnboardingId as a ValidationError, for required and optional types alike", () => {
    const row = { id: core.id, name: "N", createdById: core.createdById };
    for (const type of ["WINE", "BEER", "SAKE", "TEA"] as const) {
      expect(
        () =>
          itemInsertValues(type, { name: "N", itemOnboardingId: "nope" }, row),
        type,
      ).toThrow(ValidationError);
      expect(
        () =>
          itemInsertValues(type, { name: "N", itemOnboardingId: "nope" }, row),
        type,
      ).toThrow(/itemOnboardingId must be a uuid, got nope/);
    }
    // A well-formed one passes through on an optional type too.
    expect(
      itemInsertValues(
        "SAKE",
        { name: "N", itemOnboardingId: core.itemOnboardingId },
        row,
      ).itemOnboardingId,
    ).toBe(core.itemOnboardingId);
  });

  it("an update patch keeps present keys only, under their row property", () => {
    expect(
      attributeColumns("SAKE", {
        sakeType: "dry",
        vintageYear: null,
        region: undefined,
        polishGrade: 60,
        notAnAttribute: "dropped",
      }),
    ).toEqual({ type: "dry", vintage: null, polishGrade: "60" });
  });
});

describe("embeddingTextFor (golden)", () => {
  it("labels each part with its row property, in the embedding order", () => {
    const row = {
      ...core,
      type: "BOURBON",
      vintage: null,
      alcoholContentPercentage: "45",
      style: "",
    } satisfies ItemRowOf<"SPIRIT">;
    expect(embeddingTextFor({ type: "SPIRIT", id: core.id }, row)).toBe(
      "spirit; name: N; description: D; type: BOURBON; country: FRANCE; " +
        "alcoholContentPercentage: 45",
    );
  });
});
