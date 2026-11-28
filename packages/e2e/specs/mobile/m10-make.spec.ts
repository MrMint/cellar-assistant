import { unique } from "../../fixtures/data.ts";
import { recipeLogIds } from "../../fixtures/db.ts";
import { expect, test } from "../../fixtures/mobile.ts";
import { Gql } from "../../fixtures/test.ts";

/**
 * ux-c L08 · Make mode, at 390×844 with a thumb.
 *
 * A recipe with three steps (the second timed) opens from "Make it" into
 * `/recipes/[id]/make`; servings scale the amounts; Next walks the steps;
 * the last step's "Made it" logs a recipe-only drink (no item, no bottle —
 * CheckInActor's one-target rule) and its toast's Undo takes the log back,
 * which is asserted through the API.
 *
 * Creates one private recipe and deletes it after.
 */
test.describe.configure({ mode: "serial" });

let api: Gql;
let recipeId = "";
let recipeName = "";

const STEPS = [
  "Fill a mixing glass with ice.",
  "Stir for 30 seconds, until very cold.",
  "Strain into a chilled coupe.",
];

const myRecipeLogs = async (): Promise<string[]> => recipeLogIds(recipeId);

test.beforeAll(async () => {
  api = await Gql.forAccount("primary");
  recipeName = unique("L08 Make Martini");
  const created = await api.query(
    `mutation C($input: CreateRecipeInput!) {
       createRecipe(input: $input) {
         __typename
         ... on Recipe { id }
         ... on Error { message }
       }
     }`,
    {
      input: {
        name: recipeName,
        type: "cocktail",
        servingSize: 1,
        privacy: "PRIVATE",
      },
    },
  );
  expect(created.createRecipe.__typename, JSON.stringify(created)).toBe(
    "Recipe",
  );
  recipeId = created.createRecipe.id;
  const steps = await api.query(
    `mutation S($id: ID!, $steps: [RecipeInstructionInput!]!) {
       setRecipeInstructions(recipeId: $id, instructions: $steps) {
         __typename
         ... on Error { message }
       }
     }`,
    {
      id: recipeId,
      steps: STEPS.map((instructionText) => ({ instructionText })),
    },
  );
  expect(steps.setRecipeInstructions.__typename, JSON.stringify(steps)).toBe(
    "RecipeInstructionsPayload",
  );
});

test.afterAll(async () => {
  if (recipeId !== "") {
    for (const id of await myRecipeLogs().catch(() => [])) {
      await api.query(
        `mutation D($id: ID!) { deleteDrinkLog(id: $id) { __typename } }`,
        { id },
      );
    }
    await api.query(
      `mutation D($id: ID!) { deleteRecipe(recipeId: $id) { __typename } }`,
      { id: recipeId },
    );
  }
  await api.dispose();
});

test("recipe → Make → steps → Made it → Undo", async ({ page }) => {
  await page.goto(`/recipes/${recipeId}`);
  await expect(page.getByRole("heading", { name: recipeName })).toBeVisible();

  await page.getByTestId("make-it").click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${recipeId}/make$`));
  await expect(
    page.getByRole("button", { name: "Leave Make mode" }),
  ).toBeVisible();
  // Full screen (L08, CR-5): one main landmark (the shell's), no tab bar.
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();

  // The prep page: ingredients and servings before step 1 (Recipes-Make
  // board, ruling 2). The stepper never goes below one drink.
  await expect(
    page.getByRole("button", { name: "Fewer drinks" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "More drinks" }).click();
  await expect(page.getByText("2 drinks")).toBeVisible();
  await page.getByRole("button", { name: "Fewer drinks" }).click();
  await expect(page.getByText("1 drink", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();

  // Step 1, then the timed step 2 with its countdown.
  await expect(page.getByText("Step 1 of 3")).toBeVisible();
  await expect(page.getByText(STEPS[0] ?? "")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Step 2 of 3")).toBeVisible();
  await expect(page.getByRole("timer")).toHaveText("0:30");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

  // Back and forward: the timer keeps running, shown beside the segments
  // (ruling 4); the last step's Next reads "Made it".
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText("Step 1 of 3")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /left on step 2$/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Step 3 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Made it" }).click();

  // Logged: a recipe-only log, the Made it screen with the recipe's own
  // review form (L29), and the toast's Undo.
  await expect(page.getByRole("heading", { name: "Made it" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(`${recipeName} logged`)).toBeVisible();
  await expect.poll(myRecipeLogs, { timeout: 10_000 }).toHaveLength(1);

  // Undo takes the log back, and Make mode with it.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(myRecipeLogs, { timeout: 10_000 }).toHaveLength(0);
  await expect(page.getByText("Step 3 of 3")).toBeVisible();

  // Leave goes back to the recipe (CR-6): history Back, so Make mode is not
  // left in the stack for the recipe page's Back to re-enter.
  await page.getByRole("button", { name: "Leave Make mode" }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${recipeId}$`));
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/recipes/${recipeId}/make$`));
});
