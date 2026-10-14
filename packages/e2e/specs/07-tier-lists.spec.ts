import { eventually, unique } from "../fixtures/data.ts";
import {
  bodyText,
  expect,
  settleNetwork,
  test,
  watch,
} from "../fixtures/test.ts";

/**
 * The restored tier-list pages (`82450ad1`'s UI over the new API): create a
 * wine list through the old form, put two entries in it, then **drag** one
 * from Unrated up to Outstanding on the restored @dnd-kit board.
 *
 * The drag is a real pointer drag on the row's handle (the old board's only
 * reorder control; the rewrite's "Move … a band" buttons are gone). It goes
 * through `reorderCallFor`, which sends the destination band's *full*
 * membership in one `reorderTierListBand` call.
 *
 * The assertion that matters is the one at the end: the new band survives a
 * **reload**. A board that only reorders in React state looks identical.
 *
 * X23 / D4: the board is read-only until **Arrange**, so the add and the drag
 * both start there (an empty list's own "Add from what you've tasted" opens
 * Arrange and the picker at once), and a picker row is one control — the
 * whole row.
 *
 * X16: the picker opens on suggestion sections and picks several — a row is
 * a checkbox, and "Add N entries" adds them as one edit — so this spec
 * searches, ticks the one row it wants and adds it. It also creates its list
 * empty: the form's "Start with your ratings" is turned off when offered, so
 * the empty list's own button is there to press (that start is
 * `mobile/m06-tier-list-without-typing.spec.ts`'s).
 */
test.describe.configure({ mode: "serial" });

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let tierListId: string;
let listName: string;

test("creates a tier list", async ({ api, primary }) => {
  listName = unique("E2 Tier List");
  // Whether the form will offer "Start with your ratings" for wines, asked
  // up front: the switch appears only once the form's own templates read
  // lands, so a bare `isVisible()` raced it and, losing, created the list
  // pre-filled (the switch is on by default).
  const templates = await api.raw(
    `query { me { tierListTemplates(first: 10) { edges { node { listType ratedCount } } } } }`,
  );
  const ratedWines =
    (templates.data?.me?.tierListTemplates?.edges ?? []).find(
      (e: any) => e.node.listType === "wine",
    )?.node.ratedCount ?? 0;

  await primary.goto("/tier-lists/add");
  await primary.getByLabel("Name").fill(listName);
  // The old form's default list type is Places; this list ranks wines.
  await primary.getByRole("combobox", { name: "List Type" }).click();
  await primary.getByRole("option", { name: "Wines" }).click();
  // X16: offered only to an account that has rated a wine; this spec wants
  // its list empty.
  const fromRatings = primary.getByRole("switch", {
    name: /Start with your ratings/,
  });
  if (ratedWines > 0) {
    await expect(fromRatings).toBeChecked({ timeout: 15_000 });
    await fromRatings.click();
    await expect(fromRatings).not.toBeChecked();
  }
  await primary.getByRole("button", { name: /^(Create|Save)/ }).click();

  await expect(primary, "did not navigate to the new tier list").toHaveURL(
    /\/tier-lists\/[0-9a-f-]{36}/,
    { timeout: 30_000 },
  );
  tierListId = new URL(primary.url()).pathname.split("/")[2];
  await expect(
    primary.getByRole("heading", { name: listName }),
    "the new tier list's page never showed its name",
  ).toBeVisible({ timeout: 20_000 });
});

test("adds entries to it", async ({ api, primary }) => {
  test.skip(tierListId === undefined, "no tier list was created");

  // Something to rank. `itemSearch` needs text or a vector, so take whatever
  // the database has rather than assuming a fixture.
  const data = await api.raw(
    `query { itemSearch(text: "wine", itemTypes: [WINE], limit: 5, first: 5) {
       __typename
       ... on ItemSearchConnection { edges { node { item { id name } } } }
       ... on ActorError { code message }
     } }`,
  );
  const items = (data.data?.itemSearch?.edges ?? []).map(
    (e: any) => e.node.item,
  );
  const actorError =
    data.data?.itemSearch?.code === undefined
      ? ""
      : ` (${data.data.itemSearch.code}: ${data.data.itemSearch.message})`;
  // The picker embeds the phrase, so without an AI provider (Ollama) there
  // is nothing to pick; the drag test below seeds through the API instead.
  test.skip(
    items.length < 2,
    `need two wines in the picker; itemSearch returned ${items.length}${actorError}${data.errors ? ` (${JSON.stringify(data.errors)})` : ""}`,
  );

  await primary.goto(`/tier-lists/${tierListId}`);
  for (const [index, item] of items.slice(0, 2).entries()) {
    // The empty list's own button first (N15's "Add from what you've
    // tasted"), then the Arrange bar's "Add entry": one at a time either way.
    await primary
      .getByRole("button", {
        name: index === 0 ? "Add from what you've tasted" : "Add entry",
        exact: true,
      })
      .click();
    const dialog = primary.getByRole("dialog");
    // Each open starts from an empty search — no rows left over from the
    // last one, which used to satisfy the name wait below before this
    // search had even been sent.
    const results = dialog.getByRole("list", { name: "Search results" });
    await expect(results.getByRole("listitem")).toHaveCount(0);
    await dialog
      .getByPlaceholder("Search wines by name or description")
      .fill(item.name);
    // Not search-as-you-type: every query embeds the phrase first. Wait for
    // *this* search's answer, not for text that may already be on screen.
    const searched = primary.waitForResponse(
      (response) =>
        response.url().includes("/api/graphql") &&
        /query TierListItemPicker\b/.test(response.request().postData() ?? ""),
      { timeout: 25_000 },
    );
    await dialog.getByRole("button", { name: "Search", exact: true }).click();
    await searched;
    // Lexical retrieval (N08) brings back every "E2 Wine …" for any one of
    // their names, so pick the row that *is* this item, not the first row.
    // (The `Add ` prefix is the X23 row's old screen-reader text; X16's
    // rows are checkboxes named by the item, so the pattern allows both.)
    const row = results.getByRole("listitem").filter({
      has: primary.getByText(
        new RegExp(`^(Add )?${escapeRegExp(item.name)}$`, "i"),
      ),
    });
    await expect(
      row.first(),
      `"${item.name}" did not come back in the picker`,
    ).toBeVisible({ timeout: 25_000 });
    // The whole row is the control (X23), a checkbox since X16; "On this
    // list" rows are disabled. Ticking it arms the sheet's one action.
    await row.first().getByRole("checkbox").click();
    await dialog.getByRole("button", { name: "Add 1 entry" }).click();
    // A successful add closes the dialog and refreshes the board.
    await expect(dialog).toBeHidden({ timeout: 20_000 });
  }

  await expect(
    primary.getByRole("button", { name: /^Remove / }).nth(1),
    "two entries did not land on the board",
  ).toBeVisible({ timeout: 20_000 });
});

test("a drag between bands survives a reload", async ({ api, primary }) => {
  test.skip(tierListId === undefined, "no tier list was created");

  let bandsBefore = await readBands(api, tierListId);
  if (!bandsBefore.some((e) => e.band === 0)) {
    // The picker test skips without an AI provider. The board under test does
    // not depend on it, so seed two wines from the viewer's cellars directly.
    await seedWines(api, tierListId, 2);
    bandsBefore = await readBands(api, tierListId);
  }
  const moving = bandsBefore.find((e) => e.band === 0);
  test.skip(
    moving === undefined,
    "nothing in Unrated to drag (no wine in the viewer's cellars to seed)",
  );

  await primary.goto(`/tier-lists/${tierListId}`);
  // Read-only until Arrange (X23/D4): no handles before it.
  await expect(
    primary.locator('[aria-roledescription="sortable"]'),
  ).toHaveCount(0);
  await primary.getByRole("button", { name: "Arrange", exact: true }).click();
  const handle = primary.locator('[aria-roledescription="sortable"]').first();
  await expect(handle, "no drag handle on the board").toBeVisible({
    timeout: 20_000,
  });
  const label = primary.getByText("Outstanding", { exact: true }).first();
  const from = await handle.boundingBox();
  const to = await label.boundingBox();
  if (from === null || to === null) throw new Error("board not laid out");

  // dnd-kit's PointerSensor activates after 8px; move in steps so it sees
  // the drag start and the band under the pointer.
  await primary.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await primary.mouse.down();
  await primary.mouse.move(
    from.x + from.width / 2,
    from.y + from.height / 2 - 12,
    {
      steps: 4,
    },
  );
  await primary.mouse.move(from.x + 120, to.y + to.height / 2, { steps: 20 });
  await primary.mouse.up();

  // Server-side, through a fresh read.
  const changed = await eventually(
    async () => {
      const after = await readBands(api, tierListId);
      const now = after.find((e) => e.band === 5);
      return now ?? null;
    },
    { timeoutMs: 30_000, what: "an entry to reach Outstanding server-side" },
  ).catch(() => null);

  expect(changed, "no entry reached band 5 on the server").not.toBeNull();

  await primary.reload();
  await expect(primary.getByText(String(changed?.name)).first()).toBeVisible({
    timeout: 20_000,
  });
});

/** Add up to `count` wines from the viewer's cellars, through the API. */
async function seedWines(
  api: { query: (q: string, v?: Record<string, unknown>) => Promise<any> },
  id: string,
  count: number,
): Promise<void> {
  const data = await api.query(
    `query { myCellars(first: 20) {
       __typename
       ... on CellarConnection {
         edges { node { items(first: 50) { edges { node { item { id type } } } } } }
       }
     } }`,
  );
  const wines = new Set<string>();
  for (const cellar of data.myCellars?.edges ?? []) {
    for (const row of cellar.node.items.edges) {
      if (row.node.item?.type === "WINE") wines.add(row.node.item.id);
    }
  }
  for (const wineId of Array.from(wines).slice(0, count)) {
    const added = await api.query(
      `mutation A($id: ID!, $input: AddTierListItemInput!) {
         addTierListItem(tierListId: $id, input: $input) {
           __typename ... on Error { message }
         }
       }`,
      { id, input: { entry: { id: wineId, type: "WINE" }, band: 0 } },
    );
    expect(added.addTierListItem.__typename).toBe("TierListItem");
  }
}

async function readBands(
  api: { query: (q: string, v?: Record<string, unknown>) => Promise<any> },
  id: string,
): Promise<{ name: string; band: number }[]> {
  const data = await api.query(
    `query T($id: ID!) {
       tierList(id: $id) {
         __typename
         ... on TierList {
           items(first: 50) {
             edges { node { id band position entryType item { name } place { name } } }
           }
         }
       }
     }`,
    { id },
  );
  const list = data.tierList;
  if (list.__typename !== "TierList") return [];
  return list.items.edges.map((e: any) => ({
    // A `TierListItem` has no `name` of its own — it points at whichever of the
    // two sides its `entryType` says, and exactly one is non-null.
    name: e.node.item?.name ?? e.node.place?.name ?? e.node.id,
    band: e.node.band,
  }));
}

test("a stranger cannot read a PRIVATE tier list", async ({ api2 }) => {
  test.skip(tierListId === undefined, "no tier list was created");
  const data = await api2.query(
    `query T($id: ID!) { tierList(id: $id) {
       __typename ... on Error { message }
     } }`,
    { id: tierListId },
  );
  expect(
    data.tierList.__typename,
    "another account read a PRIVATE tier list",
  ).toBe("NotFoundError");
});

test("Top rated: Me · Friends · Everyone, Me first, each scope renders (N15)", async ({
  primary,
}) => {
  const noise = watch(primary);
  await primary.goto("/rankings");
  await expect(
    primary.getByRole("heading", { name: "Top rated" }),
  ).toBeVisible();
  const scopes = primary.getByRole("radiogroup", { name: "Whose scores" });
  await expect(scopes.getByRole("radio")).toHaveText([
    "Me",
    "Friends",
    "Everyone",
  ]);
  // Me by default: a new account's first look is its own scores, never
  // strangers' items under a label it did not choose (observation 3).
  await expect(
    scopes.getByRole("radio", { name: "Me", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  for (const [label, param] of [
    ["Friends", "friends"],
    ["Everyone", "everyone"],
  ] as const) {
    await scopes.getByRole("radio", { name: label }).click();
    await expect(primary).toHaveURL(new RegExp(`[?&]scope=${param}`));
    await settleNetwork(primary);
  }
  // Every board is ranked: a card carries its place as a numeral.
  const numerals = primary.locator('[data-slot="rank-numeral"]');
  if ((await numerals.count()) > 0) {
    await expect(numerals.first()).toHaveText(/Rank\s*1$/);
  }
  expect(noise.pageErrors, "the rankings page threw").toEqual([]);
  const text = await bodyText(primary);
  expect(text.length).toBeGreaterThan(0);
});

test("/tier-lists: your own lists are under Yours and never under Discover (X11)", async ({
  api,
  primary,
}) => {
  const data = await api.query(
    `query { myTierLists(first: 100, section: MINE) {
       __typename ... on TierListConnection { edges { node { id } } }
     } }`,
  );
  const mine: string[] = (data.myTierLists.edges ?? []).map(
    (edge: { node: { id: string } }) => edge.node.id,
  );
  await primary.goto("/tier-lists");
  await expect(primary.getByRole("region", { name: "Yours" })).toBeVisible();
  const discoverLinks = await primary
    .getByRole("region", { name: "Discover" })
    .locator('a[href^="/tier-lists/"]')
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? ""),
    );
  for (const id of mine) {
    expect(
      discoverLinks,
      "one of your own tier lists is listed under Discover",
    ).not.toContain(`/tier-lists/${id}`);
  }
});
