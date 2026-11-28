import { describe, expect, it } from "vitest";
import {
  BAR_KIND_KEYS,
  BAR_KINDS,
  BASE_SPIRIT_KINDS,
  type BarBottle,
  type BarInventory,
  barKindLabel,
  baseSpiritOf,
  bottleKind,
  classifyText,
  EMPTY_BAR_INVENTORY,
  inferIngredientMeta,
  ingredientAvailability,
  isBarKind,
  isPantryKind,
  kindsSatisfiedBy,
  normaliseForMatch,
  PANTRY_KINDS,
  PANTRY_SECTIONS,
  recipeMakeability,
  resolveKind,
} from "./bar.ts";

const bottle = (
  overrides: Partial<BarBottle> & Pick<BarBottle, "kind">,
): BarBottle => ({
  cellarItemId: `ci-${overrides.kind ?? "none"}`,
  cellarId: "cellar-1",
  itemType: "SPIRIT",
  itemId: `item-${overrides.kind ?? "none"}`,
  name: overrides.kind ?? "Mystery",
  percentageRemaining: 100,
  opened: false,
  ...overrides,
});

describe("the vocabulary", () => {
  it("names only kinds that exist as parents", () => {
    for (const kind of BAR_KIND_KEYS) {
      const parent = BAR_KINDS[kind].parent;
      if (parent !== undefined) expect(isBarKind(parent), kind).toBe(true);
    }
  });

  it("has about thirty pantry toggles, each in a section (D23)", () => {
    expect(PANTRY_KINDS.length).toBeGreaterThanOrEqual(28);
    expect(PANTRY_KINDS.length).toBeLessThanOrEqual(34);
    const sectioned = PANTRY_SECTIONS.flatMap((section) => section.groups);
    for (const kind of BAR_KIND_KEYS) {
      if (BAR_KINDS[kind].pantry === true) {
        expect(sectioned, kind).toContain(BAR_KINDS[kind].group);
        expect(PANTRY_KINDS).toContain(kind);
      }
    }
    expect(new Set(PANTRY_KINDS).size).toBe(PANTRY_KINDS.length);
  });

  it("keeps cellar spirits out of the pantry: they count automatically", () => {
    expect(isPantryKind("bourbon")).toBe(false);
    expect(isPantryKind("lime")).toBe(true);
    expect(isPantryKind("nonsense")).toBe(false);
  });

  it("base spirits are the spirit group", () => {
    expect(BASE_SPIRIT_KINDS).toContain("bourbon");
    expect(BASE_SPIRIT_KINDS).not.toContain("lime");
    expect(BASE_SPIRIT_KINDS).not.toContain("sweet_vermouth");
  });

  it("labels stored and unknown kinds", () => {
    expect(barKindLabel("sweet_vermouth")).toBe("Sweet vermouth");
    expect(barKindLabel("mystery_thing")).toBe("Mystery thing");
    expect(barKindLabel(null)).toBeNull();
  });
});

describe("classifyText: longest whole-word match", () => {
  it.each([
    ["2 oz bourbon", "bourbon"],
    ["Rittenhouse Rye", "rye"],
    ["fresh lime juice", "lime"],
    ["Ginger beer", "ginger_beer"],
    ["Orange bitters", "orange_bitters"],
    ["Peychaud's Bitters", "peychauds"],
    ["Angostura", "aromatic_bitters"],
    ["Campari", "red_bitter"],
    ["Cointreau", "orange_liqueur"],
    ["Luxardo maraschino cherry", "cherries"],
    ["Luxardo Maraschino", "maraschino"],
    ["Crème de cassis", null],
    ["peach liqueur", null],
    ["Carpano Antica Formula", "sweet_vermouth"],
    ["Dry vermouth", "dry_vermouth"],
    ["vermouth", "vermouth"],
    ["Club soda", "soda_water"],
    ["egg white", "egg"],
    ["rosemary sprig", null],
    ["Prosecco", "sparkling_wine"],
  ])("%s → %s", (text, expected) => {
    expect(classifyText(text)).toBe(expected);
  });

  it("matches whole words only", () => {
    expect(classifyText("ginger")).toBeNull();
    expect(classifyText("gingerbread syrup")).toBeNull();
  });

  it("can be limited to groups", () => {
    expect(classifyText("Pineapple Rum", ["spirit"])).toBe("rum");
    expect(classifyText("Pineapple", ["spirit"])).toBeNull();
  });

  it("normalises accents and apostrophes", () => {
    expect(normaliseForMatch("Peychaud’s Crème")).toBe(" peychauds creme ");
  });
});

describe("bottleKind", () => {
  it("reads a spirit's name when it agrees with its type", () => {
    expect(
      bottleKind({
        type: "SPIRIT",
        name: "Rittenhouse Rye",
        spiritType: "WHISKEY",
      }),
    ).toBe("rye");
    expect(
      bottleKind({
        type: "SPIRIT",
        name: "Basil Hayden Dark Rye",
        spiritType: "BOURBON",
      }),
    ).toBe("rye");
  });

  it("falls back to the type when the name points elsewhere", () => {
    expect(
      bottleKind({
        type: "SPIRIT",
        name: "Orange Grove Reserve",
        spiritType: "BOURBON",
      }),
    ).toBe("bourbon");
    expect(
      bottleKind({
        type: "SPIRIT",
        name: "Buffalo Trace",
        spiritType: "BOURBON",
      }),
    ).toBe("bourbon");
  });

  it("lets the name decide for the catch-all types", () => {
    expect(
      bottleKind({
        type: "SPIRIT",
        name: "Carpano Antica Formula",
        spiritType: "AMARO_APERITIF_VERMOUTH",
      }),
    ).toBe("sweet_vermouth");
    expect(
      bottleKind({ type: "SPIRIT", name: "Cointreau", spiritType: "LIQUEURS" }),
    ).toBe("orange_liqueur");
    expect(
      bottleKind({
        type: "SPIRIT",
        name: "Peach Schnapps",
        spiritType: "LIQUEURS",
      }),
    ).toBe("liqueur");
  });

  it("reads wines by style and the other types by type", () => {
    expect(
      bottleKind({ type: "WINE", name: "Veuve", wineStyle: "SPARKLING" }),
    ).toBe("sparkling_wine");
    expect(
      bottleKind({
        type: "WINE",
        name: "10 Year Tawny Port",
        wineStyle: "DESSERT",
      }),
    ).toBe("port");
    expect(bottleKind({ type: "COFFEE", name: "Ethiopia" })).toBe("coffee");
    expect(
      bottleKind({ type: "SPIRIT", name: "Unknown", spiritType: null }),
    ).toBeNull();
  });
});

describe("resolveKind", () => {
  it("keeps a stored kind", () => {
    expect(
      resolveKind({ name: "Lime juice", refType: "GENERIC", kind: "lemon" }),
    ).toBe("lemon");
  });

  it("reads a specific bottle's kind", () => {
    expect(
      resolveKind({
        name: "Elijah Craig",
        refType: "SPIRIT",
        spiritType: "BOURBON",
      }),
    ).toBe("bourbon");
  });

  it("uses the printed brand, then the generic category, then the model", () => {
    expect(
      resolveKind({
        name: "liqueur",
        refType: "GENERIC",
        brandMentioned: "Cointreau",
      }),
    ).toBe("orange_liqueur");
    expect(
      resolveKind({
        name: "House blend",
        refType: "GENERIC",
        genericCategory: "gin",
      }),
    ).toBe("gin");
    expect(
      resolveKind({
        name: "Rhum agricole vieux",
        refType: "GENERIC",
        modelKind: "rum",
      }),
    ).toBe("rum");
    expect(
      resolveKind({
        name: "Crème de violette",
        refType: "GENERIC",
        modelKind: "invented",
      }),
    ).toBeNull();
  });
});

describe("inferIngredientMeta", () => {
  const negroni = [
    { name: "Gin", refType: "GENERIC", quantity: 1, unit: "oz" },
    { name: "Campari", refType: "GENERIC", quantity: 1, unit: "oz" },
    { name: "Sweet vermouth", refType: "GENERIC", quantity: 1, unit: "oz" },
    { name: "Orange peel", refType: "GENERIC" },
  ];

  it("picks the base, modifiers and the garnish", () => {
    expect(inferIngredientMeta(negroni)).toEqual([
      { kind: "gin", role: "base" },
      { kind: "red_bitter", role: "modifier" },
      { kind: "sweet_vermouth", role: "modifier" },
      { kind: "orange", role: "garnish" },
    ]);
    expect(baseSpiritOf(inferIngredientMeta(negroni))).toBe("gin");
  });

  it("makes the largest spirit pour the base", () => {
    const meta = inferIngredientMeta([
      {
        name: "Green Chartreuse",
        refType: "GENERIC",
        quantity: 0.75,
        unit: "oz",
      },
      { name: "Rye", refType: "GENERIC", quantity: 2, unit: "oz" },
      { name: "Lemon juice", refType: "GENERIC", quantity: 0.75, unit: "oz" },
      { name: "Simple syrup", refType: "GENERIC", quantity: 0.5, unit: "oz" },
      {
        name: "Angostura bitters",
        refType: "GENERIC",
        quantity: 2,
        unit: "dashes",
      },
    ]);
    expect(meta.map((entry) => entry.role)).toEqual([
      "modifier",
      "base",
      "acid",
      "sweetener",
      "bitters",
    ]);
  });

  it("keeps muddled mint required and stored roles as stored", () => {
    const meta = inferIngredientMeta([
      { name: "White rum", refType: "GENERIC", quantity: 2, unit: "oz" },
      { name: "Mint leaves", refType: "GENERIC", modelRole: "garnish" },
      { name: "Soda water", refType: "GENERIC", role: "other" },
    ]);
    expect(meta[1]).toEqual({ kind: "mint", role: "other" });
    expect(meta[2]).toEqual({ kind: "soda_water", role: "other" });
  });

  it("uses the model's role only where nothing else is known", () => {
    expect(
      inferIngredientMeta([
        {
          name: "Crème de violette",
          refType: "GENERIC",
          modelRole: "modifier",
        },
      ]),
    ).toEqual([{ kind: null, role: "modifier" }]);
  });

  it("finds a non-spirit base when there is no spirit", () => {
    const meta = inferIngredientMeta([
      { name: "Prosecco", refType: "GENERIC", quantity: 3, unit: "oz" },
      { name: "Aperol", refType: "GENERIC", quantity: 2, unit: "oz" },
      { name: "Soda", refType: "GENERIC", quantity: 1, unit: "oz" },
    ]);
    expect(meta.map((entry) => entry.role)).toEqual([
      "base",
      "modifier",
      "mixer",
    ]);
    expect(baseSpiritOf(meta)).toBeNull();
  });
});

describe("ingredientAvailability (D9)", () => {
  const bar: BarInventory = {
    pantry: ["lime", "simple_syrup", "dry_vermouth"],
    bottles: [
      bottle({
        kind: "bourbon",
        name: "Buffalo Trace",
        opened: false,
        percentageRemaining: 100,
      }),
      bottle({
        kind: "bourbon",
        cellarItemId: "ci-open",
        name: "Old Grand-Dad",
        opened: true,
        percentageRemaining: 40,
      }),
      bottle({ kind: "red_bitter", name: "Campari" }),
      bottle({ kind: "whiskey", name: "Generic Whiskey" }),
    ],
  };

  it("is Have for an exact bottle, preferring the open one", () => {
    const answer = ingredientAvailability({ kind: "bourbon" }, bar);
    expect(answer.status).toBe("HAVE");
    expect(answer.source).toBe("BOTTLE");
    expect(answer.bottle?.cellarItemId).toBe("ci-open");
  });

  it("is Have for the exact catalog item even without a kind", () => {
    const answer = ingredientAvailability(
      { kind: null, item: { type: "SPIRIT", id: "item-red_bitter" } },
      bar,
    );
    expect(answer.status).toBe("HAVE");
    expect(answer.bottle?.name).toBe("Campari");
  });

  it("is Have when a narrower bottle answers a broad ask", () => {
    expect(ingredientAvailability({ kind: "whiskey" }, bar).status).toBe(
      "HAVE",
    );
    expect(ingredientAvailability({ kind: "vermouth" }, bar)).toMatchObject({
      status: "HAVE",
      source: "PANTRY",
      via: "dry_vermouth",
    });
  });

  it("is Have from the pantry and for staples", () => {
    expect(ingredientAvailability({ kind: "lime" }, bar)).toMatchObject({
      status: "HAVE",
      source: "PANTRY",
    });
    expect(
      ingredientAvailability({ kind: "ice" }, EMPTY_BAR_INVENTORY),
    ).toMatchObject({
      status: "HAVE",
      source: "STAPLE",
    });
  });

  it("is Substitute within a family, or from the broader kind", () => {
    expect(ingredientAvailability({ kind: "rye" }, bar)).toMatchObject({
      status: "SUBSTITUTE",
      source: "BOTTLE",
    });
    expect(ingredientAvailability({ kind: "aperol" }, bar)).toMatchObject({
      status: "SUBSTITUTE",
      via: "red_bitter",
    });
    expect(ingredientAvailability({ kind: "honey_syrup" }, bar)).toMatchObject({
      status: "SUBSTITUTE",
      source: "PANTRY",
      via: "simple_syrup",
    });
    expect(ingredientAvailability({ kind: "sweet_vermouth" }, bar).status).toBe(
      "SUBSTITUTE",
    );
  });

  it("is Missing or Unknown otherwise", () => {
    expect(ingredientAvailability({ kind: "gin" }, bar).status).toBe("MISSING");
    expect(ingredientAvailability({ kind: "lemon" }, bar).status).toBe(
      "MISSING",
    );
    expect(ingredientAvailability({ kind: null }, bar).status).toBe("UNKNOWN");
    expect(ingredientAvailability({ kind: "made_up" }, bar).status).toBe(
      "UNKNOWN",
    );
  });
});

describe("recipeMakeability (G29)", () => {
  const bar: BarInventory = {
    pantry: ["sweet_vermouth", "aromatic_bitters"],
    bottles: [bottle({ kind: "rye", name: "Rittenhouse" })],
  };
  const manhattan = [
    { kind: "rye", role: "base", isOptional: false, name: "Rye" },
    { kind: "sweet_vermouth", role: "modifier", isOptional: false },
    { kind: "aromatic_bitters", role: "bitters", isOptional: false },
    { kind: "cherries", role: "garnish", isOptional: false, name: "Cherry" },
  ];

  it("is Make now when only a garnish is missing", () => {
    expect(recipeMakeability(manhattan, bar)).toMatchObject({
      status: "MAKE_NOW",
      missing: [],
      requiredCount: 3,
      haveCount: 3,
      substituteCount: 0,
    });
  });

  it("counts substitutes but still makes it", () => {
    const bourbonBar: BarInventory = {
      ...bar,
      bottles: [bottle({ kind: "bourbon", name: "Buffalo Trace" })],
    };
    expect(recipeMakeability(manhattan, bourbonBar)).toMatchObject({
      status: "MAKE_NOW",
      substituteCount: 1,
    });
  });

  it("is One bottle away with exactly one required thing missing", () => {
    const result = recipeMakeability(
      [
        ...manhattan,
        { kind: "maraschino", role: "modifier", isOptional: false },
      ],
      bar,
    );
    expect(result.status).toBe("ONE_AWAY");
    expect(result.missing).toEqual(["Maraschino liqueur"]);
    expect(result.missingKinds).toEqual(["maraschino"]);
  });

  it("never claims a drink with an untracked ingredient", () => {
    const result = recipeMakeability(
      [
        ...manhattan,
        {
          kind: null,
          role: null,
          isOptional: false,
          name: "Crème de violette",
        },
      ],
      bar,
    );
    expect(result.status).toBe("ONE_AWAY");
    expect(result.missing).toEqual(["Crème de violette"]);
    expect(result.missingKinds).toEqual([]);
  });

  it("skips optional ingredients", () => {
    expect(
      recipeMakeability(
        [
          ...manhattan,
          { kind: "absinthe", role: "modifier", isOptional: true },
        ],
        bar,
      ).status,
    ).toBe("MAKE_NOW");
  });

  it("is Missing with two or more gaps", () => {
    expect(recipeMakeability(manhattan, EMPTY_BAR_INVENTORY).status).toBe(
      "MISSING",
    );
  });
});

describe("kindsSatisfiedBy", () => {
  it("is the kind and its parent", () => {
    expect(kindsSatisfiedBy("bourbon")).toEqual(["bourbon", "whiskey"]);
    expect(kindsSatisfiedBy("gin")).toEqual(["gin"]);
    expect(kindsSatisfiedBy(null)).toEqual([]);
  });
});
