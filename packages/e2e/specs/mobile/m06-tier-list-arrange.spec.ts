import { eventually, unique } from "../../fixtures/data.ts";
import { bottomNav, edgesOf, expect, test } from "../../fixtures/mobile.ts";
import { Gql } from "../../fixtures/test.ts";

/**
 * X23 / D4 at 390x844: a tier list is read-only until **Arrange**; Arrange
 * puts the handles, the remove buttons and a thumb-zone bar (Undo · Redo ·
 * Add entry · Done) on screen; a removal lands at once and its toast's Undo
 * puts it back; Redo takes it out again; and the history survives a reload —
 * Undo on a fresh page still names the removal and still works.
 *
 * Every assertion about the list's contents is read back through the API, so
 * a board that only changed in React state cannot pass. The list is created
 * through the API (a wine list seeded from the account's own cellars) and
 * deleted afterwards. No places are created.
 */
test.describe.configure({ mode: "serial" });

let tierListId: string | undefined;

type Entry = { id: string; band: number; name: string };

async function entries(api: Gql, id: string): Promise<Entry[]> {
  const data = await api.query(
    `query T($id: ID!) { tierList(id: $id) { __typename
       ... on TierList { items(first: 50) { edges { node { id band item { name } } } } } } }`,
    { id },
  );
  if (data.tierList.__typename !== "TierList") return [];
  return data.tierList.items.edges.map((e: any) => ({
    id: e.node.id,
    band: e.node.band,
    name: e.node.item?.name ?? e.node.id,
  }));
}

test.beforeAll(async () => {
  const api = await Gql.forAccount("primary");
  try {
    const created = await api.query(
      `mutation C($input: CreateTierListInput!) {
         createTierList(input: $input) { __typename ... on TierList { id } ... on Error { message } }
       }`,
      {
        input: {
          name: unique("E2 Mobile Arrange"),
          privacy: "PRIVATE",
          listType: "wine",
        },
      },
    );
    if (created.createTierList.__typename !== "TierList") {
      throw new Error(`createTierList: ${created.createTierList.message}`);
    }
    tierListId = created.createTierList.id as string;

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
    for (const wineId of Array.from(wines).slice(0, 2)) {
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
  } finally {
    await api.dispose();
  }
});

test.afterAll(async () => {
  if (tierListId === undefined) return;
  const api = await Gql.forAccount("primary");
  try {
    await api.query(
      `mutation D($id: ID!) { deleteTierList(tierListId: $id) { __typename } }`,
      { id: tierListId },
    );
  } finally {
    await api.dispose();
  }
});

test("read-only until Arrange; the bar sits in the thumb zone above the tabs", async ({
  page,
}) => {
  const id = tierListId ?? "";
  const api = await Gql.forAccount("primary");
  const before = await entries(api, id);
  await api.dispose();
  test.skip(before.length < 2, "the account has fewer than two wines to rank");

  await page.goto(`/tier-lists/${id}`);
  const arrange = page.getByRole("button", { name: "Arrange", exact: true });
  await expect(arrange, "no Arrange for the owner").toBeVisible({
    timeout: 20_000,
  });
  // Read-only: no handles, no remove buttons — and no padlock any more.
  await expect(page.locator('[aria-roledescription="sortable"]')).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /editing$/ })).toHaveCount(0);

  await arrange.tap();
  const bar = page.getByRole("toolbar", { name: "Arrange" });
  await expect(bar).toBeVisible();
  await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(2);
  await expect(page.locator('[aria-roledescription="sortable"]')).toHaveCount(
    2,
  );
  for (const name of [/^Undo/, /^Redo/, /^Add entry$/, /^Done$/]) {
    await expect(bar.getByRole("button", { name })).toBeVisible();
  }
  const nav = await bottomNav(page);
  const barEdges = await edgesOf(bar);
  const navEdges = await edgesOf(nav);
  expect(
    barEdges.bottom,
    "the Arrange bar is under the tab bar",
  ).toBeLessThanOrEqual(navEdges.top + 1);
  expect(barEdges.bottom).toBeLessThanOrEqual(844);

  await bar.getByRole("button", { name: "Done" }).tap();
  await expect(bar).toBeHidden();
  await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
});

test("remove lands at once; the toast's Undo and the bar's Redo step the history", async ({
  page,
}) => {
  const id = tierListId ?? "";
  const api = await Gql.forAccount("primary");
  try {
    const before = await entries(api, id);
    test.skip(
      before.length < 2,
      "the account has fewer than two wines to rank",
    );

    await page.goto(`/tier-lists/${id}`);
    await page.getByRole("button", { name: "Arrange", exact: true }).tap();
    const remove = page.getByRole("button", { name: /^Remove / }).first();
    const label = (await remove.getAttribute("aria-label")) ?? "";
    const name = label.replace(/^Remove /, "");
    await remove.tap();

    const toast = page.locator("[data-sonner-toast]").filter({
      hasText: `Removed ${name}`,
    });
    await expect(toast, "no Removed toast").toBeVisible({ timeout: 15_000 });
    await eventually(
      async () => ((await entries(api, id)).length === 1 ? true : null),
      { timeoutMs: 20_000, what: "the removal to reach the server" },
    );

    await toast.getByRole("button", { name: "Undo" }).tap();
    await eventually(
      async () => ((await entries(api, id)).length === 2 ? true : null),
      { timeoutMs: 20_000, what: "Undo to put the entry back" },
    );
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    const bar = page.getByRole("toolbar", { name: "Arrange" });
    const redo = bar.getByRole("button", { name: `Redo: removed ${name}` });
    await expect(redo, "Redo does not name the removal").toBeEnabled({
      timeout: 15_000,
    });
    await redo.tap();
    await eventually(
      async () => ((await entries(api, id)).length === 1 ? true : null),
      { timeoutMs: 20_000, what: "Redo to take it out again" },
    );
  } finally {
    await api.dispose();
  }
});

test("the history survives a reload: Undo still names the removal and works", async ({
  page,
}) => {
  const id = tierListId ?? "";
  const api = await Gql.forAccount("primary");
  try {
    const now = await entries(api, id);
    test.skip(now.length !== 1, "the previous step did not leave one entry");

    await page.goto(`/tier-lists/${id}`);
    await page.getByRole("button", { name: "Arrange", exact: true }).tap();
    const undo = page
      .getByRole("toolbar", { name: "Arrange" })
      .getByRole("button", { name: /^Undo: removed / });
    await expect(undo, "a reload lost the edit history").toBeEnabled({
      timeout: 20_000,
    });
    await undo.tap();
    await eventually(
      async () => ((await entries(api, id)).length === 2 ? true : null),
      { timeoutMs: 20_000, what: "Undo after a reload to put the entry back" },
    );
  } finally {
    await api.dispose();
  }
});
