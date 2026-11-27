import { eventually, unique } from "../../fixtures/data.ts";
import { bottomNav, edgesOf, expect, test } from "../../fixtures/mobile.ts";
import { Gql } from "../../fixtures/test.ts";

/**
 * X16 at 390x844 — tier lists without typing:
 *
 *  1. An empty list's "Add from what you've tasted" opens Add entry on its
 *     sections (In your cellars first, for an account whose cellars hold
 *     wines); two rows ticked are **one** "Add 2 entries", and the toast's
 *     single Undo takes both back.
 *  2. A list started from your ratings: the form names an unnamed list
 *     ("My wines"), offers "Start with your ratings" on, and the list lands
 *     with as many entries as `tierListTemplates` said it would.
 *  3. Insights' grounded Try this next: either cards, each with a reason in
 *     words, or the owner's hint — never a percentage.
 *  4. The Edit order dock at a 320 pt phone: every control inside the
 *     gutters, nothing overflowing.
 *
 * Every claim about a list's contents is read back through the API. Lists
 * are created through the API or the form and deleted afterwards; no places
 * are created.
 */
test.describe.configure({ mode: "serial" });

const created: string[] = [];
let emptyListId: string | undefined;

type Entry = { id: string; band: number };

async function entries(api: Gql, id: string): Promise<Entry[]> {
  const data = await api.query(
    `query T($id: ID!) { tierList(id: $id) { __typename
       ... on TierList { items(first: 100) { edges { node { id band } } } } } }`,
    { id },
  );
  if (data.tierList.__typename !== "TierList") return [];
  return data.tierList.items.edges.map((e: any) => ({
    id: e.node.id,
    band: e.node.band,
  }));
}

async function createList(
  api: Gql,
  input: Record<string, unknown>,
): Promise<string> {
  const res = await api.query(
    `mutation C($input: CreateTierListInput!) {
       createTierList(input: $input) { __typename ... on TierList { id } ... on Error { message } }
     }`,
    { input },
  );
  if (res.createTierList.__typename !== "TierList") {
    throw new Error(`createTierList: ${res.createTierList.message}`);
  }
  const id = res.createTierList.id as string;
  created.push(id);
  return id;
}

/** Wines in the account's own cellars — what "In your cellars" can offer. */
async function cellarWineCount(api: Gql): Promise<number> {
  const data = await api.query(
    `query { myCellars(first: 20, section: MINE) { __typename
       ... on CellarConnection { edges { node { items(first: 50) {
         edges { node { item { id type } } } } } } } } }`,
  );
  const wines = new Set<string>();
  for (const cellar of data.myCellars?.edges ?? []) {
    for (const row of cellar.node.items.edges) {
      if (row.node.item?.type === "WINE") wines.add(row.node.item.id);
    }
  }
  return wines.size;
}

test.beforeAll(async () => {
  const api = await Gql.forAccount("primary");
  try {
    emptyListId = await createList(api, {
      name: unique("E2 Mobile No Typing"),
      privacy: "PRIVATE",
      listType: "wine",
    });
  } finally {
    await api.dispose();
  }
});

test.afterAll(async () => {
  const api = await Gql.forAccount("primary");
  try {
    for (const id of created) {
      await api.query(
        `mutation D($id: ID!) { deleteTierList(tierListId: $id) { __typename } }`,
        { id },
      );
    }
  } finally {
    await api.dispose();
  }
});

test("Add entry opens on what you have; two ticks are one add, and one Undo", async ({
  page,
}) => {
  const id = emptyListId ?? "";
  const api = await Gql.forAccount("primary");
  try {
    test.skip(
      (await cellarWineCount(api)) < 2,
      "the account's cellars hold fewer than two wines to offer",
    );

    await page.goto(`/tier-lists/${id}`);
    await page
      .getByRole("button", { name: "Add from what you've tasted", exact: true })
      .tap();
    const sheet = page.getByRole("dialog", { name: "Add a wine" });
    await expect(sheet).toBeVisible();
    // No typing: the sections are there before any search.
    const cellars = sheet.getByRole("list", { name: "In your cellars" });
    await expect(cellars, "no In your cellars section").toBeVisible({
      timeout: 20_000,
    });
    const rows = cellars.getByRole("checkbox");
    await expect(rows.nth(1)).toBeVisible();
    // Each row says why it is there.
    await expect(rows.first()).toContainText(/In |Finished · /);

    const add = sheet.getByRole("button", { name: /^Add \d+ entr/ });
    await expect(
      sheet.getByRole("button", { name: "Pick what to add" }),
    ).toBeDisabled();
    await rows.nth(0).tap();
    await rows.nth(1).tap();
    await expect(rows.nth(0)).toHaveAttribute("aria-checked", "true");
    await expect(add).toHaveText("Add 2 entries");
    await add.tap();

    const toast = page
      .locator("[data-sonner-toast]")
      .filter({ hasText: /^Added 2 entries/ });
    await expect(toast, "no toast counting the multi-add").toBeVisible({
      timeout: 15_000,
    });
    await eventually(
      async () => ((await entries(api, id)).length === 2 ? true : null),
      { timeoutMs: 20_000, what: "both entries to reach the server" },
    );

    // One Undo takes the whole multi-add back.
    await toast.getByRole("button", { name: "Undo" }).tap();
    await eventually(
      async () => ((await entries(api, id)).length === 0 ? true : null),
      { timeoutMs: 20_000, what: "one Undo to take both back" },
    );
  } finally {
    await api.dispose();
  }
});

const OPTION_LABEL: Record<string, string> = {
  wine: "Wines",
  beer: "Beers",
  spirit: "Spirits",
  coffee: "Coffees",
  sake: "Sake",
  tea: "Teas",
};

test("a list started from your ratings lands pre-banded", async ({ page }) => {
  const api = await Gql.forAccount("primary");
  try {
    const data = await api.query(
      `query { me { tierListTemplates(first: 10) { edges { node { listType ratedCount } } } } }`,
    );
    const templates: { listType: string; ratedCount: number }[] = (
      data.me?.tierListTemplates.edges ?? []
    ).map((e: any) => e.node);
    const best = templates
      .filter((t) => t.listType in OPTION_LABEL && t.ratedCount > 0)
      .sort((a, b) => b.ratedCount - a.ratedCount)[0];
    test.skip(
      best === undefined,
      "the account has rated nothing to start from",
    );
    const template = best ?? { listType: "wine", ratedCount: 0 };
    const label = OPTION_LABEL[template.listType] ?? "Wines";

    await page.goto("/tier-lists/add");
    await page.getByRole("combobox", { name: "List Type" }).tap();
    await page.getByRole("option", { name: label }).tap();
    // An unnamed list takes the type's name.
    await expect(page.getByLabel("Name")).toHaveValue(
      `My ${label.toLowerCase()}`,
    );
    await page.getByLabel("Name").fill(unique("E2 From Ratings"));
    const start = page.getByRole("switch", { name: /Start with your ratings/ });
    await expect(start, "no Start with your ratings").toBeChecked({
      timeout: 15_000,
    });
    await expect(
      page.getByText(/you've rated, each in the band/),
    ).toBeVisible();
    await page.getByRole("button", { name: "Create" }).tap();

    await expect(page).toHaveURL(/\/tier-lists\/[0-9a-f-]{36}/, {
      timeout: 30_000,
    });
    const id = new URL(page.url()).pathname.split("/")[2] ?? "";
    created.push(id);
    const landed = await eventually(
      async () => {
        const rows = await entries(api, id);
        return rows.length > 0 ? rows : null;
      },
      { timeoutMs: 20_000, what: "the rated entries to land" },
    );
    expect(landed.length).toBe(Math.min(template.ratedCount, 100));
    // A rating always has a band: nothing a template adds is Unrated.
    expect(landed.every((row) => row.band >= 1)).toBe(true);
    await expect(
      page.getByRole("button", { name: "Edit order", exact: true }),
    ).toBeVisible({ timeout: 20_000 });
  } finally {
    await api.dispose();
  }
});

test("Try this next explains every card in words", async ({ page }) => {
  const id = created[created.length - 1] ?? emptyListId ?? "";
  const api = await Gql.forAccount("primary");
  const count = (await entries(api, id)).length;
  await api.dispose();
  test.skip(count === 0, "no list with entries to read insights on");

  await page.goto(`/tier-lists/${id}?tab=insights`);
  const section = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Try this next" }) });
  await expect(section, "no Try this next section").toBeVisible({
    timeout: 20_000,
  });
  const cards = section.getByRole("list", { name: "Try this next" });
  const hint = section.getByText(/^Nothing to suggest yet/);
  await expect(cards.or(hint)).toBeVisible({ timeout: 20_000 });
  await expect(section).not.toContainText("%");
  if (await cards.isVisible()) {
    for (const card of await cards.getByRole("listitem").all()) {
      await expect(card).toContainText(/ranks it |Like /);
      await expect(
        card.getByRole("button", { name: /Want to try/i }),
      ).toBeVisible();
    }
  }
});

test.describe("at 320 pt", () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test("the Edit order dock keeps every control inside the gutters", async ({
    page,
  }) => {
    // The list the Undo test emptied, given one entry if it has none, so
    // this check does not hang on whether the account has rated anything.
    const id = emptyListId ?? "";
    const api = await Gql.forAccount("primary");
    try {
      if ((await entries(api, id)).length === 0) {
        const found = await api.raw(
          `query { itemSearch(text: "wine", itemTypes: [WINE], limit: 3, first: 3) {
             __typename
             ... on ItemSearchConnection { edges { node { item { id } } } }
           } }`,
        );
        const wineId = found.data?.itemSearch?.edges?.[0]?.node.item?.id;
        if (wineId !== undefined) {
          await api.query(
            `mutation A($id: ID!, $input: AddTierListItemInput!) {
               addTierListItem(tierListId: $id, input: $input) { __typename }
             }`,
            { id, input: { entry: { id: wineId, type: "WINE" }, band: 3 } },
          );
        }
      }
      test.skip(
        (await entries(api, id)).length === 0,
        "no wine to put on the list (itemSearch found none)",
      );
    } finally {
      await api.dispose();
    }

    await page.goto(`/tier-lists/${id}`);
    await page.getByRole("button", { name: "Edit order", exact: true }).tap();
    const bar = page.getByRole("toolbar", { name: "Arrange" });
    await expect(bar).toBeVisible();
    for (const name of [
      /^Undo/,
      /^Redo/,
      /^Add entry$/,
      /^Move up$/,
      /^Move down$/,
      /^Move to band…$/,
      /^Done$/,
    ]) {
      await expect(bar.getByRole("button", { name })).toBeVisible();
    }
    const edges = await edgesOf(bar);
    expect(
      edges.left,
      "the bar crosses the left gutter",
    ).toBeGreaterThanOrEqual(16 - 0.5);
    expect(edges.right, "the bar crosses the right gutter").toBeLessThanOrEqual(
      320 - 16 + 0.5,
    );
    for (const button of await bar.getByRole("button").all()) {
      const b = await edgesOf(button);
      expect(b.right, "a control spills out of the bar").toBeLessThanOrEqual(
        edges.right + 0.5,
      );
    }
    const overflow = await bar.evaluate(
      (el) => el.scrollWidth - el.clientWidth,
    );
    expect(overflow, "the bar's contents overflow it").toBeLessThanOrEqual(0);
    const nav = await bottomNav(page);
    expect(edges.bottom).toBeLessThanOrEqual((await edgesOf(nav)).top + 1);
  });
});
