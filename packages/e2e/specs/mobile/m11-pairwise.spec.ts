import { eventually, unique } from "../../fixtures/data.ts";
import { deleteTeas } from "../../fixtures/db.ts";
import { expect, test } from "../../fixtures/mobile.ts";
import { Gql } from "../../fixtures/test.ts";

/**
 * L09 at 390x844 — pairwise placement. A tea list with four teas in Very
 * Good, and a fifth tea you rated 4 (Very Good) that is not on it yet:
 *
 *  1. Add entry → tick the fifth → **Compare to place it** → "Which do you
 *     like more?" answered with the new one each time. It lands at the top
 *     of Very Good in at most log2(4) + 1 = 3 taps, read back through the
 *     API at band 4, position 0, with the four below it.
 *  2. Undo on the result takes it back: the API shows the four alone, in
 *     their old order, and the questions start again.
 *
 * Creates five teas, one review and one tier list; deletes the review and
 * the list afterwards (the API has no item delete — other specs leave their
 * teas too). No places.
 */
test.describe.configure({ mode: "serial" });

const TOKEN = `pw${Date.now().toString(36)}`;
let listId = "";
let reviewId = "";
let ranked: string[] = [];
let newcomerId = "";
let newcomerName = "";

type Entry = { band: number; position: number; itemId: string | null };

async function entries(api: Gql, id: string): Promise<Entry[]> {
  const data = await api.query(
    `query T($id: ID!) { tierList(id: $id) { __typename
       ... on TierList { items(first: 100) { edges { node {
         band position item { id } } } } } } }`,
    { id },
  );
  if (data.tierList.__typename !== "TierList") return [];
  return data.tierList.items.edges
    .map((e: any) => ({
      band: e.node.band,
      position: e.node.position,
      itemId: e.node.item?.id ?? null,
    }))
    .sort((a: Entry, b: Entry) => b.band - a.band || a.position - b.position);
}

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

test.beforeAll(async () => {
  const api = await Gql.forAccount("primary");
  try {
    const ref = await api.query(
      `query { referenceData(kind: TEA_CATEGORY, first: 1) {
         __typename ... on ReferenceRowConnection { edges { node { value } } }
       } }`,
    );
    const category = ref.referenceData.edges[0]?.node.value;
    if (!category) throw new Error("no tea categories seeded");

    ranked = [];
    for (const letter of ["a", "b", "c", "d"]) {
      ranked.push(await createTea(api, category, `${TOKEN} ranked ${letter}`));
    }
    newcomerName = `${TOKEN} newcomer`;
    newcomerId = await createTea(api, category, newcomerName);

    const list = await api.query(
      `mutation C($input: CreateTierListInput!) {
         createTierList(input: $input) { __typename ... on TierList { id } ... on Error { message } }
       }`,
      {
        input: {
          name: unique("E2 Mobile Pairwise"),
          privacy: "PRIVATE",
          listType: "tea",
        },
      },
    );
    if (list.createTierList.__typename !== "TierList") {
      throw new Error(`createTierList: ${list.createTierList.message}`);
    }
    listId = list.createTierList.id;

    const added = await api.query(
      `mutation A($id: ID!, $input: AddTierListItemsInput!) {
         addTierListItems(tierListId: $id, input: $input) { __typename ... on Error { message } }
       }`,
      {
        id: listId,
        input: {
          entries: ranked.map((id) => ({
            entry: { id, type: "TEA" },
            band: 4,
            tierListItemId: crypto.randomUUID(),
          })),
        },
      },
    );
    if (added.addTierListItems.__typename === "Error") {
      throw new Error(`addTierListItems: ${added.addTierListItems.message}`);
    }

    const review = await api.query(
      `mutation R($itemId: ID!) {
         addItemReview(itemId: $itemId, type: TEA, input: { score: 4 }) {
           __typename ... on ItemReview { id } ... on Error { message }
         }
       }`,
      { itemId: newcomerId },
    );
    if (review.addItemReview.__typename !== "ItemReview") {
      throw new Error(`addItemReview: ${JSON.stringify(review.addItemReview)}`);
    }
    reviewId = review.addItemReview.id;
  } finally {
    await api.dispose();
  }
});

test.afterAll(async () => {
  const api = await Gql.forAccount("primary");
  try {
    if (reviewId !== "") {
      await api.query(
        `mutation D($itemId: ID!, $reviewId: ID!) {
           deleteItemReview(itemId: $itemId, reviewId: $reviewId, type: TEA) { __typename }
         }`,
        { itemId: newcomerId, reviewId },
      );
    }
    if (listId !== "") {
      await api.query(
        `mutation D($id: ID!) { deleteTierList(tierListId: $id) { __typename } }`,
        { id: listId },
      );
    }
  } finally {
    await api.dispose();
    // The five teas this run created (CR-10, L10: a run cleans up what it
    // creates), after the list and review that point at them.
    deleteTeas([...ranked, newcomerId].filter((id) => id !== ""));
  }
});

test("places an entry in at most log2(n)+1 taps, then Undo removes it", async ({
  page,
}) => {
  const api = await Gql.forAccount("primary");
  try {
    await page.goto(`/tier-lists/${listId}`);
    await page.getByRole("button", { name: "Edit order", exact: true }).tap();
    await page.getByRole("button", { name: "Add entry", exact: true }).tap();
    const sheet = page.getByRole("dialog", { name: /^Add an? / });
    await expect(sheet).toBeVisible();

    // The rated tea is in "Tasted, not ranked"; open the section if it is
    // past the first few rows.
    const row = sheet
      .getByRole("checkbox")
      .filter({ hasText: new RegExp(`${TOKEN} newcomer`, "i") });
    const more = sheet.getByRole("button", { name: /^Show \d+ more$/ });
    await expect(sheet.getByRole("checkbox").first()).toBeVisible({
      timeout: 20_000,
    });
    if (!(await row.isVisible()) && (await more.count()) > 0) {
      for (const button of await more.all()) await button.tap();
    }
    await expect(row, "the rated tea is not offered").toBeVisible();
    await expect(row).toContainText("Very Good");
    await row.tap();
    await sheet
      .getByRole("button", { name: "Add 1 entry", exact: true })
      .tap();

    const placing = page.getByRole("dialog", { name: /^Place / });
    await expect(
      placing.getByRole("heading", { name: "Which do you like more?" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      placing.getByRole("button", {
        name: "Skip, put it at the end of Very Good",
      }),
    ).toBeVisible();

    // Prefer the new one every time: it belongs at the very top.
    const n = ranked.length;
    const budget = Math.log2(n) + 1;
    const fresh = placing.getByRole("button", { name: /, the new one$/ });
    const result = placing.getByRole("heading", { name: /goes in Very Good$/ });
    let taps = 0;
    while (!(await result.isVisible())) {
      expect(taps, "more taps than log2(n)+1").toBeLessThan(budget);
      await fresh.tap();
      taps += 1;
      await expect(fresh.or(result)).toBeVisible();
    }
    expect(taps).toBeLessThanOrEqual(budget);
    await expect(placing.getByText("#1", { exact: true })).toBeVisible();
    await expect(placing.getByRole("status")).toContainText(
      /goes in Very Good, number 1/,
    );

    const placed = await eventually(
      async () => {
        const now = await entries(api, listId);
        return now.length === n + 1 ? now : null;
      },
      { timeoutMs: 20_000, what: "the placement to reach the server" },
    );
    expect(placed.map((e) => e.itemId)).toEqual([newcomerId, ...ranked]);
    expect(placed.map((e) => `${e.band}:${e.position}`)).toEqual([
      "4:0",
      "4:1",
      "4:2",
      "4:3",
      "4:4",
    ]);

    // One Undo takes the whole placement back.
    await placing.getByRole("button", { name: "Undo", exact: true }).tap();
    // The sheet says it was taken back, and offers to place it again.
    await expect(placing.getByText(/^Took back .* isn't on Very Good now/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      placing.getByRole("button", { name: "Place it again" }),
    ).toBeVisible();
    const after = await eventually(
      async () => {
        const now = await entries(api, listId);
        return now.length === n ? now : null;
      },
      { timeoutMs: 20_000, what: "Undo to reach the server" },
    );
    expect(after.map((e) => e.itemId)).toEqual(ranked);
    expect(after.map((e) => e.position)).toEqual([0, 1, 2, 3]);
  } finally {
    await api.dispose();
  }
});
