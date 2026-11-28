import type { Page } from "@playwright/test";
import { createCellar, unique } from "../../fixtures/data.ts";
import { deleteCellarWithContents } from "../../fixtures/db.ts";
import { expect, test } from "../../fixtures/mobile.ts";
import { Gql } from "../../fixtures/test.ts";

/**
 * X12 (D9, D10) — universal search at 390x844: one results page of sections,
 * Your bottles · Drinks · Places · Recipes · People · Brands, three rows each
 * with "See all". Drinks leaves out what is already in your bottles.
 *
 * Fixtures: one PRIVATE cellar holding one bottle of a tea with a unique name
 * (a tea needs no onboarding), and nothing else — no places are created. The
 * tea's name is unique, so "Your bottles" and "Drinks" can be asserted by name
 * without depending on what else this stack's catalog holds.
 */

const searchBox = (page: Page) =>
  page.getByRole("searchbox").or(page.getByRole("textbox")).first();

const section = (page: Page, name: string) =>
  page.locator(`[data-search-section="${name}"]`).filter({ visible: true });

type Fixture = {
  cellarId: string;
  cellarName: string;
  teaName: string;
  bottleId: string;
};

async function seed(): Promise<Fixture> {
  const api = await Gql.forAccount("primary");
  try {
    const cellarName = unique("E12 Search Cellar");
    const cellarId = await createCellar(api, cellarName, "PRIVATE");
    const ref = await api.query(
      `query { referenceData(kind: TEA_CATEGORY, first: 1) {
         __typename ... on ReferenceRowConnection { edges { node { value } } }
       } }`,
    );
    const category = ref.referenceData.edges[0]?.node.value;
    expect(category, "no tea categories seeded").toBeTruthy();
    const teaName = unique("E12 Oolong");
    const created = await api.query(
      `mutation C($input: CreateItemInput!, $id: ID) {
         createItem(type: TEA, itemId: $id, input: $input) {
           __typename
           ... on MutationCreateItemSuccess { data { id } }
           ... on Error { message }
         }
       }`,
      { id: crypto.randomUUID(), input: { name: teaName, tea: { category } } },
    );
    expect(
      created.createItem.__typename,
      JSON.stringify(created.createItem),
    ).toBe("MutationCreateItemSuccess");
    const added = await api.query(
      `mutation A($cellarId: ID!, $input: AddCellarItemInput!) {
         addItemToCellar(cellarId: $cellarId, input: $input) {
           __typename ... on CellarItem { id } ... on Error { message }
         }
       }`,
      {
        cellarId,
        input: {
          cellarItemId: crypto.randomUUID(),
          item: { id: created.createItem.data.id, type: "TEA" },
        },
      },
    );
    expect(added.addItemToCellar.__typename).toBe("CellarItem");
    return {
      cellarId,
      cellarName,
      teaName,
      bottleId: added.addItemToCellar.id,
    };
  } finally {
    await api.dispose();
  }
}

let fixture: Fixture | undefined;

test.beforeAll(async () => {
  fixture = await seed();
});

test.afterAll(() => {
  if (fixture !== undefined) deleteCellarWithContents(fixture.cellarId);
});

const need = (): Fixture => {
  if (fixture === undefined) throw new Error("the fixture was not seeded");
  return fixture;
};

test("typing shows your bottle and the item, each in its own section, and the box keeps focus", async ({
  page,
  noise,
}) => {
  const { teaName, cellarName, cellarId, bottleId } = need();
  await page.goto("/search");
  const box = searchBox(page);
  await box.tap();
  await page.keyboard.type(teaName);
  await page.waitForURL(
    (url) =>
      url.searchParams.get("q") === teaName && url.pathname === "/search",
  );

  const bottles = section(page, "bottles");
  await expect(bottles, "Your bottles did not appear").toBeVisible({
    timeout: 30_000,
  });
  await expect(
    bottles.getByRole("heading", { name: /^Your bottles/ }),
  ).toBeVisible();
  const bottle = bottles.getByRole("link", { name: teaName });
  await expect(bottle).toBeVisible();
  await expect(bottles).toContainText(cellarName);
  await expect(bottle).toHaveAttribute(
    "href",
    `/cellars/${cellarId}/teas/${bottleId}`,
  );

  // Ruling 1: a drink already in your bottles is not listed again in Drinks.
  const items = section(page, "items");
  await expect(items.getByRole("link", { name: teaName })).toHaveCount(0);

  // Sections come in D10's order: bottles first.
  const order = await page.evaluate(() =>
    [...document.querySelectorAll("[data-search-section]")].map((el) =>
      el.getAttribute("data-search-section"),
    ),
  );
  expect(order[0]).toBe("bottles");

  // N01: the results replaced themselves under the box; the box is the same.
  await expect(box).toBeFocused();
  await expect(box).toHaveValue(teaName);

  // Thumb-sized rows: every row is at least 44 pt tall.
  const heights = await page
    .locator("[data-search-row]")
    .evaluateAll((rows) =>
      rows.map((row) => row.getBoundingClientRect().height),
    );
  expect(heights.length).toBeGreaterThan(0);
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
  // No sideways scroll at phone width.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await bottle.tap();
  await page.waitForURL(`**/cellars/${cellarId}/teas/${bottleId}`);
  expect(noise.pageErrors, "the search page threw").toEqual([]);
});

test("See all opens one section in place, and All comes back", async ({
  page,
  noise,
}) => {
  need();
  // A two-word prefix every E12 tea shares, so Items has more than three
  // when earlier runs left their teas behind (items have no delete) — and
  // when it does not, the opened section is reached by URL instead.
  const term = "E12 Oolong";
  await page.goto(`/search?q=${encodeURIComponent(term)}`);
  const items = section(page, "items");
  await expect(items).toBeVisible({ timeout: 30_000 });
  const seeAll = items.getByRole("link", { name: /See all/ });
  if ((await seeAll.count()) > 0) {
    await seeAll.tap();
  } else {
    await page.goto(`/search?q=${encodeURIComponent(term)}&in=items`);
  }
  await page.waitForURL((url) => url.searchParams.get("in") === "items");
  // The Drinks chip is lit; earlier runs' teas (no longer in a cellar) are
  // the drinks, or the section says it found none.
  const scopes = page.locator("[data-search-scopes]");
  await expect(scopes.getByRole("link", { name: /^Drinks/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    section(page, "items").or(page.getByText(`No drinks match “${term}”`)),
  ).toBeVisible();
  // Only the opened section is drawn.
  await expect(section(page, "bottles")).toHaveCount(0);
  await expect(searchBox(page)).toHaveValue(term);

  await scopes.getByRole("link", { name: /^All/ }).tap();
  await page.waitForURL(
    (url) =>
      url.searchParams.get("in") === null && url.searchParams.get("q") === term,
  );
  await expect(section(page, "items")).toBeVisible();
  expect(noise.pageErrors).toEqual([]);
});

test("a search that matches nothing is one empty state with one action", async ({
  page,
  noise,
}) => {
  const nothing = unique("zqxj nothing");
  await page.goto(`/search?q=${encodeURIComponent(nothing)}`);
  await expect(
    page.getByText(`Nothing matches “${nothing}”`).filter({ visible: true }),
  ).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole("link", { name: `Add “${nothing}”` }),
  ).toHaveAttribute("href", /^\/add\?name=/);
  await expect(page.locator("[data-search-section]")).toHaveCount(0);
  expect(noise.pageErrors).toEqual([]);
});

test("People finds a friend or someone to add, never yourself", async ({
  page,
  noise,
}) => {
  const api = await Gql.forAccount("secondary");
  let name: string;
  try {
    name = (await api.query("query { me { profile { displayName } } }")).me
      .profile.displayName;
  } finally {
    await api.dispose();
  }
  await page.goto(`/search?q=${encodeURIComponent(name)}`);
  const people = section(page, "people");
  await expect(people).toBeVisible({ timeout: 30_000 });
  await expect(people).toContainText(name);
  // Connected (a link into Friends), not yet (Add friend), or a request
  // either way (Cancel request / Accept) — this account's friendship with the
  // other is other specs' business.
  // The person row is one link when you are friends (its status line reads
  // "Friend"), and carries an action beside it otherwise.
  const addButton = people.getByRole("button", {
    name: `Add ${name} as a friend`,
  });
  const pending = people.getByRole("button", {
    name: new RegExp(`^(Cancel the request to|Accept) ${name}`),
  });
  const friendsLink = people
    .getByRole("link")
    .filter({ hasText: name })
    .filter({ hasText: "Friend" });
  expect(
    (await addButton.count()) +
      (await pending.count()) +
      (await friendsLink.count()),
  ).toBe(1);
  expect(noise.pageErrors).toEqual([]);
});
