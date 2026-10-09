import type { Page } from "@playwright/test";
import { createCellar, unique } from "../fixtures/data.ts";
import { deleteCellarWithContents } from "../fixtures/db.ts";
import { bodyText, expect, test, watch } from "../fixtures/test.ts";

/**
 * X09's one item page: the item URL, the edit form, and the **bottle** URL —
 * which is the same page with that bottle selected ("Your bottles" marks it
 * and carries its level; Pour, X03's, is the ActionBar's primary there;
 * Delete bottle is in `⋯`).
 *
 * A tea, because sake and tea are the two types `createItem` can write
 * without the onboarding flow (`item_onboarding_id NOT NULL` on the other
 * four), so the fixture is one mutation rather than the whole wizard (04 owns
 * that). Items have no delete, so the tea outlives the run; the cellar and its
 * bottle do not.
 */
test.describe.configure({ mode: "serial" });

let cellarId: string;
let cellarName: string;
let teaId: string;
let teaName: string;
let bottleId: string;

test.afterAll(() => {
  if (cellarId !== undefined) deleteCellarWithContents(cellarId);
});

test("fixtures: a cellar, a tea with attributes, a bottle of it", async ({
  api,
}) => {
  cellarName = unique("E2 Items");
  cellarId = await createCellar(api, cellarName, "PRIVATE");

  const ref = await api.query(
    `query { referenceData(kind: TEA_CATEGORY, first: 1) {
       __typename ... on ReferenceRowConnection { edges { node { value } } }
     } }`,
  );
  const category = ref.referenceData.edges[0]?.node.value;
  expect(category, "no tea categories seeded").toBeTruthy();

  teaName = unique("E2 Tea");
  const created = await api.query(
    `mutation C($input: CreateItemInput!, $id: ID) {
       createItem(type: TEA, itemId: $id, input: $input) {
         __typename
         ... on MutationCreateItemSuccess { data { id } }
         ... on Error { message }
       }
     }`,
    {
      id: crypto.randomUUID(),
      input: {
        name: teaName,
        description: "An e2e tea.",
        tea: {
          category,
          isOrganic: true,
          flavorProfile: "Toasted chestnut",
          steepingTemperature: "80°C",
        },
      },
    },
  );
  expect(
    created.createItem.__typename,
    JSON.stringify(created.createItem),
  ).toBe("MutationCreateItemSuccess");
  teaId = created.createItem.data.id;

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
        item: { id: teaId, type: "TEA" },
      },
    },
  );
  expect(added.addItemToCellar.__typename).toBe("CellarItem");
  bottleId = added.addItemToCellar.id;

  const review = await api.query(
    `mutation R($itemId: ID!) {
       addItemReview(itemId: $itemId, type: TEA, input: { score: 4.5, text: { body: "E2 lovely" } }) {
         __typename ... on Error { message }
       }
     }`,
    { itemId: teaId },
  );
  expect(review.addItemReview.__typename).toBe("ItemReview");
});

test("the item page: hero, taste header, fact sheet, Your bottles, ActionBar", async ({
  primary,
}) => {
  const noise = watch(primary);
  const response = await primary.goto(`/teas/${teaId}`);
  expect(response?.status()).toBeLessThan(400);

  await expect(primary.getByRole("heading", { name: teaName })).toBeVisible();

  // You · Friends · Everyone: the viewer's own review is the "You" score.
  const ratings = primary.getByRole("navigation", { name: "Ratings" });
  await expect(
    ratings.getByRole("link", { name: /^You: rated 4\.5 out of 5/ }),
  ).toBeVisible();
  await expect(
    ratings.getByRole("link", { name: /^Everyone: rated .* \d+ ratings?$/ }),
  ).toBeVisible();

  // The fact sheet, for every type now: labelled rows.
  const facts = primary.getByTestId("item-facts");
  await expect(facts.getByText("Organic", { exact: true })).toBeVisible();
  await expect(facts.getByText("80°C", { exact: true })).toBeVisible();
  await expect(facts.getByText("Toasted chestnut")).toBeVisible();

  // The bottle is the viewer's, still in the cellar: one row, Pour and Log.
  const bottles = primary.locator("section", {
    has: primary.getByRole("heading", { name: "Your bottles" }),
  });
  await expect(bottles.getByRole("link", { name: cellarName })).toBeVisible();
  await expect(bottles.getByText("Sealed")).toBeVisible();
  await expect(
    bottles.getByRole("button", { name: `Pour from ${cellarName}` }),
  ).toBeVisible();

  // Section titles are overlines (CSS uppercase, which `innerText` applies),
  // so they are found by their headings' accessible names, not body text.
  for (const title of ["Located in", "Reviews", "Tea house"]) {
    await expect(
      primary.getByRole("heading", { name: title, exact: true }),
      `the item page is missing "${title}"`,
    ).toBeVisible();
  }
  expect(await bodyText(primary)).toContain(cellarName);
  // The review list collapses each review in an Accordion, and the text is a
  // read-only Lexical editor that only fills in after hydration — open the
  // review the way a person would, then wait for the text.
  await primary
    .getByRole("button", { expanded: false })
    .filter({ has: primary.locator("time") })
    .first()
    .click();
  await expect(primary.getByText("E2 lovely")).toBeVisible();
  // One review per viewer: the form opens on the viewer's own review.
  await expect(primary.getByPlaceholder("Edit your Review...")).toBeVisible();

  const bar = primary.getByRole("toolbar", { name: "Item actions" });
  await expect(bar.getByRole("button", { name: "Log a drink" })).toBeVisible();
  await expect(
    bar.getByRole("button", { name: "Add to cellar" }),
  ).toBeVisible();
  await expect(
    bar.getByRole("button", { name: `Want to try ${teaName}` }),
  ).toBeVisible();
  await expect(bar.getByRole("button", { name: "More actions" })).toBeVisible();
  await expect(primary.getByRole("button", { name: "Share" })).toBeVisible();
  expect(noise.pageErrors).toEqual([]);
});

/**
 * Edit, Share, Add to tier list and Delete bottle live behind the
 * ActionBar's ⋯ (X09): a sheet of buttons.
 */
async function overflowAction(page: Page, name: string) {
  await page
    .getByRole("toolbar", { name: "Item actions" })
    .getByRole("button", { name: "More actions" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name, exact: true })
    .click();
}

test("the edit form saves an attribute and returns to the item", async ({
  primary,
}) => {
  await primary.goto(`/teas/${teaId}`);
  await overflowAction(primary, "Edit item");
  await expect(primary).toHaveURL(new RegExp(`/teas/${teaId}/edit$`));

  const temperature = primary.getByLabel("Steeping Temperature");
  await expect(temperature).toHaveValue("80°C");
  await temperature.fill("85°C");
  await primary.getByRole("button", { name: "Save" }).click();

  await expect(primary).toHaveURL(new RegExp(`/teas/${teaId}$`), {
    timeout: 20_000,
  });
  await expect(
    primary.getByTestId("item-facts").getByText("85°C", { exact: true }),
  ).toBeVisible({ timeout: 20_000 });
});

test("an item id at the cellar URL redirects to its one bottle (decision 1)", async ({
  primary,
}) => {
  await primary.goto(`/cellars/${cellarId}/teas/${teaId}`);
  await expect(primary).toHaveURL(
    new RegExp(`/cellars/${cellarId}/teas/${bottleId}$`),
  );
});

test("the bottle URL is the item page with that bottle selected: pour it (which opens it), log from it, delete it", async ({
  primary,
}) => {
  const noise = watch(primary);
  await primary.goto(`/cellars/${cellarId}/teas/${bottleId}`);
  await expect(primary.getByRole("heading", { name: teaName })).toBeVisible();
  // The same page: the taste header and "Located in" are here too now.
  await expect(
    primary.getByRole("navigation", { name: "Ratings" }),
  ).toBeVisible();
  await expect(
    primary.getByRole("heading", { name: "Located in", exact: true }),
  ).toBeVisible();
  await expect(primary.getByTestId("selected-bottle")).toContainText(
    cellarName,
  );
  const bottles = primary.locator("section", {
    has: primary.getByRole("heading", { name: "Your bottles" }),
  });
  // The selected bottle is marked.
  await expect(bottles.locator('[aria-current="page"]')).toHaveText(cellarName);

  // X03: on a bottle of yours, Pour is the ActionBar's primary — there
  // before the bottle is opened, since the first pour opens it.
  const bar = primary.getByRole("toolbar", { name: "Item actions" });
  await bar.getByRole("button", { name: "Pour", exact: true }).click();
  const sheet = primary.getByRole("dialog", { name: "Pour" });
  await sheet.getByRole("button", { name: /^Cup/ }).click();
  await sheet.getByRole("button", { name: "Pour 3 g" }).click();
  await expect(primary.getByText("Remaining: 97%")).toBeVisible({
    timeout: 20_000,
  });

  // A plain log from the selected bottle is its row's Log.
  await bottles
    .getByRole("button", { name: `Log a drink from ${cellarName}` })
    .click();
  await primary
    .getByRole("dialog", { name: "Log a drink" })
    .getByRole("button", { name: "Log it" })
    .click();
  const log = primary.locator("section", {
    has: primary.getByRole("heading", { name: "Your log" }),
  });
  await expect(
    log.locator('[data-slot="drink-log-entry"]').first(),
  ).toBeVisible({ timeout: 20_000 });

  await overflowAction(primary, "Delete bottle");
  await primary.getByRole("button", { name: "Delete Tea" }).click();
  await expect(primary).toHaveURL(new RegExp(`/cellars/${cellarId}/items$`), {
    timeout: 20_000,
  });
  expect(noise.pageErrors).toEqual([]);
});

test("the log outlives the bottle: the item page still lists it", async ({
  primary,
}) => {
  await primary.goto(`/teas/${teaId}`);
  const log = primary.locator("section", {
    has: primary.getByRole("heading", { name: "Your log" }),
  });
  await expect(
    log.locator('[data-slot="drink-log-entry"]').first(),
  ).toBeVisible({ timeout: 20_000 });
  // …and the bottle is gone from Your bottles (the section is not drawn).
  await expect(
    primary.getByRole("heading", { name: "Your bottles" }),
  ).toHaveCount(0);
});
