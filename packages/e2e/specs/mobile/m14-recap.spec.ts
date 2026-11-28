import { ACCOUNTS } from "../../fixtures/accounts.ts";
import { unique } from "../../fixtures/data.ts";
import { deleteTeas } from "../../fixtures/db.ts";
import { expect, test } from "../../fixtures/mobile.ts";
import { Gql } from "../../fixtures/test.ts";

/**
 * L04 · the recap deck, at 390×844 with a thumb.
 *
 * Me → "Your <month> recap" → the deck → tap to the next card → Share →
 * the share sheet ("Image only · no link") → Save image: a PNG named for the
 * period and card, with nothing public involved (L16). The browser here is
 * told it cannot share files, so Share image would download too.
 *
 * Creates three teas in three tea categories as `test@test.com` and logs each
 * once this month, so the deck has at least "New to you" and a styles card
 * whatever else the account holds; deletes the logs and the teas afterwards.
 */
test.describe.configure({ mode: "serial" });

let api: Gql;
const logIds: string[] = [];
const teaIds: string[] = [];

test.beforeAll(async () => {
  api = await Gql.forAccount("primary");
  const ref = await api.query(
    `query { referenceData(kind: TEA_CATEGORY, first: 3) {
       __typename ... on ReferenceRowConnection { edges { node { value } } }
     } }`,
  );
  const categories: string[] = ref.referenceData.edges.map(
    (edge: { node: { value: string } }) => edge.node.value,
  );
  expect(categories.length, "need three tea categories seeded").toBe(3);

  for (const category of categories) {
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
          name: unique("E2 Recap Tea"),
          description: "An e2e tea for the recap.",
          tea: { category },
        },
      },
    );
    expect(created.createItem.__typename, JSON.stringify(created)).toBe(
      "MutationCreateItemSuccess",
    );
    const teaId: string = created.createItem.data.id;
    teaIds.push(teaId);
    const id = crypto.randomUUID();
    const logged = await api.query(
      `mutation L($id: ID!, $input: LogDrinkInput!) {
         logDrink(id: $id, input: $input) {
           __typename ... on Error { message }
         }
       }`,
      { id, input: { item: { type: "TEA", id: teaId } } },
    );
    expect(logged.logDrink.__typename, JSON.stringify(logged)).toBe(
      "LoggedDrinkPayload",
    );
    logIds.push(id);
  }
});

test.afterAll(async () => {
  for (const id of logIds.splice(0)) {
    await api.query(
      `mutation D($id: ID!) { deleteDrinkLog(id: $id) { __typename } }`,
      { id },
    );
  }
  if (teaIds.length > 0) deleteTeas(teaIds.splice(0));
  await api.dispose();
});

test("Me → recap → next card → share falls back to download", async ({
  page,
}) => {
  // No file sharing in this browser: the share must become a download.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
  });

  await page.goto("/me");
  const entry = page.getByRole("link", { name: /recap$/ });
  await expect(entry).toBeVisible();
  await entry.click();
  // The latest recap opens; picking another writes `?period=`.
  await expect(page).toHaveURL(/\/recap(\?period=[\d-]+)?$/);

  const deck = page.locator('[data-slot="recap-deck"]');
  await expect(deck).toBeVisible();
  const overline = deck.locator('[data-slot="recap-overline"]');
  await expect(overline).toHaveText("New to you");

  const next = page.getByRole("button", { name: "Next card" });
  const box = await next.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  await next.click();
  await expect(overline).not.toHaveText("New to you");

  await page.getByRole("button", { name: "Share", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Share" });
  await expect(sheet.getByText("Image only · no link")).toBeVisible();
  const save = sheet.getByRole("button", { name: "Save image" });
  // Enabled once the preview image has loaded.
  await expect(save).toBeEnabled({ timeout: 15_000 });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    save.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    /^cellar-recap-\d{4}-\d{2}-2\.png$/,
  );
  await expect(page.getByText("Image saved")).toBeVisible();

  // Close goes back to Me.
  // A button now: Close goes back (history), not a push of /me (CR-6).
  await page.getByRole("button", { name: "Close recap" }).click();
  await expect(page).toHaveURL(/\/me$/);
});

test("the share image answers another user and a missing period alike", async ({
  page,
  browser,
}) => {
  const period = new Date().toISOString().slice(0, 7);
  // Signed in as the primary account: someone else's recap, and your own
  // with no valid period, are the same private 404.
  const other = await page.request.get(
    `/api/recap/${ACCOUNTS.secondary.id}/${period}/0`,
  );
  const missing = await page.request.get(
    `/api/recap/${ACCOUNTS.primary.id}/not-a-period/0`,
  );
  for (const response of [other, missing]) {
    expect(response.status()).toBe(404);
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
  expect(await other.text()).toBe(await missing.text());

  // Signed out, the request never yields an image: the app's proxy sends it
  // to sign-in before the route runs, the same for any owner or period.
  // The test runner applies the project's storageState to
  // `browser.newContext()` too (runBeforeCreateBrowserContext), so without an
  // explicit empty state this "anonymous" context is the signed-in owner and
  // rightly gets their PNG (E-8).
  const anonymous = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const answers = [];
  for (const path of [
    `/api/recap/${ACCOUNTS.primary.id}/${period}/0`,
    `/api/recap/${ACCOUNTS.primary.id}/not-a-period/0`,
  ]) {
    const response = await anonymous.request.get(path, { maxRedirects: 0 });
    expect(response.headers()["content-type"] ?? "").not.toContain("image");
    answers.push(response.status());
  }
  expect(answers[0]).toBe(answers[1]);
  await anonymous.close();
});
