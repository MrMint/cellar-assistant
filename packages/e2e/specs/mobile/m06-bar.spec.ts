import { unique } from "../../fixtures/data.ts";
import { expect, test } from "../../fixtures/mobile.ts";
import { Gql } from "../../fixtures/test.ts";

/**
 * X14 · recipes meet the cellar, at 390x844 (decisions D9, D18/G29, D23).
 *
 * One recipe whose every ingredient is a Bar pantry kind — lime, simple
 * syrup, soda — so the test controls the whole answer through the pantry and
 * does not depend on what bottles the shared account's cellars hold. Limes
 * start off: the recipe is One bottle away, its lime line says Missing and
 * its amount is the one formatter's "¾ oz". Love it; turn Limes on in the
 * pantry (a chip, a 44 pt target); What can I make now lists it under Make
 * now.
 *
 * Creates no places. The recipe is deleted at the end (Love goes with it).
 */
test.describe.configure({ mode: "serial" });

let api: Gql;
let recipeId = "";
const name = unique("E2 Rickey");
/** The shared account's pantry before this spec touched it, restored after. */
const TOUCHED = ["lime", "simple_syrup", "soda_water"] as const;
let pantryBefore: readonly string[] = [];

const setPantry = async (kind: string, have: boolean) => {
  const data = await api.query(
    `mutation P($kind: IngredientKind!, $have: Boolean!) {
       setBarPantryItem(kind: $kind, have: $have) {
         __typename ... on BarPantryEntry { kind have } ... on Error { message }
       }
     }`,
    { kind, have },
  );
  expect(data.setBarPantryItem.__typename).toBe("BarPantryEntry");
};

test.beforeAll(async () => {
  api = await Gql.forAccount("primary");
  const pantry = await api.query(
    `query { barPantry { __typename ... on BarPantry { have } } }`,
  );
  expect(pantry.barPantry.__typename).toBe("BarPantry");
  pantryBefore = pantry.barPantry.have;
  await setPantry("lime", false);
  await setPantry("simple_syrup", true);
  await setPantry("soda_water", true);

  const created = await api.query(
    `mutation R($input: CreateRecipeInput!) {
       createRecipe(input: $input) {
         __typename ... on Recipe { id } ... on Error { message }
       }
     }`,
    { input: { name, type: "cocktail" } },
  );
  expect(created.createRecipe.__typename).toBe("Recipe");
  recipeId = created.createRecipe.id;

  const generic = (itemName: string, category: string) => ({
    name: itemName,
    category,
    kind: "ingredient",
  });
  const set = await api.query(
    `mutation I($recipeId: ID!, $ingredients: [RecipeIngredientInput!]!) {
       setRecipeIngredients(recipeId: $recipeId, ingredients: $ingredients) {
         __typename ... on Error { message }
       }
     }`,
    {
      recipeId,
      ingredients: [
        {
          newGenericItem: generic("Lime juice", "citrus"),
          quantity: 0.75,
          unit: "oz",
          quantityText: "3/4 oz",
        },
        {
          newGenericItem: generic("Simple syrup", "syrup"),
          quantity: 0.5,
          unit: "oz",
        },
        {
          newGenericItem: generic("Soda water", "mixer"),
          quantity: 3,
          unit: "oz",
        },
      ],
    },
  );
  expect(set.setRecipeIngredients.__typename).toBe("RecipeIngredientsPayload");
});

test.afterAll(async () => {
  if (recipeId !== "") {
    await api.raw(
      `mutation D($recipeId: ID!) { deleteRecipe(recipeId: $recipeId) { __typename } }`,
      { recipeId },
    );
  }
  // Put the shared account's pantry back the way the spec found it.
  for (const kind of TOUCHED) {
    await setPantry(kind, pantryBefore.includes(kind));
  }
  await api.dispose();
});

test("the recipe page says what is missing, with real availability", async ({
  page,
}) => {
  await page.goto(`/recipes/${recipeId}`);
  const summary = page.locator("[data-makeability]");
  await expect(summary).toHaveAttribute("data-makeability", "one_away");
  await expect(summary).toContainText("One bottle away");
  await expect(summary).toContainText("Lime juice");

  const lime = page.locator("li", { hasText: "Lime juice" });
  await expect(lime).toContainText("¾ oz");
  await expect(lime.locator('[data-availability="missing"]')).toBeVisible();
  const syrup = page.locator("li", { hasText: "Simple syrup" });
  await expect(syrup).toContainText("½ oz");
  await expect(syrup.locator('[data-availability="have"]')).toContainText(
    "In your pantry",
  );
});

test("Love replaces the heart", async ({ page }) => {
  await page.goto(`/recipes/${recipeId}`);
  const love = page.getByRole("button", { name: "Love this recipe" });
  await expect(love).toBeVisible();
  const box = await love.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await love.tap();
  await expect(
    page.getByRole("button", { name: "Loved — tap to remove" }),
  ).toHaveAttribute("aria-pressed", "true");

  await expect
    .poll(async () => {
      const data = await api.query(
        `query L($id: ID!) { recipe(id: $id) { __typename ... on Recipe { isLoved } } }`,
        { id: recipeId },
      );
      return data.recipe.isLoved;
    })
    .toBe(true);
});

test("a pantry toggle moves the recipe to Make now", async ({ page }) => {
  await page.goto("/recipes/bar/pantry");
  const limes = page.locator('[data-pantry-kind="lime"]');
  await expect(limes).toHaveAttribute("aria-pressed", "false");
  const box = await limes.boundingBox();
  // The chip is 36 pt tall inside a 44 pt target (its ::after).
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(36);
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes("/graphql") &&
      (response.request().postData() ?? "").includes("SetBarPantryItem"),
  );
  await limes.tap();
  await expect(limes).toHaveAttribute("aria-pressed", "true");
  await saved;

  await page.goto("/recipes/bar");
  await expect(page.getByRole("radio", { name: /Make now/ })).toBeVisible();
  const makeNow = page.getByTestId("make-now");
  await expect(makeNow.getByRole("link", { name })).toBeVisible();

  // No horizontal scroll at phone width.
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
