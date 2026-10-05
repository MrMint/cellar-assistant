import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ITEM_FORM_RULES } from "@/components/item-api/itemFormRules";
import {
  addableCellars,
  brandFromNode,
  cellarFromNode,
  cellarItemRedirect,
  checkInFromNode,
  groupCheckInsByDay,
  isCellarOwner,
  itemCharacteristics,
  itemShareUrl,
  itemSubtitlePhrases,
  myReviewFromRow,
  recipeIngredientFromNode,
  reviewFromRow,
  teaTextCards,
  tierListEntryFromNode,
} from "./adapter";
import { dateFromYear, formLayout, yearFromDate } from "./itemFormLayout";

const core = { name: "X", description: null, country: "FRANCE" };

describe("itemSubtitlePhrases (the old subTitlePhrases, per type)", () => {
  test("wine: vintage, variety, country, region, ABV", () => {
    assert.deepEqual(
      itemSubtitlePhrases("WINE", core, {
        vintage: "2019-06-01",
        variety: "PINOT_GRIGIO_PINOT_GRIS",
        region: "Alsace",
        alcoholContentPercentage: 12.5,
      }),
      ["2019", "Pinot Grigio", "France", "Alsace", "12.5%"],
    );
  });

  test("beer reads the aliased style; missing values stay undefined", () => {
    assert.deepEqual(
      itemSubtitlePhrases(
        "BEER",
        { ...core, country: null },
        {
          beerStyle: "IPA",
        },
      ),
      [undefined, undefined, "Ipa", undefined],
    );
  });

  test("spirit: vintage, type, free-text style, country, ABV", () => {
    assert.deepEqual(
      itemSubtitlePhrases("SPIRIT", core, {
        spiritType: "BRANDY_COGNAC",
        spiritStyle: "VSOP",
        alcoholContentPercentage: 40,
      }),
      [undefined, "Brandy & Cognac", "VSOP", "France", "40%"],
    );
  });

  test("coffee, sake and tea", () => {
    assert.deepEqual(
      itemSubtitlePhrases("COFFEE", core, {
        roastLevel: "MEDIUM_DARK",
        species: "ARABICA",
      }),
      ["Medium Dark", "France", "Arabica", undefined],
    );
    assert.deepEqual(
      itemSubtitlePhrases("SAKE", core, {
        category: "JUNMAI_GINJO",
        sakeType: "DRY",
        region: "Niigata",
      }),
      ["Junmai Ginjo", "Dry", "France", "Niigata"],
    );
    assert.deepEqual(
      itemSubtitlePhrases("TEA", core, {
        category: "OOLONG",
        form: "loose_leaf",
      }),
      ["Oolong", "Loose Leaf", "France", undefined],
    );
  });
});

describe("itemCharacteristics (sake/tea chips, old order and labels)", () => {
  test("sake: units added, empties dropped, zero kept", () => {
    assert.deepEqual(
      itemCharacteristics("SAKE", {
        category: "JUNMAI",
        polishGrade: 60,
        sakeMeterValue: 0,
        yeastStrain: "",
        servingTemperature: "hiya",
        vintageYear: 2021,
      }),
      [
        { label: "Category", value: "Junmai" },
        { label: "Polish Grade", value: "60%" },
        { label: "SMV", value: 0 },
        { label: "Serving Temp", value: "Hiya" },
        { label: "Vintage", value: 2021 },
      ],
    );
  });

  test("tea: booleans show Yes only when true (G13)", () => {
    const chips = itemCharacteristics("TEA", {
      category: "GREEN",
      harvestYear: 2024,
      steepingTemperature: "80°C",
      isOrganic: true,
      isFairTrade: false,
    });
    assert.deepEqual(chips, [
      { label: "Category", value: "Green" },
      { label: "Harvest Year", value: 2024 },
      { label: "Steep Temp", value: "80°C" },
      { label: "Organic", value: "Yes" },
    ]);
  });

  test("other types have none", () => {
    assert.deepEqual(itemCharacteristics("WINE", { region: "x" }), []);
  });

  test("tea text cards", () => {
    assert.deepEqual(
      teaTextCards("TEA", { flavorProfile: "Grassy", ingredients: "" }),
      { flavorProfile: "Grassy", ingredients: null },
    );
    assert.deepEqual(teaTextCards("SAKE", { flavorProfile: "x" }), {
      flavorProfile: null,
      ingredients: null,
    });
  });
});

describe("rows", () => {
  test("a review: author from user (G4), text through the Lexical reader", () => {
    const review = reviewFromRow({
      id: "r1",
      score: 4.5,
      text: { body: "Lovely" },
      createdAt: "2026-01-02T03:04:05.000Z",
      userId: "u1",
      user: { id: "u1", displayName: "Ann", avatarUrl: null },
    });
    assert.equal(review.score, 4.5);
    assert.deepEqual(review.user, { displayName: "Ann", avatarUrl: "" });
    assert.match(review.text ?? "", /"text":"Lovely"/);
  });

  test("a review with no visible author and no text", () => {
    const review = reviewFromRow({
      id: "r2",
      score: 1,
      text: null,
      createdAt: "2026-01-02T03:04:05.000Z",
      userId: "u9",
      user: null,
    });
    assert.equal(review.user.displayName, "Unknown user");
    assert.equal(review.text, null);
  });

  test("myReview: null stays null", () => {
    assert.equal(myReviewFromRow(null), null);
    assert.equal(myReviewFromRow({ id: "r", score: 3, text: "hi" })?.score, 3);
  });

  test("a cellar: creator and co-owners as the old users", () => {
    assert.deepEqual(
      cellarFromNode({
        id: "c1",
        name: "Home",
        createdById: "u1",
        createdBy: { id: "u1", displayName: "Ann", avatarUrl: "a.png" },
        coOwners: { edges: [{ node: { id: "u2", displayName: "Bo" } }] },
      }),
      {
        id: "c1",
        name: "Home",
        createdBy: { id: "u1", displayName: "Ann", avatarUrl: "a.png" },
        co_owners: [{ id: "u2", displayName: "Bo", avatarUrl: "" }],
      },
    );
  });

  test("a tier-list entry whose list went invisible", () => {
    assert.deepEqual(
      tierListEntryFromNode({ id: "t", band: 5, tierList: null }),
      {
        id: "t",
        band: 5,
        tier_list: null,
      },
    );
  });

  test("a recipe line and a brand, snake-cased for the old props", () => {
    assert.deepEqual(
      recipeIngredientFromNode({
        id: "ri",
        quantity: 1.5,
        unit: "oz",
        isOptional: false,
        recipe: {
          id: "rc",
          name: "Sour",
          type: "cocktail",
          difficultyLevel: 2,
        },
      }),
      {
        id: "ri",
        quantity: 1.5,
        unit: "oz",
        is_optional: false,
        recipe: {
          id: "rc",
          name: "Sour",
          type: "cocktail",
          image_url: null,
          difficulty_level: 2,
        },
      },
    );
    assert.deepEqual(
      brandFromNode({
        id: "ib",
        isPrimary: true,
        brand: { id: "b", name: "Vietti", brandType: "winery", logoUrl: null },
      }),
      {
        id: "ib",
        is_primary: true,
        brand: {
          id: "b",
          name: "Vietti",
          logo_url: null,
          brand_type: "winery",
        },
      },
    );
  });

  test("check-ins group by UTC day, newest-first order kept", () => {
    const rows = [
      checkInFromNode({
        id: "a",
        createdAt: "2026-03-02T23:00:00Z",
        userId: "u1",
      }),
      checkInFromNode({
        id: "b",
        createdAt: "2026-03-02T01:00:00Z",
        userId: "u2",
      }),
      checkInFromNode({
        id: "c",
        createdAt: "2026-03-01T12:00:00Z",
        userId: "u1",
      }),
    ];
    assert.deepEqual(
      groupCheckInsByDay(rows).map(([day, group]) => [
        day,
        group.map((x) => x.id),
      ]),
      [
        ["2026-03-02", ["a", "b"]],
        ["2026-03-01", ["c"]],
      ],
    );
  });
});

describe("permissions", () => {
  const cellars = [
    { id: "own", name: "Own", createdById: "me", coOwnerIds: [] },
    { id: "co", name: "Co", createdById: "x", coOwnerIds: ["me"] },
    { id: "friend", name: "Friend's", createdById: "x", coOwnerIds: [] },
  ];

  test("Add to Cellar offers own and co-owned cellars only", () => {
    assert.deepEqual(
      addableCellars(cellars, "me").map((c) => c.id),
      ["own", "co"],
    );
    assert.deepEqual(addableCellars(cellars, null), []);
  });

  test("isCellarOwner: creator or co-owner", () => {
    assert.equal(isCellarOwner(cellars[1] ?? cellars[0], "me"), true);
    assert.equal(isCellarOwner(cellars[2] ?? cellars[0], "me"), false);
  });
});

describe("cellarItemRedirect (decision 1)", () => {
  const base = { cellarId: "c", type: "WINE" as const, id: "x" };

  test("a bottle of this type renders", () => {
    assert.equal(
      cellarItemRedirect({
        ...base,
        bottle: { id: "x", itemType: "WINE" },
        bottleForId: null,
      }),
      null,
    );
  });

  test("a bottle of another type goes to its own segment", () => {
    assert.equal(
      cellarItemRedirect({
        ...base,
        bottle: { id: "x", itemType: "TEA" },
        bottleForId: null,
      }),
      "/cellars/c/teas/x",
    );
  });

  test("an item id with one bottle here goes to the bottle", () => {
    assert.equal(
      cellarItemRedirect({ ...base, bottle: null, bottleForId: "b1" }),
      "/cellars/c/wines/b1",
    );
  });

  test("anything else goes to the item page", () => {
    assert.equal(
      cellarItemRedirect({ ...base, bottle: null, bottleForId: null }),
      "/wines/x",
    );
  });

  test("the share URL is absolute, with its scheme", () => {
    assert.equal(
      itemShareUrl("https://cellar.test/", "SAKE", "s1"),
      "https://cellar.test/sakes/s1",
    );
  });
});

describe("itemFormLayout (the old forms' order and labels)", () => {
  const labels = (type: Parameters<typeof formLayout>[0]) =>
    formLayout(type).map((entry) => entry.label);

  test("wine", () => {
    assert.deepEqual(labels("WINE"), [
      "Name",
      "Vintage",
      "Description",
      "Style",
      "Variety",
      "Country",
      "Region",
      "Alcohol Content",
      "Vineyard Designation",
      "Special Designation",
    ]);
  });

  test("tea ends with its two checkboxes", () => {
    const layout = formLayout("TEA");
    assert.deepEqual(
      layout
        .slice(-2)
        .map((entry) =>
          entry.kind === "attribute" ? entry.field.kind : entry.kind,
        ),
      ["boolean", "boolean"],
    );
  });

  test("every type's layout covers every attribute ITEM_FORM_RULES has", () => {
    for (const type of [
      "WINE",
      "BEER",
      "SPIRIT",
      "COFFEE",
      "SAKE",
      "TEA",
    ] as const) {
      const keys = formLayout(type).flatMap((entry) =>
        entry.kind === "attribute" ? [entry.field.key] : [],
      );
      assert.equal(new Set(keys).size, keys.length, `${type} repeats a field`);
      assert.deepEqual(
        [...keys].sort(),
        ITEM_FORM_RULES[type].attributes.map((field) => field.key).sort(),
        `${type}'s form drops or invents a field`,
      );
    }
  });

  test("a vintage year round-trips without losing the stored day", () => {
    assert.equal(yearFromDate("2019-06-01"), "2019");
    assert.equal(dateFromYear("2019", "2019-06-01"), "2019-06-01");
    assert.equal(dateFromYear("2020", "2019-06-01"), "2020-01-01");
    assert.equal(dateFromYear("", "2019-06-01"), "");
  });
});
