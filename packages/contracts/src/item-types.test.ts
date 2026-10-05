/**
 * `ITEM_TYPE_SPECS` against what it replaced.
 *
 * Two kinds of proof, both "golden": the spec has to reproduce every hand
 * list and hand type it derives, exactly, before the hand copy is deleted.
 *
 * - **Types** are checked at compile time (`tsc` includes this file): an
 *   `Equal<>` that is not `true` is a type error in `Expect<>`.
 * - **Lists** are checked at runtime against literal copies of the old values.
 */
import { describe, expect, it } from "vitest";
import {
  type ITEM_CORE_EMBEDDED_FIELDS,
  ITEM_TYPE_SPECS,
  type ItemAttributeKey,
  type ItemAttributesInputOf,
  type ItemAttributesOf,
  itemAttributeEntries,
  type Simplify,
} from "./item-types.ts";
import {
  type BeerAttributesInput,
  type BeerDto,
  type CoffeeAttributesInput,
  type CoffeeDto,
  GENERIC_ITEM_KINDS,
  ITEM_ATTRIBUTE_KEY,
  ITEM_TYPES,
  type ItemAttributesInput,
  type ItemDtoOf,
  type ItemType,
  REQUIRED_ITEM_ATTRIBUTES,
  type SakeAttributesInput,
  type SakeDto,
  type SpiritAttributesInput,
  type SpiritDto,
  type TeaAttributesInput,
  type TeaDto,
  type WineAttributesInput,
  type WineDto,
} from "./items.ts";
import { REFERENCE_KINDS } from "./reference.ts";

/* -------------------------------------------------------------------------- */
/* Type-level                                                                  */
/* -------------------------------------------------------------------------- */

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

/*
 * The hand-written types `ITEM_TYPE_SPECS` replaced, kept verbatim as golden
 * fixtures (only `WineDto.vintage` differs: see below). The derived exports
 * must stay *exactly* equal to them — a drift in the spec is a compile error
 * here, not a silently different wire shape.
 */
type GoldenCore = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdById: string;
  readonly barcodeCode: string | null;
  readonly country: string | null;
};

type GoldenWineDto = GoldenCore & {
  readonly type: "WINE";
  /** Was `string | null`; `wines.vintage` is `date NOT NULL` (a8757dc4). */
  readonly vintage: string;
  readonly variety: string | null;
  readonly region: string | null;
  readonly style: string;
  readonly specialDesignation: string | null;
  readonly vineyardDesignation: string | null;
  readonly alcoholContentPercentage: number | null;
};
type GoldenBeerDto = GoldenCore & {
  readonly type: "BEER";
  readonly style: string | null;
  readonly vintage: string | null;
  readonly internationalBitternessUnit: number | null;
  readonly alcoholContentPercentage: number | null;
};
type GoldenSpiritDto = GoldenCore & {
  readonly type: "SPIRIT";
  readonly spiritType: string;
  readonly style: string | null;
  readonly vintage: string | null;
  readonly alcoholContentPercentage: number | null;
};
type GoldenCoffeeDto = GoldenCore & {
  readonly type: "COFFEE";
  readonly roastLevel: string | null;
  readonly process: string | null;
  readonly species: string | null;
  readonly cultivar: string | null;
};
type GoldenSakeDto = GoldenCore & {
  readonly type: "SAKE";
  readonly category: string | null;
  readonly sakeType: string | null;
  readonly region: string | null;
  readonly polishGrade: number | null;
  readonly alcoholContentPercentage: number | null;
  readonly servingTemperature: string | null;
  readonly riceVariety: string | null;
  readonly vintageYear: number | null;
  readonly sakeMeterValue: number | null;
  readonly acidity: number | null;
  readonly aminoAcid: number | null;
  readonly yeastStrain: string | null;
};
type GoldenTeaDto = GoldenCore & {
  readonly type: "TEA";
  readonly category: string | null;
  readonly form: string | null;
  readonly caffeineLevel: string | null;
  readonly region: string | null;
  readonly cultivar: string | null;
  readonly harvestYear: number | null;
  readonly oxidationLevel: string | null;
  readonly processing: string | null;
  readonly ingredients: string | null;
  readonly steepingTemperature: string | null;
  readonly steepingTime: string | null;
  readonly flavorProfile: string | null;
  readonly isOrganic: boolean | null;
  readonly isFairTrade: boolean | null;
};

type GoldenWineInput = {
  readonly vintage?: string | null;
  readonly variety?: string | null;
  readonly region?: string | null;
  readonly style?: string | null;
  readonly specialDesignation?: string | null;
  readonly vineyardDesignation?: string | null;
  readonly alcoholContentPercentage?: number | null;
};
type GoldenBeerInput = {
  readonly style?: string | null;
  readonly vintage?: string | null;
  readonly internationalBitternessUnit?: number | null;
  readonly alcoholContentPercentage?: number | null;
};
type GoldenSpiritInput = {
  readonly spiritType?: string | null;
  readonly style?: string | null;
  readonly vintage?: string | null;
  readonly alcoholContentPercentage?: number | null;
};
type GoldenCoffeeInput = {
  readonly roastLevel?: string | null;
  readonly process?: string | null;
  readonly species?: string | null;
  readonly cultivar?: string | null;
};
type GoldenSakeInput = {
  readonly category?: string | null;
  readonly sakeType?: string | null;
  readonly region?: string | null;
  readonly polishGrade?: number | null;
  readonly alcoholContentPercentage?: number | null;
  readonly servingTemperature?: string | null;
  readonly riceVariety?: string | null;
  readonly vintageYear?: number | null;
  readonly sakeMeterValue?: number | null;
  readonly acidity?: number | null;
  readonly aminoAcid?: number | null;
  readonly yeastStrain?: string | null;
};
type GoldenTeaInput = {
  readonly category?: string | null;
  readonly form?: string | null;
  readonly caffeineLevel?: string | null;
  readonly region?: string | null;
  readonly cultivar?: string | null;
  readonly harvestYear?: number | null;
  readonly oxidationLevel?: string | null;
  readonly processing?: string | null;
  readonly ingredients?: string | null;
  readonly steepingTemperature?: string | null;
  readonly steepingTime?: string | null;
  readonly flavorProfile?: string | null;
  readonly isOrganic?: boolean | null;
  readonly isFairTrade?: boolean | null;
};
type GoldenBags = {
  readonly wine?: GoldenWineInput | null;
  readonly beer?: GoldenBeerInput | null;
  readonly spirit?: GoldenSpiritInput | null;
  readonly coffee?: GoldenCoffeeInput | null;
  readonly sake?: GoldenSakeInput | null;
  readonly tea?: GoldenTeaInput | null;
};

export type InputAssertions = [
  Expect<Equal<Simplify<GoldenWineInput>, WineAttributesInput>>,
  Expect<Equal<Simplify<GoldenBeerInput>, BeerAttributesInput>>,
  Expect<Equal<Simplify<GoldenSpiritInput>, SpiritAttributesInput>>,
  Expect<Equal<Simplify<GoldenCoffeeInput>, CoffeeAttributesInput>>,
  Expect<Equal<Simplify<GoldenSakeInput>, SakeAttributesInput>>,
  Expect<Equal<Simplify<GoldenTeaInput>, TeaAttributesInput>>,
  Expect<Equal<Simplify<GoldenBags>, Simplify<ItemAttributesInput>>>,
  Expect<Equal<WineAttributesInput, ItemAttributesInputOf<"WINE">>>,
];

export type DtoAssertions = [
  Expect<Equal<Simplify<GoldenWineDto>, WineDto>>,
  Expect<Equal<Simplify<GoldenBeerDto>, BeerDto>>,
  Expect<Equal<Simplify<GoldenSpiritDto>, SpiritDto>>,
  Expect<Equal<Simplify<GoldenCoffeeDto>, CoffeeDto>>,
  Expect<Equal<Simplify<GoldenSakeDto>, SakeDto>>,
  Expect<Equal<Simplify<GoldenTeaDto>, TeaDto>>,
  Expect<Equal<Simplify<GoldenWineDto>, ItemDtoOf<"WINE">>>,
  Expect<Equal<AttributesOf<GoldenTeaDto>, ItemAttributesOf<"TEA">>>,
];

/** A golden DTO minus the columns every type shares. */
type AttributesOf<D> = Simplify<Omit<D, keyof GoldenCore | "type">>;

/** Every `embedding` entry names a core field or one of the type's attributes. */
type EmbeddingIsKnown<T extends ItemType> =
  (typeof ITEM_TYPE_SPECS)[T]["embedding"][number] extends
    | (typeof ITEM_CORE_EMBEDDED_FIELDS)[number]
    | ItemAttributeKey<T>
    ? true
    : false;

export type EmbeddingAssertions = [
  Expect<EmbeddingIsKnown<"WINE">>,
  Expect<EmbeddingIsKnown<"BEER">>,
  Expect<EmbeddingIsKnown<"SPIRIT">>,
  Expect<EmbeddingIsKnown<"COFFEE">>,
  Expect<EmbeddingIsKnown<"SAKE">>,
  Expect<EmbeddingIsKnown<"TEA">>,
];

/* -------------------------------------------------------------------------- */
/* Runtime                                                                     */
/* -------------------------------------------------------------------------- */

describe("ITEM_TYPE_SPECS", () => {
  it("has exactly the six item types, in ITEM_TYPES order", () => {
    expect(Object.keys(ITEM_TYPE_SPECS)).toEqual([...ITEM_TYPES]);
  });

  it("reproduces REQUIRED_ITEM_ATTRIBUTES exactly (golden)", () => {
    expect(REQUIRED_ITEM_ATTRIBUTES).toEqual({
      WINE: [
        { field: "vintage", column: "wines.vintage", on: "attributes" },
        { field: "style", column: "wines.style", on: "attributes" },
      ],
      BEER: [],
      SPIRIT: [
        { field: "spiritType", column: "spirits.type", on: "attributes" },
      ],
      COFFEE: [
        { field: "description", column: "coffees.description", on: "input" },
      ],
      SAKE: [],
      TEA: [],
    });
  });

  it("reproduces ITEM_ATTRIBUTE_KEY exactly (golden)", () => {
    expect(ITEM_ATTRIBUTE_KEY).toEqual({
      WINE: "wine",
      BEER: "beer",
      SPIRIT: "spirit",
      COFFEE: "coffee",
      SAKE: "sake",
      TEA: "tea",
    });
  });

  it("makes every item type a generic_items kind, plus `ingredient`", () => {
    expect([...GENERIC_ITEM_KINDS].sort()).toEqual(
      [...ITEM_TYPES.map((type) => type.toLowerCase()), "ingredient"].sort(),
    );
  });

  it("names a real reference table for every reference vocabulary", () => {
    for (const type of ITEM_TYPES) {
      for (const [key, attribute] of itemAttributeEntries(type)) {
        if (attribute.vocabulary?.kind !== "reference") continue;
        expect(REFERENCE_KINDS, `${type}.${key}`).toContain(
          attribute.vocabulary.reference,
        );
      }
    }
  });

  it("gives every attribute a unique wire key and column within its type", () => {
    for (const type of ITEM_TYPES) {
      const columns = itemAttributeEntries(type).map(([, spec]) => spec.column);
      expect(new Set(columns).size, type).toBe(columns.length);
    }
  });

  it("embeds each field at most once", () => {
    for (const type of ITEM_TYPES) {
      const embedding = ITEM_TYPE_SPECS[type].embedding;
      expect(new Set(embedding).size, type).toBe(embedding.length);
    }
  });

  it("marks only kinds the wire can carry", () => {
    for (const type of ITEM_TYPES) {
      for (const [key, attribute] of itemAttributeEntries(type)) {
        expect(
          ["text", "date", "year", "integer", "decimal", "boolean"],
          `${type}.${key}`,
        ).toContain(attribute.kind);
        // A closed vocabulary is a set of strings.
        if (attribute.vocabulary !== null) {
          expect(attribute.kind, `${type}.${key}`).toBe("text");
        }
      }
    }
  });
});
