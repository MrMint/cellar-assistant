import { unique } from "../fixtures/data.ts";
import {
  bodyText,
  expect,
  settleNetwork,
  test,
  watch,
} from "../fixtures/test.ts";

/**
 * The recipe pages as the 2026-11 redesign draws them (Recipes-Browse and
 * Recipes-Page boards): "Recipes" with its search, the group page's
 * "Name · 2 versions" and its pick card (MC-pick), Versions with Up / Down
 * for everyone but the author and Undo in the vote's toast, and the review
 * composer behind "Write a review".
 *
 * Most of that UI never loaded in production (`recipe_votes` and
 * `recipe_reviews` had no Hasura permissions), so these are its first
 * end-to-end runs. The fixture is built, never hunted for: two versions in
 * one group is the only shape where a vote means anything, and B6's
 * `canonicalRecipeId` stays null until a vote breaks the tie. Recipes have no
 * cleanup in this suite (as before), so the unique names keep runs apart.
 */
test.describe.configure({ mode: "serial" });

type Group = {
  id: string;
  name: string;
  recipeIds: string[];
  recipeNames: string[];
};
let group: Group | null = null;

test("creates a recipe group with two versions", async ({ api }) => {
  const name = unique("E2 Group");
  const groupData = await api.query(
    `mutation G($input: CreateRecipeGroupInput!) {
       createRecipeGroup(input: $input) {
         __typename
         ... on RecipeGroup { id name }
         ... on Error { message }
       }
     }`,
    { input: { name, category: "cocktail" } },
  );
  expect(
    groupData.createRecipeGroup.__typename,
    JSON.stringify(groupData.createRecipeGroup),
  ).toBe("RecipeGroup");
  const groupId = groupData.createRecipeGroup.id;

  const recipeIds: string[] = [];
  const recipeNames: string[] = [];
  for (const suffix of ["v1", "v2"]) {
    const data = await api.query(
      `mutation R($input: CreateRecipeInput!) {
         createRecipe(input: $input) {
           __typename
           ... on Recipe { id name }
           ... on Error { message }
         }
       }`,
      {
        input: {
          name: unique(`E2 Recipe ${suffix}`),
          type: "cocktail",
          recipeGroupId: groupId,
          // X15 / D22: private first. These versions stand for the shared
          // catalog — votes, the canonical and the group's name are about
          // recipes everyone can see.
          privacy: "PUBLIC",
        },
      },
    );
    expect(
      data.createRecipe.__typename,
      JSON.stringify(data.createRecipe),
    ).toBe("Recipe");
    recipeIds.push(data.createRecipe.id);
    recipeNames.push(data.createRecipe.name);
  }

  // Steps for the first version, so the detail and versions pages have a
  // body to render.
  const steps = await api.query(
    `mutation S($recipeId: ID!, $steps: [RecipeInstructionInput!]!) {
       setRecipeInstructions(recipeId: $recipeId, instructions: $steps) {
         __typename
         ... on Error { message }
       }
     }`,
    {
      recipeId: recipeIds[0],
      steps: [{ instructionText: "Stir with ice.", instructionType: "mix" }],
    },
  );
  expect(
    steps.setRecipeInstructions.__typename,
    JSON.stringify(steps.setRecipeInstructions),
  ).toBe("RecipeInstructionsPayload");

  group = { id: groupId, name, recipeIds, recipeNames };
});

test("votes through the API and the G27 fields agree", async ({ api }) => {
  test.skip(group === null, "no recipe group");
  const g = group as Group;

  const vote = await api.raw(
    `mutation V($groupId: ID!, $recipeId: ID!, $type: RecipeVoteType!) {
       voteOnRecipe(recipeGroupId: $groupId, recipeId: $recipeId, voteType: $type) {
         __typename
         ... on RecipeVotePayload { netScore }
         ... on Error { message }
       }
     }`,
    { groupId: g.id, recipeId: g.recipeIds[0], type: "upvote" },
  );
  expect(vote.errors, JSON.stringify(vote.errors)).toBeUndefined();
  const payload = vote.data.voteOnRecipe;
  expect(
    payload.__typename,
    `voteOnRecipe returned ${payload.__typename}: ${payload.message}`,
  ).toBe("RecipeVotePayload");

  // The restored page reads `Recipe.upvotes/downvotes/netScore/myVote`; they
  // must agree with the payload and with the raw vote rows.
  const read = await api.query(
    `query G($id: ID!) { recipeGroup(id: $id) {
       __typename
       ... on RecipeGroup {
         canonicalRecipeId
         recipes(first: 20) { edges { node { id netScore upvotes downvotes myVote } } }
         votes(first: 100) { edges { node { recipeId voteType } } }
       }
     } }`,
    { id: g.id },
  );
  const versions = read.recipeGroup.recipes.edges.map((e: any) => e.node);
  const voted = versions.find((v: any) => v.id === g.recipeIds[0]);
  expect(voted).toMatchObject({
    netScore: payload.netScore,
    upvotes: 1,
    downvotes: 0,
    myVote: "upvote",
  });
  const tallied = read.recipeGroup.votes.edges
    .map((e: any) => e.node)
    .filter((r: any) => r.recipeId === g.recipeIds[0])
    .reduce(
      (sum: number, r: any) => sum + (r.voteType === "upvote" ? 1 : -1),
      0,
    );
  expect(tallied).toBe(voted.netScore);
  expect(read.recipeGroup.canonicalRecipeId).toBe(g.recipeIds[0]);
});

test("/recipes: the old search finds the group and opens its page", async ({
  primary,
}) => {
  test.skip(group === null, "no recipe group");
  const g = group as Group;
  const noise = watch(primary);

  await primary.goto("/recipes");
  await expect(
    primary.getByRole("heading", { name: "Recipes", level: 1 }),
  ).toBeVisible({ timeout: 20_000 });
  // After the vote, the group's name follows its canonical (`RecipeGroup.name`
  // "follows the canonical recipe's name"), so search by the version's name,
  // which G26's term matches too.
  const canonicalName = g.recipeNames[0] ?? "";
  await primary.getByPlaceholder("Search recipes").fill(canonicalName);
  await expect(primary.getByText("1 recipe", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await primary.getByRole("heading", { name: canonicalName }).click();
  await primary.waitForURL(`**/recipes/groups/${g.id}`, { timeout: 20_000 });
  expect(noise.pageErrors, "the recipes index threw").toEqual([]);
});

test("/recipes: newest first, as the old page (UI parity #15)", async ({
  api,
  primary,
}) => {
  test.skip(group === null, "no recipe group");
  const g = group as Group;

  // The API's default order, and an explicit NAME still available.
  const read = await api.query(
    `{ newest: recipeGroups(first: 1) {
         ... on RecipeGroupConnection { edges { node { id } } }
       }
       byName: recipeGroups(first: 1, orderBy: NAME) {
         __typename
       } }`,
  );
  expect(
    read.newest.edges[0]?.node.id,
    "the group this file just created is not first in recipeGroups' default order",
  ).toBe(g.id);
  expect(read.byName.__typename).toBe("RecipeGroupConnection");

  // The grid, unsearched: the first card is the group just created.
  await primary.goto("/recipes");
  // Each card's name is an h3 under the "All recipes" h2 (X21).
  const firstCard = primary
    .getByRole("region", { name: "All recipes" })
    .locator("h3")
    .first();
  await expect(firstCard).toHaveText(g.recipeNames[0] ?? "", {
    timeout: 20_000,
  });
});

test("the group page shows the community's pick and links to the versions", async ({
  primary,
}) => {
  test.skip(group === null, "no recipe group");
  const g = group as Group;
  const noise = watch(primary);

  await primary.goto(`/recipes/groups/${g.id}`);
  await settleNetwork(primary);
  const text = await bodyText(primary);
  // MC-pick: a pick needs net votes from people other than the author, so
  // a group only its author voted on shows its original, and says so.
  expect(text).toMatch(/Community pick|No pick yet/);
  expect(text).toContain("Stir with ice.");
  expect(text).toContain("Other versions");
  await primary.getByRole("link", { name: /· 2 versions$/ }).click();
  await primary.waitForURL(`**/recipes/groups/${g.id}/versions`, {
    timeout: 20_000,
  });
  expect(noise.pageErrors, "the group page threw").toEqual([]);
});

test("the versions page: a card per version, and no vote buttons for their author", async ({
  primary,
}) => {
  test.skip(group === null, "no recipe group");
  const g = group as Group;
  const noise = watch(primary);

  await primary.goto(`/recipes/groups/${g.id}/versions`);
  await settleNetwork(primary);

  expect(noise.pageErrors, "the versions page threw").toEqual([]);
  await expect(
    primary.getByRole("heading", { name: "Versions", level: 1 }),
  ).toBeVisible({ timeout: 20_000 });
  for (const name of g.recipeNames) {
    await expect(primary.getByRole("link", { name })).toBeVisible();
  }
  // Both versions are primary's own (lead's ruling: authors never vote).
  await expect(primary.getByRole("button", { name: /^Upvote / })).toHaveCount(
    0,
  );
});

test("someone else votes, and Undo in the toast takes it back", async ({
  secondary,
}) => {
  test.skip(group === null, "no recipe group");

  await secondary.goto(`/recipes/groups/${(group as Group).id}/versions`);
  const upvote = secondary.getByRole("button", { name: /^Upvote / }).first();
  await expect(upvote).toBeVisible({ timeout: 20_000 });
  const pressed = await upvote.getAttribute("aria-pressed");

  await upvote.click();
  await expect(
    secondary.getByText(pressed === "true" ? "Vote taken back" : "Voted up"),
  ).toBeVisible({ timeout: 20_000 });
  await expect(upvote).toHaveAttribute(
    "aria-pressed",
    pressed === "true" ? "false" : "true",
  );
  await secondary.getByRole("button", { name: "Undo" }).click();
  await expect(secondary.getByText("Vote undone")).toBeVisible({
    timeout: 20_000,
  });
  await expect(upvote).toHaveAttribute("aria-pressed", pressed ?? "false");
});

test("a text-only review: Write a review, then it is yours to edit", async ({
  primary,
}) => {
  test.skip(group === null, "no recipe group");
  const g = group as Group;
  const noise = watch(primary);
  const words = unique("E2 tasty");

  await primary.goto(`/recipes/${g.recipeIds[1]}`);
  await primary.getByRole("button", { name: "Write a review" }).click();
  const composer = primary.getByRole("dialog", { name: "Your review" });
  await expect(composer).toBeVisible();
  const editor = composer.locator('[contenteditable="true"]').first();
  await editor.click();
  await editor.pressSequentially(words);
  await composer.getByRole("button", { name: "Save review" }).click();

  // One review per viewer: it shows as the viewer's own, with Edit.
  await expect(primary.getByText(words)).toBeVisible({ timeout: 20_000 });
  await expect(
    primary.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  await expect(
    primary.getByRole("button", { name: "Delete your review" }),
  ).toBeVisible();
  expect(noise.pageErrors, "the recipe page threw").toEqual([]);
});

test("/recipes/ai-generator lands on New recipe › Photo (X15)", async ({
  primary,
}) => {
  const noise = watch(primary);
  await primary.goto("/recipes/ai-generator");
  await primary.waitForURL(/\/recipes\/new\?from=photo$/, { timeout: 20_000 });
  await settleNetwork(primary);
  expect(noise.pageErrors, "the composer threw").toEqual([]);
  await expect(
    primary.getByRole("heading", { name: "New recipe" }),
  ).toBeVisible();
  const text = await bodyText(primary);
  expect(text).not.toContain("OCR Accuracy");
  expect(text).not.toContain("AI Recipe Generator");
});
