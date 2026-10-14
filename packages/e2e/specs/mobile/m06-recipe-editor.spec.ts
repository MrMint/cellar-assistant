import { randomUUID } from "node:crypto";
import { unique } from "../../fixtures/data.ts";
import { expect, test } from "../../fixtures/mobile.ts";
import { Gql } from "../../fixtures/test.ts";

/**
 * X15 · recipes you write, on a phone (D22: private first).
 *
 * New recipe › Type writes a recipe that only its author can see; nobody
 * else can open it, Love it or save it, and its share URL says exactly what
 * a made-up id says. Made public in the editor, it has a share page. Its
 * author deletes it from the ⋯ menu.
 *
 * One recipe, written through the UI and deleted by the last test (and by
 * `afterAll` if a test before it failed). No places.
 */
test.describe.configure({ mode: "serial" });

const NOT_SHARED = "This doesn't exist or isn't shared with you";

let recipeId = "";
const recipeName = unique("E2 X15 Sour");

const READ = `query R($id: ID!) {
  recipe(id: $id) {
    __typename
    ... on Recipe { id privacy isDraft }
  }
}`;

test.afterAll(async () => {
  if (recipeId === "") return;
  const api = await Gql.forAccount("primary");
  try {
    await api.query(
      `mutation D($id: ID!) { deleteRecipe(recipeId: $id) { __typename } }`,
      { id: recipeId },
    );
  } finally {
    await api.dispose();
  }
});

test("New recipe › Type: private first, and saving opens it", async ({
  page,
  noise,
}) => {
  await page.goto("/recipes");
  await expect(
    page.getByRole("heading", { name: "Bar", level: 1 }),
  ).toBeVisible();
  // No nested scroll box: the page's own scroller holds the list (X15).
  await page.getByRole("button", { name: "New recipe" }).click();
  const sheet = page.getByRole("dialog", { name: "New recipe" });
  await expect(sheet.getByRole("link", { name: "Type" })).toBeVisible();
  await sheet.getByRole("link", { name: "Type" }).click();
  await expect(page).toHaveURL(/\/recipes\/new\?from=type$/);

  await page.getByLabel("Name", { exact: true }).fill(recipeName);
  await page.getByLabel("Amount of ingredient 1", { exact: true }).fill("2 oz");
  await page.getByLabel("Ingredient 1", { exact: true }).fill("Gin");
  await page.getByRole("button", { name: "Add ingredient" }).click();
  await page.getByLabel("Amount of ingredient 2", { exact: true }).fill("¾ oz");
  await page.getByLabel("Ingredient 2", { exact: true }).fill("Lemon juice");
  await page
    .getByLabel("Step 1", { exact: true })
    .fill("Shake hard with ice, then strain.");

  // D22: Private is the default, and it says what that means.
  await expect(page.getByRole("radio", { name: "Private" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByText("Only you can see this recipe.")).toBeVisible();

  const save = page.getByRole("button", { name: "Save recipe" });
  // The save sits within thumb reach, on screen without scrolling to it.
  await expect(save).toBeInViewport();
  await save.click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/, {
    timeout: 30_000,
  });
  recipeId = page.url().split("/").at(-1) ?? "";

  await expect(page.getByText("Only you can see this recipe.")).toBeVisible();
  await expect(page.getByText("Lemon juice")).toBeVisible();
  // A cocktail with no photo is drawn as a cocktail, never a wine bottle.
  await expect(
    page.locator('[data-slot="recipe-plate"][data-recipe-type="cocktail"]'),
  ).toBeVisible();
  expect(noise.pageErrors, "the editor or the recipe page threw").toEqual([]);
});

test("a private recipe is nobody else's: no page, no Love, no Want to try", async () => {
  test.skip(recipeId === "", "no recipe");
  const other = await Gql.forAccount("secondary");
  try {
    const read = await other.query(READ, { id: recipeId });
    expect(read.recipe.__typename).toBe("NotFoundError");

    const love = await other.query(
      `mutation L($id: ID!) { toggleRecipeLove(recipeId: $id) { __typename } }`,
      { id: recipeId },
    );
    expect(love.toggleRecipeLove.__typename).toBe("NotFoundError");

    const save = await other.query(
      `mutation W($id: ID!) {
         setWantToTry(target: { recipeId: $id }, wantToTry: true) { __typename }
       }`,
      { id: recipeId },
    );
    expect(save.setWantToTry.__typename).toBe("NotFoundError");

    // …and it is not in their search either.
    const search = await other.query(
      `query S($term: String!) {
         recipeSearch(term: $term, first: 5) {
           __typename
           ... on RecipeSearchConnection { edges { node { recipeId } } }
         }
       }`,
      { term: recipeName },
    );
    expect(search.recipeSearch.edges).toEqual([]);
  } finally {
    await other.dispose();
  }
});

test("signed out, its share URL reads exactly like a made-up one", async ({
  browser,
}) => {
  test.skip(recipeId === "", "no recipe");
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    const texts: string[] = [];
    for (const id of [recipeId, randomUUID()]) {
      const response = await page.goto(`/recipes/${id}`);
      expect(response?.status()).toBe(404);
      await expect(
        page.getByRole("heading", { name: NOT_SHARED }),
      ).toBeVisible();
      texts.push(
        (await page.locator("body").innerText()).replaceAll(id, "<id>"),
      );
    }
    expect(texts[0]).toBe(texts[1]);
  } finally {
    await context.close();
  }
});

test("made Public in the editor, it has a share page that names the drink", async ({
  page,
  browser,
}) => {
  test.skip(recipeId === "", "no recipe");
  await page.goto(`/recipes/${recipeId}`);
  await page.getByRole("link", { name: "Change" }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${recipeId}/edit$`));
  await page.getByRole("radio", { name: "Public" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${recipeId}$`), {
    timeout: 30_000,
  });
  await expect(
    page.getByText("Anyone can see it, and you can share a link to it."),
  ).toBeVisible();

  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 390, height: 844 },
  });
  try {
    const anon = await context.newPage();
    const response = await anon.goto(`/recipes/${recipeId}`);
    expect(response?.status()).toBe(200);
    await expect(anon).toHaveURL(new RegExp(`/recipes/${recipeId}$`));
    await expect(anon.getByRole("heading", { name: recipeName })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("its author deletes it from the ⋯ menu", async ({ page }) => {
  test.skip(recipeId === "", "no recipe");
  await page.goto(`/recipes/${recipeId}`);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: "Delete recipe" }).click();
  await page
    .getByRole("alertdialog", { name: "Delete this recipe?" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page).toHaveURL(/\/recipes$/, { timeout: 30_000 });

  const api = await Gql.forAccount("primary");
  try {
    const read = await api.query(READ, { id: recipeId });
    expect(read.recipe.__typename).toBe("NotFoundError");
    recipeId = "";
  } finally {
    await api.dispose();
  }
});
