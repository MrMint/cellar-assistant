import { ensureFriends } from "../../fixtures/data.ts";
import { deleteTeas } from "../../fixtures/db.ts";
import { expect, test } from "../../fixtures/mobile.ts";
import { ACCOUNTS, Gql } from "../../fixtures/test.ts";

/**
 * L03 at 390x844 — taste profile and friend agreement. The two seeded
 * accounts are made friends, and both rate the same five new teas (the
 * agreement gate is 5 shared items), four of them within half a star:
 *
 *  1. Me → **Taste profile** → the page's heading, and under "With friends"
 *     the secondary account's row reads as a count ("You agree on X of Y
 *     shared …"), never a percentage.
 *  2. **Compare** on that row lands on their profile's Compare section,
 *     which says the same count.
 *
 * The exact numbers depend on what else the two accounts have rated, so the
 * spec asserts the shape of the line, not its figures. Creates five teas
 * and ten reviews, and deletes all of them afterwards (L10): the reviews
 * through the API, then the teas with `deleteTeas`, since the API has no
 * item delete. No places, no lists.
 */
test.describe.configure({ mode: "serial" });

const TOKEN = `ts${Date.now().toString(36)}`;
const PRIMARY_SCORES = [4, 4, 3, 5, 2];
const SECONDARY_SCORES = [4, 4.5, 3, 5, 4.5];

type Review = { account: "primary" | "secondary"; itemId: string; id: string };
const reviews: Review[] = [];
/** Every tea this run created, recorded before anything else can fail. */
const teaIds: string[] = [];

async function createTea(api: Gql, category: string, name: string) {
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
  if (created.createItem.__typename !== "MutationCreateItemSuccess") {
    throw new Error(`createItem: ${JSON.stringify(created.createItem)}`);
  }
  return created.createItem.data.id as string;
}

async function review(api: Gql, itemId: string, score: number) {
  const data = await api.query(
    `mutation R($itemId: ID!, $score: Float!) {
       addItemReview(itemId: $itemId, type: TEA, input: { score: $score }) {
         __typename ... on ItemReview { id } ... on Error { message }
       }
     }`,
    { itemId, score },
  );
  if (data.addItemReview.__typename !== "ItemReview") {
    throw new Error(`addItemReview: ${JSON.stringify(data.addItemReview)}`);
  }
  return data.addItemReview.id as string;
}

test.beforeAll(async () => {
  const api = await Gql.forAccount("primary");
  const api2 = await Gql.forAccount("secondary");
  try {
    await ensureFriends(api, api2, ACCOUNTS.primary.id, ACCOUNTS.secondary.id);
    const ref = await api.query(
      `query { referenceData(kind: TEA_CATEGORY, first: 1) {
         __typename ... on ReferenceRowConnection { edges { node { value } } }
       } }`,
    );
    const category = ref.referenceData.edges[0]?.node.value;
    if (!category) throw new Error("no tea categories seeded");

    for (const [i, score] of PRIMARY_SCORES.entries()) {
      const itemId = await createTea(api, category, `${TOKEN} shared ${i}`);
      teaIds.push(itemId);
      reviews.push({
        account: "primary",
        itemId,
        id: await review(api, itemId, score),
      });
      reviews.push({
        account: "secondary",
        itemId,
        id: await review(api2, itemId, SECONDARY_SCORES[i] ?? score),
      });
    }
  } finally {
    await api.dispose();
    await api2.dispose();
  }
});

test.afterAll(async () => {
  const api = await Gql.forAccount("primary");
  const api2 = await Gql.forAccount("secondary");
  try {
    for (const r of reviews) {
      await (r.account === "primary" ? api : api2).query(
        `mutation D($itemId: ID!, $reviewId: ID!) {
           deleteItemReview(itemId: $itemId, reviewId: $reviewId, type: TEA) { __typename }
         }`,
        { itemId: r.itemId, reviewId: r.id },
      );
    }
  } finally {
    await api.dispose();
    await api2.dispose();
    // The teas go too (CR-10), with anything still hanging off them.
    if (teaIds.length > 0) deleteTeas(teaIds.splice(0));
  }
});

const COUNT_LINE = /^You agree on \d+ of \d+$/;

test("Me → taste profile → friend agreement, as a count", async ({ page }) => {
  await page.goto("/me");
  await page.getByRole("link", { name: /Taste profile/ }).tap();
  await expect(page).toHaveURL(/\/taste-profile$/);
  await expect(
    page.getByRole("heading", { name: "Taste profile" }),
  ).toBeVisible();

  // "Agree with friends": their row is the link, by its href, since the
  // viewer may have other friends too. The row says "a of n", as a count.
  await expect(
    page.getByRole("heading", { name: "Agree with friends" }),
  ).toBeVisible({ timeout: 15_000 });
  const compare = page.locator(
    `a[href="/users/${ACCOUNTS.secondary.id}#compare"]`,
  );
  await expect(compare).toBeVisible({ timeout: 15_000 });
  await expect(compare).toHaveAccessibleName(/you agree on \d+ of \d+$/);
  const line = compare.getByText(/^\d+ of \d+$/);
  await expect(line).toBeVisible();
  await expect(compare).not.toContainText("%");

  await compare.tap();
  await expect(page).toHaveURL(
    new RegExp(`/users/${ACCOUNTS.secondary.id}#compare$`),
  );
  const section = page.locator('[data-slot="taste-compare"]');
  await expect(section).toBeVisible({ timeout: 15_000 });
  await expect(section.getByText(COUNT_LINE)).toBeVisible();
});
