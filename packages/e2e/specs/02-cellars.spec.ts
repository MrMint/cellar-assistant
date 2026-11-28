import { deleteCellars, unique } from "../fixtures/data.ts";
import { bodyText, expect, test } from "../fixtures/test.ts";

/**
 * Create a cellar through the form, then find it on the index.
 *
 * Asserts C1's form (lot-cellars-shelves-03): Name, "Who sees it" (Private ·
 * Friends · Public, Friends by default), Co-owners, and "Make cellar", which
 * lands on the new cellar's items page; `/cellars` is
 * C1's index (lot-cellars-shelves-01): "Cellars" with New cellar, then
 * Yours with a card per cellar, its name the card's link.
 *
 * Two halves on purpose. The form proves `createCellar` and the redirect; the
 * index proves `CellarsCollectionActor` sees the row a *different* actor wrote,
 * which is the part a single-actor unit test cannot reach.
 */
test.describe.configure({ mode: "serial" });

/** Every cellar a form below created, for the `afterAll`. */
const created: string[] = [];

test.afterAll(async () => {
  await deleteCellars("primary", created.splice(0));
});

test("creates a cellar and shows it on the index", async ({ api, primary }) => {
  const name = unique("E2 Cellar");

  await primary.goto("/cellars/add");
  await expect(primary.getByLabel("Name")).toBeVisible();
  const whoSees = primary.getByRole("radiogroup", { name: "Who sees it" });
  await expect(whoSees).toBeVisible();
  await expect(
    whoSees.getByRole("radio", { name: "Friends" }),
    "the default privacy is Friends",
  ).toHaveAttribute("aria-checked", "true");

  await primary.getByLabel("Name").fill(name);
  await primary
    .getByRole("main")
    .getByRole("button", { name: "Make cellar", exact: true })
    .click();

  // The old destination: the new cellar's items page.
  await expect(primary, "did not navigate to the new cellar").toHaveURL(
    /\/cellars\/[0-9a-f-]{36}\/items/,
    { timeout: 30_000 },
  );
  const cellarId = new URL(primary.url()).pathname.split("/")[2];
  created.push(cellarId);
  // The breadcrumb carries the cellar's name; an empty cellar is the
  // first-run state with its one action (N15), not an empty grid.
  await expect(primary.getByText(name).first()).toBeVisible();
  // C1's empty shelf (lot-cellars-shelves-07): one dashed "Add a bottle".
  await expect(primary.getByText(`Nothing in ${name} yet`)).toBeVisible();
  await expect(
    primary.getByRole("main").getByRole("link", { name: /Add a bottle/ }),
  ).toHaveAttribute("href", `/cellars/${cellarId}/items/add`);

  // The old form's default privacy is FRIENDS; read back what the server
  // recorded rather than trusting the form.
  const data = await api.query(
    `query Cellar($id: ID!) {
       cellar(id: $id) { __typename ... on Cellar { id privacy } }
     }`,
    { id: cellarId },
  );
  expect(data.cellar.privacy, "the old default privacy is FRIENDS").toBe(
    "FRIENDS",
  );

  const detail = await primary.goto(`/cellars/${cellarId}`);
  expect(
    detail?.status(),
    "the cellar detail page did not render",
  ).toBeLessThan(400);
  await expect(primary.getByText(name).first()).toBeVisible();

  const index = await primary.goto("/cellars");
  expect(index?.status(), "/cellars did not render").toBeLessThan(400);
  // The breadcrumb's Home, not the SideRail's (both are links named "Home").
  await expect(
    primary.getByRole("heading", { name: "Cellars", level: 1 }),
  ).toBeVisible();
  await expect(
    primary.getByRole("main").getByRole("link", { name: "New cellar" }),
  ).toHaveAttribute("href", "/cellars/add");
  // `myCellars` puts your own cellars first, by most recent activity (D13); a
  // cellar created a moment ago is the newest, so it is in the first rows.
  const card = primary.getByRole("link", { name, exact: true });
  await expect(card, "the new cellar is not on /cellars").toBeVisible({
    timeout: 20_000,
  });
  await expect(card).toHaveAttribute("href", `/cellars/${cellarId}/items`);
});

test("a cellar's privacy can be changed to PRIVATE", async ({
  api,
  primary,
}) => {
  const name = unique("E2 Private Cellar");
  await primary.goto("/cellars/add");
  await primary.getByLabel("Name").fill(name);

  // Who sees it is a segmented radiogroup.
  await primary
    .getByRole("radiogroup", { name: "Who sees it" })
    .getByRole("radio", { name: "Private" })
    .click();

  await primary
    .getByRole("main")
    .getByRole("button", { name: "Make cellar", exact: true })
    .click();
  await expect(primary).toHaveURL(/\/cellars\/[0-9a-f-]{36}\/items/, {
    timeout: 30_000,
  });

  const cellarId = new URL(primary.url()).pathname.split("/")[2];
  created.push(cellarId);

  const data = await api.query(
    `query Cellar($id: ID!) {
       cellar(id: $id) { __typename ... on Cellar { id name privacy } }
     }`,
    { id: cellarId },
  );
  expect(data.cellar.__typename).toBe("Cellar");
  expect(data.cellar.privacy, "privacy was not stored as PRIVATE").toBe(
    "PRIVATE",
  );

  // The edit form opens on the stored values and saves back to /cellars.
  await primary.goto(`/cellars/${cellarId}/edit`);
  await expect(primary.getByLabel("Name")).toHaveValue(name);
  await primary.getByLabel("Name").fill(`${name} renamed`);
  await primary.getByRole("button", { name: "Save", exact: true }).click();
  await expect(primary).toHaveURL(/\/cellars$/, { timeout: 30_000 });
  const renamed = await api.query(
    `query Cellar($id: ID!) {
       cellar(id: $id) { __typename ... on Cellar { name privacy } }
     }`,
    { id: cellarId },
  );
  expect(renamed.cellar.name).toBe(`${name} renamed`);
  expect(renamed.cellar.privacy).toBe("PRIVATE");
});

test("an empty cellar renders its detail page without erroring", async ({
  api,
  primary,
}) => {
  const data = await api.query(
    `query { myCellars(first: 1) {
       __typename ... on CellarConnection { edges { node { id name } } }
     } }`,
  );
  const conn = data.myCellars;
  expect(conn.__typename, "myCellars did not return a connection").toBe(
    "CellarConnection",
  );
  const cellar = conn.edges[0]?.node;
  test.skip(cellar === undefined, "no cellar to open");

  // `/cellars/[id]` redirects to the cellar home (X04), whose content streams
  // in behind its loading shell: poll for it rather than read the body once.
  await primary.goto(`/cellars/${cellar.id}`);
  await expect.poll(() => bodyText(primary)).toContain(cellar.name);
  const text = await bodyText(primary);
  expect(text).not.toMatch(/Something went wrong|Unexpected error/i);
});
