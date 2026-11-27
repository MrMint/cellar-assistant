/**
 * The recipe editor's model (X15): a draft's AI matches wait on the person,
 * an unchanged line keeps its row's facts, and nothing is invented on save.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  blankForm,
  confirmAllMatches,
  confirmMatch,
  createFields,
  emptyIngredient,
  formFromRecipe,
  formProblems,
  ingredientInputs,
  pendingMatches,
  recipeFields,
  rejectMatch,
  type ServerRecipe,
  stepInputs,
  widenAfterCreate,
} from "./recipe-draft";

const GIN = "11111111-1111-4111-8111-111111111111";
const CAMPARI = "22222222-2222-4222-8222-222222222222";

const negroni = (isDraft: boolean): ServerRecipe => ({
  name: "Negroni",
  type: "cocktail",
  description: null,
  privacy: "PRIVATE",
  isDraft,
  ingredients: [
    {
      id: "row-gin",
      quantity: 1,
      unit: "oz",
      quantityText: "1 oz",
      amount: "1 oz",
      isOptional: false,
      substitutionNotes: null,
      role: "base",
      kind: "gin",
      kindLabel: "Gin",
      brandMentioned: null,
      // The search found a tequila for "gin" — the review's own example.
      item: { id: GIN, name: "Casa Noble Tequila", type: "SPIRIT" },
      genericItem: null,
    },
    {
      id: "row-campari",
      quantity: 1,
      unit: "oz",
      quantityText: null,
      amount: "1 oz",
      isOptional: false,
      substitutionNotes: null,
      role: "modifier",
      kind: "red_bitter",
      kindLabel: "Red bitter",
      brandMentioned: "Campari",
      item: null,
      genericItem: {
        id: CAMPARI,
        name: "Campari",
        category: "liqueur",
        kind: "spirit",
      },
    },
  ],
  steps: [
    {
      id: "step-1",
      instructionText: "Stir with ice.",
      instructionType: "mix",
      equipmentNeeded: "mixing glass",
      timeMinutes: 1,
    },
  ],
});

describe("formFromRecipe", () => {
  test("a draft's catalog matches are suggestions; a published recipe's are confirmed", () => {
    assert.equal(
      formFromRecipe(negroni(true)).ingredients[0]?.match?.state,
      "suggested",
    );
    assert.equal(
      formFromRecipe(negroni(false)).ingredients[0]?.match?.state,
      "confirmed",
    );
    assert.equal(pendingMatches(formFromRecipe(negroni(true))), 1);
    assert.equal(pendingMatches(formFromRecipe(negroni(false))), 0);
  });

  test("an unknown privacy reads as private", () => {
    assert.equal(
      formFromRecipe({ ...negroni(false), privacy: "EVERYONE" }).privacy,
      "PRIVATE",
    );
  });
});

describe("match chips", () => {
  test("Keep confirms; Not this turns the line into the bar word for it", () => {
    const form = formFromRecipe(negroni(true));
    const line = form.ingredients[0];
    assert.ok(line);
    assert.equal(confirmMatch(line).match?.state, "confirmed");
    const rejected = rejectMatch(line);
    assert.equal(rejected.match, null);
    assert.equal(rejected.name, "Gin");
  });

  test("Not this keeps the item's name when there is no bar word", () => {
    const line = {
      ...emptyIngredient(),
      name: "Casa Noble Tequila",
      kindLabel: null,
      match: {
        type: "SPIRIT" as const,
        id: GIN,
        label: "Casa Noble Tequila",
        state: "suggested" as const,
      },
    };
    assert.equal(rejectMatch(line).name, "Casa Noble Tequila");
  });

  test("unchecked suggestions never block Save (lead's ruling)", () => {
    const form = formFromRecipe(negroni(true));
    assert.equal(pendingMatches(form), 1);
    assert.deepEqual(formProblems(form), []);
  });

  test("an unchecked suggestion saves as the words, never the model's item", () => {
    const form = formFromRecipe(negroni(true));
    const refs = ingredientInputs(form).map((input) => input.ref?.id);
    assert.ok(!refs.includes(GIN), "the suggested item is not written");
    const kept = ingredientInputs(confirmAllMatches(form)).map(
      (input) => input.ref?.id,
    );
    assert.ok(kept.includes(GIN), "a kept match is written");
  });
});

describe("ingredientInputs", () => {
  test("a confirmed match is written as the item, with the row's facts", () => {
    const [gin, campari] = ingredientInputs(
      confirmAllMatches(formFromRecipe(negroni(true))),
    );
    assert.deepEqual(gin?.ref, { type: "SPIRIT", id: GIN });
    assert.equal(gin?.kind, "gin");
    assert.equal(gin?.quantity, 1);
    assert.equal(gin?.unit, "oz");
    // An unchanged generic line points at the same row, not a new one.
    assert.deepEqual(campari?.ref, { type: "GENERIC", id: CAMPARI });
    assert.equal(campari?.brandMentioned, "Campari");
  });

  test("a rejected match becomes a generic ingredient by name, and the server infers the rest", () => {
    const form = formFromRecipe(negroni(true));
    const [first, ...rest] = form.ingredients;
    assert.ok(first);
    const [gin] = ingredientInputs({
      ...form,
      ingredients: [rejectMatch(first), ...rest],
    });
    assert.equal(gin?.ref, undefined);
    assert.deepEqual(gin?.newGenericItem, {
      name: "Gin",
      category: "ingredient",
      kind: "ingredient",
    });
    assert.equal(gin?.kind, null);
    assert.equal(gin?.role, null);
  });

  test("a still-suggested match is never written as the model's choice", () => {
    const [gin] = ingredientInputs(formFromRecipe(negroni(true)));
    assert.equal(gin?.ref, undefined);
    assert.equal(gin?.newGenericItem?.name, "Casa Noble Tequila");
  });

  test("a renamed generic line is a new generic in the same category and kind", () => {
    const form = formFromRecipe(negroni(false));
    const campari = form.ingredients[1];
    assert.ok(campari);
    const [, renamed] = ingredientInputs({
      ...form,
      ingredients: [
        form.ingredients[0] ?? emptyIngredient(),
        { ...campari, name: "Aperol" },
      ],
    });
    assert.deepEqual(renamed?.newGenericItem, {
      name: "Aperol",
      category: "liqueur",
      kind: "spirit",
    });
    assert.equal(renamed?.brandMentioned, null);
  });

  test("a changed amount drops the parsed quantity and keeps what was typed", () => {
    const form = formFromRecipe(negroni(false));
    const [gin] = ingredientInputs({
      ...form,
      ingredients: form.ingredients.map((line, index) =>
        index === 0 ? { ...line, amount: "1½ oz" } : line,
      ),
    });
    assert.equal(gin?.quantity, null);
    assert.equal(gin?.unit, null);
    assert.equal(gin?.quantityText, "1½ oz");
  });

  test("blank rows are the form's, not the recipe's", () => {
    const form = {
      ...blankForm(),
      name: "House sour",
      ingredients: [
        { ...emptyIngredient(), name: "Lemon juice", amount: "¾ oz" },
        emptyIngredient(),
      ],
    };
    const inputs = ingredientInputs(form);
    assert.equal(inputs.length, 1);
    assert.deepEqual(inputs[0]?.newGenericItem, {
      name: "Lemon juice",
      category: "ingredient",
      kind: "ingredient",
    });
    assert.equal(inputs[0]?.quantityText, "¾ oz");
  });
});

describe("stepInputs and recipeFields", () => {
  test("an unchanged step keeps its type, equipment and time; an edited one sends its text", () => {
    const form = formFromRecipe(negroni(false));
    assert.deepEqual(stepInputs(form), [
      {
        instructionText: "Stir with ice.",
        instructionType: "mix",
        equipmentNeeded: "mixing glass",
        timeMinutes: 1,
      },
    ]);
    const edited = {
      ...form,
      steps: form.steps.map((step) => ({ ...step, text: "Shake hard." })),
    };
    assert.deepEqual(stepInputs(edited), [
      {
        instructionText: "Shake hard.",
        instructionType: null,
        equipmentNeeded: null,
        timeMinutes: null,
      },
    ]);
  });

  test("a new recipe is private first, and a blank description is null", () => {
    assert.deepEqual(recipeFields({ ...blankForm(), name: "  Daiquiri " }), {
      name: "Daiquiri",
      type: "cocktail",
      description: null,
      privacy: "PRIVATE",
    });
  });

  test("a new recipe is written Private and shared only by the last write", () => {
    const form = {
      ...blankForm(),
      name: "Daiquiri",
      privacy: "PUBLIC" as const,
    };
    // Whatever the form says, the first write is Private: a later write that
    // fails must not leave a half-written recipe other people can open.
    assert.equal(createFields(form).privacy, "PRIVATE");
    assert.equal(recipeFields(form).privacy, "PUBLIC");
    assert.equal(widenAfterCreate(form), true);
    assert.equal(widenAfterCreate({ ...form, privacy: "PRIVATE" }), false);
  });

  test("a name and an ingredient are what a save needs", () => {
    assert.deepEqual(
      formProblems(blankForm()).map((problem) => problem.field),
      ["name", "ingredients"],
    );
  });
});
