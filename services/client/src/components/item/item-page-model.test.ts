import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ITEM_TYPES_IN_ORDER } from "@/components/app/TypeChip";
import {
  bottleStateLine,
  bottlesCountLabel,
  cookingRecipes,
  defaultLogBottle,
  itemFacts,
  PRODUCER_TITLE,
  producerTitle,
  tasteCells,
  type YourBottle,
} from "./item-page-model";

const core = { name: "X", description: null, country: "FRANCE" };

describe("tasteCells (X09: You · Friends · Everyone)", () => {
  test("always three cells, in order, each linking down the page", () => {
    const cells = tasteCells({
      mine: null,
      friends: { average: null, count: 0 },
      everyone: { average: null, count: 0 },
    });
    assert.deepEqual(
      cells.map((cell) => [cell.key, cell.label, cell.href]),
      [
        ["you", "You", "#your-review"],
        ["friends", "Friends", "#reviews"],
        ["everyone", "Everyone", "#reviews"],
      ],
    );
  });

  test("no number is words, never a zero", () => {
    const cells = tasteCells({
      mine: null,
      friends: { average: null, count: 0 },
      everyone: { average: null, count: 0 },
    });
    assert.deepEqual(
      cells.map((cell) => [cell.value, cell.note]),
      [
        [null, "Rate it"],
        [null, "No friends' ratings"],
        [null, "No ratings yet"],
      ],
    );
  });

  test("averages carry their counts, singular and plural", () => {
    const cells = tasteCells({
      mine: 4.5,
      friends: { average: 4.25, count: 1 },
      everyone: { average: 3.9, count: 12 },
    });
    assert.deepEqual(
      cells.map((cell) => [cell.value, cell.note]),
      [
        [4.5, "Your rating"],
        [4.25, "1 friend"],
        [3.9, "12 ratings"],
      ],
    );
  });

  test("a count of zero hides an average the server sent anyway", () => {
    const [, friends] = tasteCells({
      mine: null,
      friends: { average: 3, count: 0 },
      everyone: { average: 3, count: 1 },
    });
    assert.equal(friends?.value, null);
  });

  test("never a percentage in any cell's words", () => {
    for (const cell of tasteCells({
      mine: 2,
      friends: { average: 5, count: 3 },
      everyone: { average: 1, count: 2 },
    })) {
      assert.doesNotMatch(cell.note, /%/);
    }
  });
});

describe("itemFacts (X09: a fact sheet for all six types)", () => {
  test("wine: vintage, style, variety, region, country, designations, ABV", () => {
    assert.deepEqual(
      itemFacts("WINE", core, {
        vintage: "2016-01-01",
        wineStyle: "ROSE",
        variety: "SYRAH_SHIRAZ",
        region: "Rhône",
        specialDesignation: "GRAND_CRU",
        vineyardDesignation: "La Landonne",
        alcoholContentPercentage: 13.5,
      }),
      [
        { label: "Vintage", value: "2016" },
        { label: "Style", value: "Rosé" },
        { label: "Variety", value: "Syrah/Shiraz" },
        { label: "Region", value: "Rhône" },
        { label: "Country", value: "France" },
        { label: "Designation", value: "Grand Cru" },
        { label: "Vineyard", value: "La Landonne" },
        { label: "ABV", value: "13.5%" },
      ],
    );
  });

  test("a wine with no vintage is non-vintage, and says so (X19)", () => {
    assert.deepEqual(
      itemFacts("WINE", { ...core, country: null }, { vintage: null }),
      [{ label: "Vintage", value: "NV" }],
    );
  });

  test("beer: style, ABV, IBU", () => {
    assert.deepEqual(
      itemFacts(
        "BEER",
        { ...core, country: null },
        {
          beerStyle: "IPA",
          alcoholContentPercentage: 6.5,
          internationalBitternessUnit: 60,
        },
      ),
      [
        { label: "Style", value: "Ipa" },
        { label: "ABV", value: "6.5%" },
        { label: "IBU", value: "60" },
      ],
    );
  });

  test("spirit: type, free-text style, ABV, country", () => {
    assert.deepEqual(
      itemFacts("SPIRIT", core, {
        spiritType: "BRANDY_COGNAC",
        spiritStyle: "VSOP",
        alcoholContentPercentage: 40,
      }),
      [
        { label: "Type", value: "Brandy & Cognac" },
        { label: "Style", value: "VSOP" },
        { label: "ABV", value: "40%" },
        { label: "Country", value: "France" },
      ],
    );
  });

  test("coffee: roast, species, cultivar, process", () => {
    assert.deepEqual(
      itemFacts(
        "COFFEE",
        { ...core, country: "ETHIOPIA" },
        {
          roastLevel: "LIGHT",
          species: "ARABICA",
          cultivar: "HEIRLOOM",
          process: "WASHED",
        },
      ),
      [
        { label: "Roast", value: "Light" },
        { label: "Species", value: "Arabica" },
        { label: "Cultivar", value: "Heirloom" },
        { label: "Process", value: "Washed" },
        { label: "Country", value: "Ethiopia" },
      ],
    );
  });

  test("sake keeps the restored labels, then region and country", () => {
    const facts = itemFacts(
      "SAKE",
      { ...core, country: "JAPAN" },
      {
        category: "JUNMAI",
        polishGrade: 50,
        aminoAcid: 1.2,
        region: "Niigata",
      },
    );
    assert.deepEqual(facts, [
      { label: "Category", value: "Junmai" },
      { label: "Polish Grade", value: "50%" },
      { label: "Amino Acid", value: "1.2" },
      { label: "Region", value: "Niigata" },
      { label: "Country", value: "Japan" },
    ]);
  });

  test("tea keeps the restored labels ('Steep Temp', 'Organic')", () => {
    const facts = itemFacts(
      "TEA",
      { ...core, country: null },
      { steepingTemperature: "80°C", isOrganic: true },
    );
    assert.deepEqual(facts, [
      { label: "Steep Temp", value: "80°C" },
      { label: "Organic", value: "Yes" },
    ]);
  });

  test("nothing recorded is no rows — and nothing is estimated", () => {
    for (const type of ITEM_TYPES_IN_ORDER) {
      if (type === "WINE") continue; // a NULL vintage is an answer (NV)
      assert.deepEqual(itemFacts(type, { ...core, country: null }, {}), []);
    }
  });

  test("blank strings are not facts", () => {
    assert.deepEqual(
      itemFacts("SPIRIT", { ...core, country: null }, { spiritStyle: "  " }),
      [],
    );
  });
});

describe("producerTitle (one brand title per type)", () => {
  test("every type has one word, singular for one brand, plural for more", () => {
    for (const type of ITEM_TYPES_IN_ORDER) {
      assert.equal(producerTitle(type, 1), PRODUCER_TITLE[type].one);
      assert.equal(producerTitle(type, 0), PRODUCER_TITLE[type].one);
      assert.equal(producerTitle(type, 3), PRODUCER_TITLE[type].many);
    }
    assert.equal(producerTitle("SPIRIT", 1), "Distillery");
    assert.equal(producerTitle("WINE", 2), "Wineries");
  });
});

const bottle = (over: Partial<YourBottle> = {}): YourBottle => ({
  id: "b",
  cellarId: "c",
  cellarName: "Home",
  openAt: null,
  emptyAt: null,
  percentageRemaining: 100,
  ...over,
});

describe("Your bottles", () => {
  test("bottleStateLine follows the BottleCard's rules", () => {
    assert.equal(bottleStateLine(bottle()), "Sealed");
    assert.equal(
      bottleStateLine(
        bottle({ openAt: "2026-01-01T00:00:00Z", percentageRemaining: 62.4 }),
      ),
      "Open · 62% left",
    );
    // Below full with no openAt still counts as open.
    assert.equal(
      bottleStateLine(bottle({ percentageRemaining: 80 })),
      "Open · 80% left",
    );
    assert.equal(
      bottleStateLine(
        bottle({
          openAt: "2026-01-01T00:00:00Z",
          emptyAt: "2026-02-01T00:00:00Z",
        }),
      ),
      "Finished",
    );
  });

  test("bottlesCountLabel counts bottles, and says nothing for none", () => {
    assert.equal(bottlesCountLabel(0), null);
    assert.equal(bottlesCountLabel(1), "1 bottle");
    assert.equal(bottlesCountLabel(3), "3 bottles");
  });

  test("defaultLogBottle: the selected one, else your one open bottle, else none", () => {
    const open = bottle({ id: "open", openAt: "2026-01-01T00:00:00Z" });
    const sealed = bottle({ id: "sealed" });
    const done = bottle({ id: "done", emptyAt: "2026-02-01T00:00:00Z" });
    assert.equal(defaultLogBottle([open, sealed], "sealed")?.id, "sealed");
    // A finished bottle is not poured from.
    assert.equal(defaultLogBottle([done, open], "done"), null);
    assert.equal(defaultLogBottle([open, sealed], null)?.id, "open");
    // Two open bottles: a question, not a guess.
    assert.equal(
      defaultLogBottle(
        [open, bottle({ id: "o2", openAt: "2026-01-02T00:00:00Z" })],
        null,
      ),
      null,
    );
    assert.equal(defaultLogBottle([sealed], null), null);
    assert.equal(defaultLogBottle([], null), null);
  });
});

describe("cookingRecipes", () => {
  test("keeps food recipes; cocktails are X14's section", () => {
    const row = (id: string, type: string) => ({
      id,
      recipe: { id, name: id, type },
    });
    assert.deepEqual(
      cookingRecipes([row("a", "cocktail"), row("b", "food")]).map((r) => r.id),
      ["b"],
    );
  });
});
