import { ACCOUNTS } from "../../fixtures/accounts.ts";
import { ensureFriends, unique } from "../../fixtures/data.ts";
import { edgesOf, expect, test } from "../../fixtures/mobile.ts";
import { Gql, visibleOnly } from "../../fixtures/test.ts";

/**
 * X18 · the Me hub and a friend's profile, at 390×844 with a thumb.
 *
 * - Me: the number tiles, Lists, People and the Settings row — every tile and
 *   row inside the screen, no sideways scroll; Edit profile and Sign out are
 *   on Settings, one tap away.
 * - Loved has a Recipes half, and the segment is the URL.
 * - Friends → a friend's row → their profile: their FRIENDS tier list and the
 *   drink they logged are there; their PRIVATE list is not.
 * - A profile that is not a friend's, and one that names nobody, say the same
 *   "doesn't exist or isn't shared with you" (D24); your own id is `/me`.
 *
 * Creates two tier lists and one catalog item as `test2@test.com`, and one
 * log; one PRIVATE tier list as `test@test.com`, so the count row has
 * something to draw however the suite is run; deletes the lists and the log
 * afterwards. No places.
 */
test.describe.configure({ mode: "serial" });

let api: Gql;
let api2: Gql;
const lists: string[] = [];
let ownList: string | null = null;
const ownName = unique("E2 Me Count");
let logId: string | null = null;
const sharedName = unique("E2 Profile Shared");
const privateName = unique("E2 Profile Private");
const teaName = unique("E2 Profile Tea");

test.beforeAll(async () => {
  api = await Gql.forAccount("primary");
  api2 = await Gql.forAccount("secondary");
  await ensureFriends(api, api2, ACCOUNTS.primary.id, ACCOUNTS.secondary.id);

  for (const [name, privacy] of [
    [sharedName, "FRIENDS"],
    [privateName, "PRIVATE"],
  ] as const) {
    const data = await api2.query(
      `mutation T($input: CreateTierListInput!) {
         createTierList(input: $input) {
           __typename ... on TierList { id } ... on Error { message }
         }
       }`,
      { input: { name, privacy, listType: "item" } },
    );
    expect(data.createTierList.__typename, JSON.stringify(data)).toBe(
      "TierList",
    );
    lists.push(data.createTierList.id);
  }

  const own = await api.query(
    `mutation T($input: CreateTierListInput!) {
       createTierList(input: $input) {
         __typename ... on TierList { id } ... on Error { message }
       }
     }`,
    { input: { name: ownName, privacy: "PRIVATE", listType: "item" } },
  );
  expect(own.createTierList.__typename, JSON.stringify(own)).toBe("TierList");
  ownList = own.createTierList.id;

  const ref = await api2.query(
    `query { referenceData(kind: TEA_CATEGORY, first: 1) {
       __typename ... on ReferenceRowConnection { edges { node { value } } }
     } }`,
  );
  const category = ref.referenceData.edges[0]?.node.value;
  expect(category, "no tea categories seeded").toBeTruthy();
  const created = await api2.query(
    `mutation C($input: CreateItemInput!, $id: ID) {
       createItem(type: TEA, itemId: $id, input: $input) {
         __typename
         ... on MutationCreateItemSuccess { data { id } }
         ... on Error { message }
       }
     }`,
    {
      id: crypto.randomUUID(),
      input: { name: teaName, description: "An e2e tea.", tea: { category } },
    },
  );
  expect(created.createItem.__typename, JSON.stringify(created)).toBe(
    "MutationCreateItemSuccess",
  );
  const id = crypto.randomUUID();
  const logged = await api2.query(
    `mutation L($id: ID!, $input: LogDrinkInput!) {
       logDrink(id: $id, input: $input) {
         __typename ... on Error { message }
       }
     }`,
    {
      id,
      input: {
        item: { type: "TEA", id: created.createItem.data.id },
        score: 4,
        note: "Bright and grassy",
      },
    },
  );
  expect(logged.logDrink.__typename, JSON.stringify(logged)).toBe(
    "LoggedDrinkPayload",
  );
  logId = id;
});

test.afterAll(async () => {
  for (const id of lists.splice(0)) {
    await api2.query(
      `mutation D($id: ID!) { deleteTierList(tierListId: $id) { __typename } }`,
      { id },
    );
  }
  if (ownList !== null) {
    await api.query(
      `mutation D($id: ID!) { deleteTierList(tierListId: $id) { __typename } }`,
      { id: ownList },
    );
  }
  if (logId !== null) {
    await api2.query(
      `mutation D($id: ID!) { deleteDrinkLog(id: $id) { __typename } }`,
      { id: logId },
    );
  }
  await api.dispose();
  await api2.dispose();
});

const noSidewaysScroll = async (page: import("@playwright/test").Page) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
};

test("Me: numbers, Lists, People and Settings fit the phone", async ({
  page,
  noise,
}) => {
  await page.goto("/me");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // The account has at least the tier list made above, so the number tiles
  // are drawn; each tile names its noun.
  // F-24: a streamed segment's hidden twin can match too, for a moment.
  const row = visibleOnly(page.locator('[data-slot="me-counts"]')).first();
  await expect(row).toBeVisible();
  const viewport = page.viewportSize();
  const edges = await edgesOf(row);
  expect(edges.left).toBeGreaterThanOrEqual(0);
  expect(edges.right).toBeLessThanOrEqual(viewport?.width ?? 390);
  await expect(row).toContainText(/tier lists?/i);

  await expect(page.getByRole("heading", { name: "Lists" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Loved/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
  await noSidewaysScroll(page);

  // The last row and the gear both open Settings, which holds Edit profile
  // and Sign out.
  await page.getByRole("link", { name: "Settings" }).last().click();
  await expect(page).toHaveURL(/\/me\/settings$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Settings" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Edit profile/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await noSidewaysScroll(page);
  expect(noise.pageErrors).toEqual([]);
});

test("Loved has a Recipes half, and the segment is the URL", async ({
  page,
  noise,
}) => {
  await page.goto("/me");
  await page.getByRole("link", { name: /^Loved/ }).click();
  await expect(page).toHaveURL(/\/favorites$/);
  const show = page.getByRole("radiogroup", { name: "Show" });
  await show.getByRole("radio", { name: "Recipes" }).click();
  await expect(page).toHaveURL(/\/favorites\?kind=recipes$/);
  await expect(show.getByRole("radio", { name: "Recipes" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  // Either loved recipes or the one empty state — never an error.
  await expect(
    page
      .locator("[data-loved-recipe]")
      .first()
      .or(page.getByText("No recipes loved yet.")),
  ).toBeVisible();
  await noSidewaysScroll(page);
  expect(noise.pageErrors).toEqual([]);
});

test("Friends → a friend's profile shows what they share, and not what they keep", async ({
  page,
  noise,
}) => {
  await page.goto("/friends");
  const friend = page
    .locator('[data-slot="friend-profile-link"]')
    .filter({ hasText: ACCOUNTS.secondary.displayName });
  await expect(friend.first()).toBeVisible();
  await friend.first().click();
  await expect(page).toHaveURL(new RegExp(`/users/${ACCOUNTS.secondary.id}$`));
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: ACCOUNTS.secondary.displayName,
    }),
  ).toBeVisible();
  await expect(page.getByText(/^Friends since /)).toBeVisible();

  await expect(page.getByRole("link", { name: sharedName })).toBeVisible();
  await expect(page.getByRole("link", { name: privateName })).toHaveCount(0);
  const log = page.locator('[data-section="logs"]');
  await expect(log.getByRole("link", { name: teaName })).toBeVisible();
  await expect(log.getByText("Bright and grassy")).toBeVisible();

  await noSidewaysScroll(page);
  expect(noise.pageErrors).toEqual([]);
});

test("a stranger's or nobody's profile is the one not-found; your own is Me", async ({
  page,
}) => {
  await page.goto("/users/00000000-0000-4000-8000-000000000000");
  await expect(
    page.getByText("It's gone, or it isn't shared with you."),
  ).toBeVisible();
  await page.goto("/users/not-an-id");
  await expect(
    page.getByText("It's gone, or it isn't shared with you."),
  ).toBeVisible();

  await page.goto(`/users/${ACCOUNTS.primary.id}`);
  await expect(page).toHaveURL(/\/me$/);
});
