import { eventually, unique } from "../../fixtures/data.ts";
import { expect, test } from "../../fixtures/mobile.ts";
import { Gql } from "../../fixtures/test.ts";

/**
 * Wave B hardening at 390x844 — what a retry and a stale tab may no longer do.
 *
 * 1. **Love sets, it does not flip.** `setRecipeLove(loved:)` sent twice (a
 *    retry whose first answer was lost) leaves the recipe loved, and the
 *    recipe page agrees; the same for `setFavorite` on a wine. It used to be
 *    `toggleRecipeLove` / `toggleFavorite`, and the retry took the Love back.
 * 2. **A stale tab cannot undo someone else's newer edit.** A page whose
 *    Arrange bar reads "Undo: added …" is left open while another device
 *    removes an entry; tapping that stale Undo is refused (nothing undone,
 *    the toast says the list changed elsewhere), and once the page has the
 *    new history, Undo names the removal and puts the entry back.
 *
 * Everything is read back through the API, so a board that only changed in
 * React state cannot pass. The list and the recipe are created through the
 * API and deleted afterwards; a favourite this spec touches is put back the
 * way it was. Creates no places.
 */
test.describe.configure({ mode: "serial" });

let api: Gql;
let recipeId = "";
let tierListId = "";
let favouriteWine: { id: string; was: boolean } | null = null;

type Entry = { id: string; name: string };

async function entries(id: string): Promise<Entry[]> {
  const data = await api.query(
    `query T($id: ID!) { tierList(id: $id) { __typename
       ... on TierList { items(first: 50) { edges { node { id item { name } } } } } } }`,
    { id },
  );
  if (data.tierList.__typename !== "TierList") return [];
  return data.tierList.items.edges.map((e: any) => ({
    id: e.node.id,
    name: e.node.item?.name ?? e.node.id,
  }));
}

async function ownWines(): Promise<string[]> {
  const cellars = await api.query(
    `query { myCellars(first: 20) { __typename
       ... on CellarConnection { edges { node { items(first: 50) {
         edges { node { item { id type } } } } } } } } }`,
  );
  const wines = new Set<string>();
  for (const cellar of cellars.myCellars?.edges ?? []) {
    for (const row of cellar.node.items.edges) {
      if (row.node.item?.type === "WINE") wines.add(row.node.item.id);
    }
  }
  if (wines.size < 2) {
    const found = await api.raw(
      `query { itemSearch(text: "wine", itemTypes: [WINE], limit: 5, first: 5) {
         __typename
         ... on ItemSearchConnection { edges { node { item { id } } } }
       } }`,
    );
    for (const edge of found.data?.itemSearch?.edges ?? []) {
      if (edge.node.item?.id) wines.add(edge.node.item.id);
    }
  }
  return Array.from(wines);
}

const setLove = async (loved: boolean) =>
  (
    await api.query(
      `mutation L($id: ID!, $loved: Boolean!) {
         setRecipeLove(recipeId: $id, loved: $loved) {
           __typename ... on SetRecipeLovePayload { loved changed }
           ... on Error { message }
         }
       }`,
      { id: recipeId, loved },
    )
  ).setRecipeLove;

const setFavorite = async (id: string, favorited: boolean) =>
  (
    await api.query(
      `mutation F($id: ID!, $favorited: Boolean!) {
         setFavorite(itemId: $id, type: WINE, favorited: $favorited) {
           __typename ... on SetFavoritePayload { favorited changed }
           ... on Error { message }
         }
       }`,
      { id, favorited },
    )
  ).setFavorite;

test.beforeAll(async () => {
  api = await Gql.forAccount("primary");

  const recipe = await api.query(
    `mutation R($input: CreateRecipeInput!) {
       createRecipe(input: $input) {
         __typename ... on Recipe { id } ... on Error { message }
       }
     }`,
    { input: { name: unique("E2 Retry Rickey"), type: "cocktail" } },
  );
  expect(recipe.createRecipe.__typename).toBe("Recipe");
  recipeId = recipe.createRecipe.id;

  const list = await api.query(
    `mutation C($input: CreateTierListInput!) {
       createTierList(input: $input) { __typename ... on TierList { id } ... on Error { message } }
     }`,
    {
      input: {
        name: unique("E2 Stale Undo"),
        privacy: "PRIVATE",
        listType: "wine",
      },
    },
  );
  expect(list.createTierList.__typename).toBe("TierList");
  tierListId = list.createTierList.id;
  for (const wineId of (await ownWines()).slice(0, 2)) {
    await api.query(
      `mutation A($id: ID!, $input: AddTierListItemInput!) {
         addTierListItem(tierListId: $id, input: $input) { __typename }
       }`,
      {
        id: tierListId,
        input: { entry: { id: wineId, type: "WINE" }, band: 3 },
      },
    );
  }
});

test.afterAll(async () => {
  if (recipeId !== "") {
    await api.raw(
      `mutation D($recipeId: ID!) { deleteRecipe(recipeId: $recipeId) { __typename } }`,
      { recipeId },
    );
  }
  if (tierListId !== "") {
    await api.raw(
      `mutation D($id: ID!) { deleteTierList(tierListId: $id) { __typename } }`,
      { id: tierListId },
    );
  }
  if (favouriteWine !== null) {
    await setFavorite(favouriteWine.id, favouriteWine.was);
  }
  await api.dispose();
});

test("a retried Love stays loved, and the recipe page agrees", async ({
  page,
}) => {
  const first = await setLove(true);
  expect(first).toMatchObject({ loved: true, changed: true });
  // The retry of a request whose answer was lost.
  const retry = await setLove(true);
  expect(retry).toMatchObject({ loved: true, changed: false });

  await page.goto(`/recipes/${recipeId}`);
  const loved = page.getByRole("button", { name: /: loved — tap to remove$/ });
  await expect(loved).toHaveAttribute("aria-pressed", "true");
  await loved.tap();
  await expect(page.getByRole("button", { name: /^Love / })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect
    .poll(async () => {
      const data = await api.query(
        `query L($id: ID!) { recipe(id: $id) { __typename ... on Recipe { isLoved } } }`,
        { id: recipeId },
      );
      return data.recipe.isLoved;
    })
    .toBe(false);
  // Taking it back twice is still "not loved", never a flip back on.
  expect(await setLove(false)).toMatchObject({ loved: false, changed: false });
});

test("a retried favourite stays favourited (setFavorite)", async () => {
  const [wineId] = await ownWines();
  test.skip(wineId === undefined, "the account has no wine to favourite");
  const id = wineId ?? "";
  const states = await api.query(
    `query S($id: ID!) { item(type: WINE, id: $id) {
       __typename ... on QueryItemSuccess { data { isFavorite } } } }`,
    { id },
  );
  favouriteWine = { id, was: states.item?.data?.isFavorite === true };

  await setFavorite(id, false);
  expect(await setFavorite(id, true)).toMatchObject({
    favorited: true,
    changed: true,
  });
  expect(await setFavorite(id, true)).toMatchObject({
    favorited: true,
    changed: false,
  });
});

test("a stale tab's Undo cannot take back an edit made on another device", async ({
  page,
}) => {
  const before = await entries(tierListId);
  test.skip(before.length < 2, "the account has fewer than two wines to rank");

  // This tab reads the history: its Undo names the last add.
  await page.goto(`/tier-lists/${tierListId}`);
  await page.getByRole("button", { name: "Edit order", exact: true }).tap();
  const bar = page.getByRole("toolbar", { name: "Arrange" });
  const staleUndo = bar.getByRole("button", { name: /^Undo: added / });
  await expect(staleUndo, "Undo does not name the last add").toBeEnabled({
    timeout: 20_000,
  });

  // Another device removes an entry — a newer edit this tab never saw.
  const gone = before[0];
  if (gone === undefined) throw new Error("fixture");
  await api.query(
    `mutation R($id: ID!, $row: ID!) {
       removeTierListItem(tierListId: $id, tierListItemId: $row) { __typename }
     }`,
    { id: tierListId, row: gone.id },
  );
  expect(await entries(tierListId)).toHaveLength(1);

  await staleUndo.tap();
  await expect(
    page.locator("[data-sonner-toast]").filter({
      hasText: "This list changed somewhere else",
    }),
    "the stale Undo was not refused",
  ).toBeVisible({ timeout: 15_000 });
  // Nothing undone: the other device's removal stands, and the stale add
  // was not taken back either.
  expect(await entries(tierListId)).toHaveLength(1);

  // The page now has the list's real history: Undo names the removal.
  const undo = bar.getByRole("button", { name: /^Undo: removed / });
  await expect(undo, "the page did not catch up with the history").toBeEnabled({
    timeout: 20_000,
  });
  await undo.tap();
  await eventually(
    async () => ((await entries(tierListId)).length === 2 ? true : null),
    { timeoutMs: 20_000, what: "Undo of the removal to put the entry back" },
  );
});
