import { createCellar, unique } from "../fixtures/data.ts";
import { deleteCellarWithContents } from "../fixtures/db.ts";
import { bodyText, expect, test, watch } from "../fixtures/test.ts";

/**
 * The restored item pages (UI parity wave 3a): the item page, the edit form
 * and the **bottle** page, asserted against the production copy at
 * `82450ad1` — "Located in:", "Reviews:", "Tea Characteristics", "Open it!",
 * "Check In", "Delete item".
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

test("the item page is the old TeaDetails", async ({ primary }) => {
  const noise = watch(primary);
  const response = await primary.goto(`/teas/${teaId}`);
  expect(response?.status()).toBeLessThan(400);

  await expect(primary.getByRole("heading", { name: teaName })).toBeVisible();
  const text = await bodyText(primary);
  for (const copy of [
    "Tea Characteristics",
    "Organic: Yes",
    "Steep Temp: 80°C",
    "Flavor Profile",
    "Toasted chestnut",
    "Located in:",
    cellarName,
    "Reviews:",
  ]) {
    expect(text, `the item page is missing "${copy}"`).toContain(copy);
  }
  // The old list (82450ad1 ItemReviews) collapses each review in an
  // Accordion, and the text is a read-only Lexical editor that only fills in
  // after hydration — so reading it out of `bodyText` straight after the
  // heading raced the editor (it passed or failed by load). Open the review
  // the way a person would, then wait for the text.
  await primary.locator(".MuiAccordionSummary-button").first().click();
  await expect(primary.getByText("E2 lovely")).toBeVisible();
  // One review per viewer: the form opens on the viewer's own review.
  await expect(primary.getByPlaceholder("Edit your Review...")).toBeVisible();
  await expect(primary.getByRole("button", { name: "Share" })).toBeVisible();
  expect(noise.pageErrors).toEqual([]);
});

test("the edit form saves an attribute and returns to the item", async ({
  primary,
}) => {
  await primary.goto(`/teas/${teaId}`);
  await primary.getByRole("link", { name: "Edit item" }).click();
  await expect(primary).toHaveURL(new RegExp(`/teas/${teaId}/edit$`));

  const temperature = primary.getByLabel("Steeping Temperature");
  await expect(temperature).toHaveValue("80°C");
  await temperature.fill("85°C");
  await primary.getByRole("button", { name: "Save" }).click();

  await expect(primary).toHaveURL(new RegExp(`/teas/${teaId}$`), {
    timeout: 20_000,
  });
  await expect(primary.getByText("Steep Temp: 85°C")).toBeVisible({
    timeout: 20_000,
  });
});

test("an item id at the cellar URL redirects to its one bottle (decision 1)", async ({
  primary,
}) => {
  await primary.goto(`/cellars/${cellarId}/teas/${teaId}`);
  await expect(primary).toHaveURL(
    new RegExp(`/cellars/${cellarId}/teas/${bottleId}$`),
  );
});

test("the bottle page: open it, check in, delete it", async ({ primary }) => {
  const noise = watch(primary);
  await primary.goto(`/cellars/${cellarId}/teas/${bottleId}`);
  await expect(primary.getByRole("heading", { name: teaName })).toBeVisible();
  // No "Located in:" on a bottle page (the old layout).
  expect(await bodyText(primary)).not.toContain("Located in:");

  await primary.getByRole("button", { name: "Open it!" }).click();
  await expect(primary.getByText("Remaining: 100%")).toBeVisible({
    timeout: 20_000,
  });

  await primary.getByRole("button", { name: "Check In", exact: true }).click();
  // The day row the check-in list adds (reviews carry a <time> too).
  await expect(primary.locator(".MuiListItem-root time").first()).toBeVisible({
    timeout: 20_000,
  });

  await primary.getByRole("button", { name: "Delete item" }).click();
  await primary.getByRole("button", { name: "Delete Tea" }).click();
  await expect(primary).toHaveURL(new RegExp(`/cellars/${cellarId}/items$`), {
    timeout: 20_000,
  });
  expect(noise.pageErrors).toEqual([]);
});
