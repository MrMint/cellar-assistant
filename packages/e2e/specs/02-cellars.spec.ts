import { deleteCellars, unique } from "../fixtures/data.ts";
import { bodyText, expect, test } from "../fixtures/test.ts";

/**
 * Create a cellar through the form, then find it on the index.
 *
 * Asserts the restored production UI (`82450ad1`, UI parity wave 2): the old
 * `CellarForm` has no heading, labels privacy "Privacy" (default FRIENDS),
 * submits with "Add", and lands on the new cellar's items page; `/cellars` is
 * the old card grid under a "Home / Cellars" breadcrumb.
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
  await expect(primary.getByText("Privacy")).toBeVisible();
  await expect(
    primary.getByText("These users will be treated as owners of the cellar."),
  ).toBeVisible();

  await primary.getByLabel("Name").fill(name);
  await primary.getByRole("button", { name: "Add", exact: true }).click();

  // The old destination: the new cellar's items page.
  await expect(primary, "did not navigate to the new cellar").toHaveURL(
    /\/cellars\/[0-9a-f-]{36}\/items/,
    { timeout: 30_000 },
  );
  const cellarId = new URL(primary.url()).pathname.split("/")[2];
  created.push(cellarId);
  // The breadcrumb carries the cellar's name; the empty grid says so.
  await expect(primary.getByText(name).first()).toBeVisible();
  await expect(primary.getByText("No items in this cellar")).toBeVisible();

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
  await expect(primary.getByRole("link", { name: "Home" })).toBeVisible();
  // `myCellars` is newest first, so the new card is in the first virtual rows.
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

  // Joy's Select is a listbox, not a native <select>.
  await primary.getByRole("combobox", { name: "Privacy" }).click();
  await primary.getByRole("option", { name: /^private$/i }).click();

  await primary.getByRole("button", { name: "Add", exact: true }).click();
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

  await primary.goto(`/cellars/${cellar.id}`);
  const text = await bodyText(primary);
  expect(text).toContain(cellar.name);
  expect(text).not.toMatch(/Something went wrong|Unexpected error/i);
});
