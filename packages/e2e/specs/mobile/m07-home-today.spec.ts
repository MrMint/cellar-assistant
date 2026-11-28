import type { Page } from "@playwright/test";
import {
  createCellar,
  ensureFriends,
  ensureNotFriends,
  friendIds,
  unique,
} from "../../fixtures/data.ts";
import { backdateOpened, deleteCellarWithContents } from "../../fixtures/db.ts";
import { bottomNav, expect, test } from "../../fixtures/mobile.ts";
import { Gql, settleNetwork } from "../../fixtures/test.ts";

/**
 * X10 · Home "Today" at 390x844, on touch.
 *
 * - `/` is Home: one h1, a search pill that opens the full-screen search
 *   sheet (no tab bar there), whose Close comes back; a second tap on the
 *   Search tab at the top opens search too.
 * - Open: the rail of open bottles as cellar tiles; the one past its style's
 *   window (D29) leads with "Past its best", the fresh one reads
 *   "Open · n%". No Pour in a tile's foot (CROSS-LOT).
 * - Drink soon is sealed only (L02): a sealed bottle whose own drink-by date
 *   is a month away, "Sealed · your date: drink by <Mon YYYY>", with Open,
 *   at least 44x44 (L27), which opens it at once with Undo.
 * - Friends: a friend's rating reads as a sentence in an activity card, the
 *   Ranked chip narrows it away, and a friend's PRIVATE list never shows.
 * - `/discoveries` and `/map/scans` land on Home's inbox.
 *
 * Fixtures: one cellar of two teas (teas, because `createItem` writes one
 * without the onboarding flow), one opened now and one backdated 800 days
 * open; a third tea the friend (test2) rates, and a PRIVATE list of theirs
 * ranking it. The cellar goes afterwards; items and the review outlive the
 * run, as every spec's do. The friendship is put back as it was found.
 * No places are created.
 */
test.describe.configure({ mode: "serial" });

const prefix = unique("E2 Home");
const names = {
  fresh: `${prefix} Fresh Tea`,
  stale: `${prefix} Stale Tea`,
  sealed: `${prefix} Sealed Tea`,
  rated: `${prefix} Rated Tea`,
};
const secretList = `${prefix} Secret List`;

let cellarId: string | undefined;
let secretListId: string | undefined;
let wereFriends = true;
let friendId = "";

const createTea = async (api: Gql, name: string, category: string) => {
  const created = await api.query(
    `mutation C($input: CreateItemInput!, $id: ID) {
       createItem(type: TEA, itemId: $id, input: $input) {
         __typename
         ... on MutationCreateItemSuccess { data { id } }
         ... on Error { message }
       }
     }`,
    { id: crypto.randomUUID(), input: { name, tea: { category } } },
  );
  expect(created.createItem.__typename, JSON.stringify(created)).toBe(
    "MutationCreateItemSuccess",
  );
  return created.createItem.data.id as string;
};

const addBottle = async (api: Gql, cellar: string, itemId: string) => {
  const added = await api.query(
    `mutation A($cellarId: ID!, $input: AddCellarItemInput!) {
       addItemToCellar(cellarId: $cellarId, input: $input) {
         __typename ... on CellarItem { id } ... on Error { message }
       }
     }`,
    {
      cellarId: cellar,
      input: {
        cellarItemId: crypto.randomUUID(),
        item: { id: itemId, type: "TEA" },
      },
    },
  );
  expect(added.addItemToCellar.__typename).toBe("CellarItem");
  const bottleId = added.addItemToCellar.id as string;
  const opened = await api.query(
    `mutation O($cellarId: ID!, $id: ID!) {
       openCellarItem(cellarId: $cellarId, cellarItemId: $id) {
         __typename ... on Error { message }
       }
     }`,
    { cellarId: cellar, id: bottleId },
  );
  expect(opened.openCellarItem.__typename).toBe("CellarItem");
  return bottleId;
};

/** L02: a sealed bottle with the owner's own drink-by date. */
const addSealedBottle = async (
  api: Gql,
  cellar: string,
  itemId: string,
  drinkUntil: string,
) => {
  const added = await api.query(
    `mutation A($cellarId: ID!, $input: AddCellarItemInput!) {
       addItemToCellar(cellarId: $cellarId, input: $input) {
         __typename ... on CellarItem { id drinkUntil } ... on Error { message }
       }
     }`,
    {
      cellarId: cellar,
      input: {
        cellarItemId: crypto.randomUUID(),
        item: { id: itemId, type: "TEA" },
        drinkUntil,
      },
    },
  );
  expect(added.addItemToCellar.__typename, JSON.stringify(added)).toBe(
    "CellarItem",
  );
  expect(added.addItemToCellar.drinkUntil).toBe(drinkUntil);
};

/** A month from today, as `yyyy-mm-dd` and as Drink soon prints it. */
const inAMonth = (() => {
  const d = new Date(Date.now() + 30 * 86_400_000);
  const iso = d.toISOString().slice(0, 10);
  const month = d.toLocaleString("en", { month: "short", timeZone: "UTC" });
  return { iso, label: `${month} ${d.getUTCFullYear()}` };
})();

test.beforeAll(async () => {
  const api = await Gql.forAccount("primary");
  const api2 = await Gql.forAccount("secondary");
  try {
    const ref = await api.query(
      `query { referenceData(kind: TEA_CATEGORY, first: 20) {
         __typename ... on ReferenceRowConnection { edges { node { value } } }
       } }`,
    );
    const categories: string[] = ref.referenceData.edges.map(
      (edge: { node: { value: string } }) => edge.node.value,
    );
    // Any category the table knows; 800 days is past every tea's window.
    const category = categories.find((c) => c === "green") ?? categories[0];
    expect(category, "no tea categories seeded").toBeTruthy();
    if (category === undefined) return;

    cellarId = await createCellar(api, unique("E2 Home Cellar"), "PRIVATE");
    await addBottle(api, cellarId, await createTea(api, names.fresh, category));
    const stale = await addBottle(
      api,
      cellarId,
      await createTea(api, names.stale, category),
    );
    backdateOpened(stale, 800);
    await addSealedBottle(
      api,
      cellarId,
      await createTea(api, names.sealed, category),
      inAMonth.iso,
    );

    const me = (await api.query("query { me { id } }")).me.id as string;
    friendId = (await api2.query("query { me { id } }")).me.id as string;
    wereFriends = (await friendIds(api)).includes(friendId);
    await ensureFriends(api, api2, me, friendId);

    const rated = await createTea(api2, names.rated, category);
    const review = await api2.query(
      `mutation R($itemId: ID!) {
         addItemReview(itemId: $itemId, type: TEA, input: { score: 4.5 }) {
           __typename ... on Error { message }
         }
       }`,
      { itemId: rated },
    );
    expect(review.addItemReview.__typename).toBe("ItemReview");
    const list = await api2.query(
      `mutation T($input: CreateTierListInput!) {
         createTierList(input: $input) { __typename ... on TierList { id } }
       }`,
      { input: { name: secretList, privacy: "PRIVATE" } },
    );
    secretListId = list.createTierList.id;
    await api2.query(
      `mutation A($id: ID!, $input: AddTierListItemInput!) {
         addTierListItem(tierListId: $id, input: $input) { __typename }
       }`,
      {
        id: secretListId,
        input: { entry: { id: rated, type: "TEA" }, band: 4 },
      },
    );
  } finally {
    await api.dispose();
    await api2.dispose();
  }
});

test.afterAll(async () => {
  if (cellarId !== undefined) deleteCellarWithContents(cellarId);
  const api = await Gql.forAccount("primary");
  const api2 = await Gql.forAccount("secondary");
  try {
    if (secretListId !== undefined) {
      await api2.query(
        `mutation D($id: ID!) { deleteTierList(tierListId: $id) { __typename } }`,
        { id: secretListId },
      );
    }
    if (!wereFriends && friendId !== "") await ensureNotFriends(api, friendId);
  } finally {
    await api.dispose();
    await api2.dispose();
  }
});

const HOME_URL = /^https?:\/\/[^/]+\/(?:[?#].*)?$/;
const searchField = (page: Page) =>
  page.getByRole("link", { name: "Search bottles, places and recipes" });

test("/ is Home: one h1, and its search field opens the search sheet and comes back", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(HOME_URL);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const nav = await bottomNav(page);
  await expect(
    nav.getByRole("link", { name: "Search", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  await searchField(page).tap();
  await expect(page).toHaveURL(/\/search$/);
  await expect(
    page.getByRole("heading", { name: "Search", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("searchbox").first()).toBeVisible();
  // FR-2: the tab bar shows on /search, and the Close control is gone.
  await expect(page.locator('nav[data-slot="tab-bar"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Close search" })).toHaveCount(
    0,
  );

  await page.goBack();
  await expect(page).toHaveURL(HOME_URL);
  await expect(page.locator('nav[data-slot="tab-bar"]')).toBeVisible();
});

test("tapping Search again at the top opens search", async ({ page }) => {
  await page.goto("/");
  const nav = await bottomNav(page);
  await settleNetwork(page);
  await nav.getByRole("link", { name: "Search", exact: true }).tap();
  await expect(page).toHaveURL(/\/search$/);
});

test("Open: past its best leads the rail, the fresh bottle shows its level, no Pour", async ({
  page,
}) => {
  await page.goto("/");
  const tiles = page.locator('[data-slot="open-bottle"]');
  const stale = tiles.filter({ hasText: names.stale });
  const fresh = tiles.filter({ hasText: names.fresh });
  await expect(fresh).toBeVisible({ timeout: 20_000 });
  await expect(fresh).toContainText(/Open · \d+%/);
  await expect(stale).toContainText("Past its best");
  await expect(stale).toHaveAttribute("data-past", "true");
  // Past its best comes first.
  const texts = await tiles.allTextContents();
  expect(texts.findIndex((t) => t.includes(names.stale))).toBeLessThan(
    texts.findIndex((t) => t.includes(names.fresh)),
  );
  // The tile is a link to the bottle; nothing in its foot pours.
  await expect(fresh.getByRole("link", { name: names.fresh })).toBeVisible();
  await expect(fresh.getByRole("button", { name: /^Pour/ })).toHaveCount(0);
});

test("Drink soon: a sealed bottle whose own date is close, with Open and Undo (L02)", async ({
  page,
}) => {
  await page.goto("/");
  const section = page.getByRole("region", { name: "Drink soon" });
  const sealed = section
    .locator('[data-kind="drink-soon-sealed"]')
    .filter({ hasText: names.sealed });
  // Drink soon shows four rows; other runs' sealed teas may fill them.
  const more = section.getByRole("button", {
    name: /^Show \d+ more$|^Show more/,
  });
  await expect(section).toBeVisible({ timeout: 20_000 });
  if (!(await sealed.isVisible()) && (await more.count()) > 0) {
    await more.first().click();
  }
  await expect(sealed).toBeVisible({ timeout: 20_000 });
  await expect(sealed).toContainText(
    `Sealed · your date: drink by ${inAMonth.label}`,
  );
  // Sealed only: the opened teas are on the Open rail, not here.
  await expect(section).not.toContainText(names.stale);
  await expect(section).not.toContainText(names.fresh);

  const open = sealed.getByRole("button", { name: `Open ${names.sealed}` });
  const box = await open.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  await open.tap();
  await expect(sealed).toHaveCount(0);
  await expect(page.getByText(`${names.sealed} opened`)).toBeVisible();
  // Undo puts it back to sealed.
  await page.getByRole("button", { name: "Undo" }).tap();
  await expect(sealed).toBeVisible();
});

test("Friends: a friend's rating reads as a sentence; their PRIVATE list never shows", async ({
  page,
}) => {
  await page.goto("/");
  const friends = page.getByRole("region", { name: "Friends", exact: true });
  await expect(friends).toBeVisible({ timeout: 20_000 });
  const rated = friends
    .getByRole("article")
    .filter({ hasText: names.rated })
    .first();
  await expect(rated).toContainText(/rated .+ ★4\.5/);
  await expect(page.locator("body")).not.toContainText(secretList);
  // The Ranked chip keeps lists only: the rating steps out, All brings it back.
  await friends.getByRole("button", { name: "Ranked" }).tap();
  await expect(
    friends.getByRole("article").filter({ hasText: names.rated }),
  ).toHaveCount(0);
  await friends.getByRole("button", { name: "All" }).tap();
  await expect(rated).toBeVisible();
});

test("/discoveries and the /map/scans list land on Home's inbox (D1)", async ({
  page,
}) => {
  for (const retired of ["/discoveries", "/map/scans"]) {
    await page.goto(retired);
    await expect(page, `${retired} did not land Home`).toHaveURL(
      /^https?:\/\/[^/]+\/#waiting$/,
    );
    await expect(searchField(page)).toBeVisible();
  }
});
