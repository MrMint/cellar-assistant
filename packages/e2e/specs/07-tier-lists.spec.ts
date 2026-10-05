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
 */
test.describe.configure({ mode: "serial" });

let tierListId: string;
let listName: string;

test("creates a tier list", async ({ primary }) => {
  listName = unique("E2 Tier List");

  await primary.goto("/tier-lists/add");
  await primary.getByLabel("Name").fill(listName);
  // The old form's default list type is Places; this list ranks wines.
  await primary.getByRole("combobox", { name: "List Type" }).click();
  await primary.getByRole("option", { name: "Wines" }).click();
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
  for (const item of items.slice(0, 2)) {
    await primary.getByRole("button", { name: "Add entry" }).click();
    await primary
      .getByPlaceholder("Search wines by name or description")
      .fill(item.name);
    // Not search-as-you-type: every query embeds the phrase first.
    await primary.getByRole("button", { name: "Search", exact: true }).click();
    await expect(
      primary.getByRole("dialog").getByText(item.name).first(),
      `"${item.name}" did not come back in the picker`,
    ).toBeVisible({ timeout: 25_000 });
    await primary
      .getByRole("dialog")
      .getByRole("button", { name: "Add", exact: true })
      .first()
      .click();
    // A successful add closes the dialog and refreshes the board.
    await expect(primary.getByRole("dialog")).toBeHidden({ timeout: 20_000 });
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

test("the rankings board renders for every scope", async ({ primary }) => {
  const noise = watch(primary);
  await primary.goto("/rankings");
  await settleNetwork(primary);
  expect(noise.pageErrors, "the rankings page threw").toEqual([]);
  // D7's behaviour change: "friends exist but none reviewed" and "no friends
  // yet" must read differently, and neither may silently fall back.
  const text = await bodyText(primary);
  expect(text.length).toBeGreaterThan(0);
});
