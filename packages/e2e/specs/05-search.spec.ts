import { BASE_URL } from "../fixtures/accounts.ts";
import { createCellar, deleteCellars, unique } from "../fixtures/data.ts";
import {
  bodyText,
  expect,
  settleNetwork,
  test,
  watch,
} from "../fixtures/test.ts";

/**
 * Semantic search, through the page and through the API — the page being the
 * restored production `/search` (UI parity wave 9).
 *
 * X1 wired Ollama as the local embedding provider, so this is a real
 * end-to-end path: text → `EmbeddingActor` → `halfvec(768)` → `item_vectors`.
 * When Ollama is not running the whole thing fails with *"no embedding provider
 * wired"*, and this spec says so in those words rather than reporting search as
 * broken — the two need different people.
 */

/** Is an embedding provider actually reachable right now? */
async function embeddingsAvailable(api: {
  raw: (q: string, v?: Record<string, unknown>) => Promise<any>;
}): Promise<{ ok: boolean; why: string }> {
  const data = await api.raw(
    `query { itemSearch(text: "a probe", limit: 1, first: 1) {
       __typename
       ... on ItemSearchConnection { edges { node { distance } } }
       ... on ActorError { code message }
     } }`,
  );
  // A7e made `itemSearch` a result union, so the embedding failure this probe
  // is looking for arrives as a member in `data` — reading `errors` alone
  // would report the provider as available and the skip would stop working.
  const message =
    data.errors?.[0]?.message ?? data.data?.itemSearch?.message ?? "";
  if (/embedding provider|no embedding|ollama|AI_PROVIDER/i.test(message)) {
    return { ok: false, why: message };
  }
  return { ok: message === "" && data.errors === undefined, why: message };
}

test("semantic item search returns ranked results", async ({ api }) => {
  const probe = await embeddingsAvailable(api);
  test.skip(
    !probe.ok && /embedding provider|ollama|AI_PROVIDER/i.test(probe.why),
    `no embedding provider is wired — start Ollama (\`ollama serve\`, \`ollama pull nomic-embed-text\`). Server said: ${probe.why}`,
  );
  // The embedding budget is per account and per hour, and every agent's runs
  // share test@test.com: a spent cap is the machine's state, not a defect in
  // search. The page test below still asserts the page *says* so.
  test.skip(
    !probe.ok && /per-user cap reached|BUDGET_EXCEEDED/i.test(probe.why),
    `the shared test account's embedding budget is spent for this hour. Server said: ${probe.why}`,
  );

  const data = await api.raw(
    `query { itemSearch(text: "a bold red wine", limit: 10, first: 10) {
       __typename
       ... on ItemSearchConnection {
         edges { node { distance item { __typename id name } } }
       }
       ... on ActorError { code message }
     } }`,
  );
  expect(data.errors, JSON.stringify(data.errors)).toBeUndefined();
  expect(
    data.data.itemSearch.__typename,
    JSON.stringify(data.data.itemSearch),
  ).toBe("ItemSearchConnection");

  const edges = data.data.itemSearch.edges;
  test.skip(edges.length === 0, "no items in the database to rank");

  // `distance` is a **cosine distance**, 0-2, lower is closer — so ranked means
  // monotonically non-*decreasing*. An unranked list is a defect even when
  // every row in it is relevant.
  const distances = edges.map((e: any) => e.node.distance);
  expect(
    [...distances].sort((a, b) => a - b),
    "itemSearch results are not ordered by distance",
  ).toEqual(distances);
});

/** The restored box: no label, no submit button, an animated placeholder. */
const searchBox = (page: import("@playwright/test").Page) =>
  page.getByRole("textbox").first();

test("the restored landing view: greeting, collection line, Scan, five quick links", async ({
  primary,
}) => {
  // `82450ad1:src/app/(authenticated)/search/page.tsx`. No tabs, no Photo
  // button (G32), no Brands/Recipes chips: the old page had none of them.
  const noise = watch(primary);
  await primary.goto("/search");
  await expect(
    primary.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
  await expect(primary.getByRole("button", { name: "Scan" })).toBeVisible();
  await expect(primary.getByRole("button", { name: "Photo" })).toHaveCount(0);
  await expect(primary.getByRole("tab")).toHaveCount(0);
  const main = primary.locator("a[href] .MuiChip-root");
  await expect(main).toHaveText([
    "Cellars",
    "Map",
    "Tier Lists",
    "Favorites",
    "Rankings",
  ]);
  expect(noise.pageErrors, "the search page threw").toEqual([]);
});

test("the collection line counts only cellars you own or co-own (G36)", async ({
  api,
  api2,
  primary,
}) => {
  const STATS = `query { me { collectionStats {
    cellarCount itemCounts { wine beer spirit coffee sake tea }
  } } }`;
  const stats = async () => (await api.query(STATS)).me.collectionStats;

  const before = await stats();
  const mine = await createCellar(api, unique("E5 Mine"), "PRIVATE");
  const theirs = await createCellar(api2, unique("E5 Theirs"), "PUBLIC");
  try {
    const after = await stats();
    // Freshness first, so "unchanged" below is not a stale read.
    expect(after.cellarCount, "your own new cellar was not counted").toBe(
      before.cellarCount + 1,
    );
    // The rewrite summed `myCellars`, which lists a stranger's PUBLIC cellar
    // too: this is the bug, measured as one cellar, not "at most 100".
    const visible = await api.query(
      `query M($id: ID!) { cellar(id: $id) { __typename } }`,
      { id: theirs },
    );
    expect(
      visible.cellar.__typename,
      "the stranger's PUBLIC cellar should be visible — or this test proves nothing",
    ).toBe("Cellar");

    await primary.goto("/search");
    const total = Object.values(
      after.itemCounts as Record<string, number>,
    ).reduce((a, b) => a + b, 0);
    const cellars = `${after.cellarCount} ${after.cellarCount === 1 ? "cellar" : "cellars"}`;
    const line =
      total === 0
        ? "Your collection awaits. Start by adding your first item."
        : `${total} ${total === 1 ? "item" : "items"} across ${cellars}`;
    await expect(primary.getByText(line, { exact: true })).toBeVisible();
  } finally {
    await deleteCellars("primary", [mine]);
    await deleteCellars("secondary", [theirs]);
  }
});

test("typing searches on the debounce and renders results or an honest notice", async ({
  api,
  primary,
}) => {
  const noise = watch(primary);
  await primary.goto("/search");
  // The old box has no submit button: a 300 ms debounce navigates to ?q=.
  await searchBox(primary).fill("a bold red wine");
  await primary.waitForURL(/[?&]q=a(\+|%20)bold(\+|%20)red(\+|%20)wine/);
  // The old section titles are Typography title-lg, a <p>, not a heading.
  await expect(
    primary.getByText("Search results for \u201ca bold red wine\u201d", {
      exact: true,
    }),
  ).toBeVisible();
  await settleNetwork(primary);

  const text = await bodyText(primary);
  const probe = await embeddingsAvailable(api);
  if (!probe.ok) {
    // The page must degrade visibly, not render a silent empty list.
    expect(
      text,
      "search failed server-side and the page said nothing about it",
    ).toMatch(/unavailable|could not|not available/i);
  } else {
    expect(text).toMatch(
      /No items found for|Can.t find what you.re looking for\? Add an item/,
    );
  }
  expect(noise.pageErrors, "the search page threw").toEqual([]);
});

test("a scanned code is looked up server-side from ?barcode=", async ({
  primary,
}) => {
  // The old page read result rows out of ?barcode_results=<JSON>, which its
  // stub never filled; now the URL carries only the code.
  const noise = watch(primary);
  await primary.goto("/search?barcode=0000000000000");
  await expect(
    primary.getByText("Barcode search results", { exact: true }),
  ).toBeVisible();
  await expect(
    primary.getByText("No items found matching the barcode"),
  ).toBeVisible();
  expect(noise.pageErrors).toEqual([]);
});

test("an old image-search link is told image search is gone (G32)", async ({
  primary,
}) => {
  await primary.goto("/search?image_no_results=true");
  await expect(
    primary.getByText(/Image search is no longer available/),
  ).toBeVisible();
});

test("anonymous callers are refused the brand catalog", async ({ browser }) => {
  // B3's catalog rule, from the side a signed-in test cannot see.
  const ctx = await browser.newContext();
  const res = await ctx.request.post("/api/graphql", {
    headers: {
      origin: BASE_URL,
      "content-type": "application/json",
    },
    data: {
      query: `{ brands(first: 5) {
        __typename ... on Error { message } ... on BrandConnection { edges { node { id } } }
      } }`,
    },
  });
  const body = await res.json();
  const result = body.data?.brands;
  expect(
    result?.__typename,
    `anonymous brand catalog read was not refused: ${JSON.stringify(body).slice(0, 300)}`,
  ).toBe("ForbiddenError");
  await ctx.close();
});
