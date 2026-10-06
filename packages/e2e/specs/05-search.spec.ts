import { BASE_URL, storageStatePath } from "../fixtures/accounts.ts";
import {
  createCellar,
  deleteCellars,
  ensureFriends,
  ensureNotFriends,
  friendIds,
  unique,
} from "../fixtures/data.ts";
import { deletePlace, insertPlace } from "../fixtures/db.ts";
import {
  bodyText,
  expect,
  newContext,
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

test("the restored landing view: greeting, collection line, Scan, Photo, five quick links", async ({
  primary,
}) => {
  // `82450ad1:src/app/(authenticated)/search/page.tsx`. Scan and Photo (G32,
  // restored — 14-image-search drives it); no tabs, no Brands/Recipes chips:
  // the old page had none of them.
  const noise = watch(primary);
  await primary.goto("/search");
  await expect(
    primary.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
  await expect(primary.getByRole("button", { name: "Scan" })).toBeVisible();
  await expect(primary.getByRole("button", { name: "Photo" })).toBeVisible();
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

test("an old image-results link, with no photo behind it, asks for a new one (G32)", async ({
  primary,
}) => {
  await primary.goto("/search?image_no_results=true");
  await expect(
    primary.getByText(/This image search link has expired/),
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

/* -------------------------------------------------------------------------- */
/* Discovery (UI parity G31, restored)                                         */
/* -------------------------------------------------------------------------- */

type Api = {
  query: (q: string, v?: Record<string, unknown>) => Promise<any>;
};

const viewerId = async (api: Api): Promise<string> =>
  (await api.query("query { me { id } }")).me.id;

/** A tea through `createItem` (no onboarding needed); items have no delete. */
async function createTea(api: Api, name: string): Promise<string> {
  const ref = await api.query(
    `query { referenceData(kind: TEA_CATEGORY, first: 1) {
       __typename ... on ReferenceRowConnection { edges { node { value } } }
     } }`,
  );
  const category = ref.referenceData.edges[0]?.node.value;
  expect(category, "no tea categories seeded").toBeTruthy();
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
  expect(
    created.createItem.__typename,
    JSON.stringify(created.createItem),
  ).toBe("MutationCreateItemSuccess");
  return created.createItem.data.id;
}

async function createTierList(
  api: Api,
  name: string,
  privacy: "PRIVATE" | "FRIENDS",
): Promise<string> {
  const data = await api.query(
    `mutation T($input: CreateTierListInput!) {
       createTierList(input: $input) {
         __typename ... on TierList { id } ... on Error { message }
       }
     }`,
    { input: { name, privacy } },
  );
  expect(data.createTierList.__typename, JSON.stringify(data)).toBe("TierList");
  return data.createTierList.id;
}

async function rank(api: Api, tierListId: string, teaId: string) {
  const added = await api.query(
    `mutation A($id: ID!, $input: AddTierListItemInput!) {
       addTierListItem(tierListId: $id, input: $input) {
         __typename ... on Error { message }
       }
     }`,
    { id: tierListId, input: { entry: { id: teaId, type: "TEA" }, band: 4 } },
  );
  expect(added.addTierListItem.__typename, JSON.stringify(added)).toBe(
    "TierListItem",
  );
}

test("Recent Activity shows a friend's review and their FRIENDS list — never their PRIVATE one", async ({
  api,
  api2,
  primary,
}) => {
  // The old feed took `$userIds` from the browser and showed a friend's
  // PRIVATE tier list, name and all. `me.recentActivity` decides both
  // server-side; this pins the two halves the user can see.
  const [me, friend] = await Promise.all([viewerId(api), viewerId(api2)]);
  // Leave the accounts as this found them: 03-friends starts from "not
  // friends", and a friendship left behind here races its removal there.
  const wereFriends = (await friendIds(api)).includes(friend);
  await ensureFriends(api, api2, me, friend);

  const teaName = unique("E5 Feed Tea");
  const secretName = unique("E5 Secret List");
  const sharedName = unique("E5 Shared List");
  const teaId = await createTea(api2, teaName);
  const review = await api2.query(
    `mutation R($itemId: ID!) {
       addItemReview(itemId: $itemId, type: TEA, input: { score: 4.5, text: { body: "E5 feed review" } }) {
         __typename ... on Error { message }
       }
     }`,
    { itemId: teaId },
  );
  expect(review.addItemReview.__typename, JSON.stringify(review)).toBe(
    "ItemReview",
  );
  const secret = await createTierList(api2, secretName, "PRIVATE");
  const shared = await createTierList(api2, sharedName, "FRIENDS");
  try {
    await rank(api2, secret, teaId);
    await rank(api2, shared, teaId);

    // Through the API: the PRIVATE list contributes no entry at all.
    const feed = await api.query(
      `query { me { recentActivity(kinds: [TIER_LISTED, REVIEWED], limit: 20, first: 40) {
         edges { node { kind user { id } item { id }
           tierListItem { tierListId tierList { name } } } }
       } } }`,
    );
    const nodes = feed.me.recentActivity.edges.map((e: any) => e.node);
    const listIds = nodes.map((n: any) => n.tierListItem?.tierListId);
    expect(listIds, "the friend's FRIENDS list is missing").toContain(shared);
    expect(listIds, "a friend's PRIVATE list leaked").not.toContain(secret);
    expect(JSON.stringify(feed)).not.toContain(secretName);
    expect(
      nodes.some(
        (n: any) =>
          n.kind === "REVIEWED" &&
          n.user?.id === friend &&
          n.item?.id === teaId,
      ),
      "the friend's review is missing from the feed",
    ).toBe(true);

    // Through the page, filtered as the old toggles filter (?activity=).
    const noise = watch(primary);
    await primary.goto("/search?activity=reviewed");
    await expect(
      primary.getByText("Recent Activity", { exact: true }),
    ).toBeVisible();
    const reviewCard = primary.locator("a.MuiCard-root", { hasText: teaName });
    await expect(reviewCard.first()).toBeVisible();
    await expect(reviewCard.first()).toContainText("Rated 4.5");
    await expect(reviewCard.first()).toHaveAttribute("href", `/teas/${teaId}`);

    await primary.goto("/search?activity=tier-listed");
    await expect(
      primary.getByText(`#1 in ${sharedName}`).first(),
    ).toBeVisible();
    expect(await bodyText(primary)).not.toContain(secretName);
    expect(noise.pageErrors, "the search page threw").toEqual([]);
  } finally {
    for (const id of [secret, shared]) {
      await api2.query(
        `mutation D($id: ID!) { deleteTierList(tierListId: $id) { __typename } }`,
        { id },
      );
    }
    if (!wereFriends) await ensureNotFriends(api, friend);
  }
});

test("Nearby Places renders from the geolocation cookie, nearest first", async ({
  primary,
}) => {
  // Somewhere with nothing else nearby (open Atlantic), so the strip's six
  // are exactly ours; a fresh point per run so reruns do not collide.
  const lat = 10 + Math.random();
  const lng = -30 + Math.random();
  const near = { id: crypto.randomUUID(), name: unique("E5 Near Bar") };
  const far = { id: crypto.randomUUID(), name: unique("E5 Far Bar") };
  insertPlace({ ...near, lng: lng + 0.001, lat, category: "wine_bar" });
  insertPlace({ ...far, lng: lng + 0.01, lat: lat + 0.01, category: "bar" });
  try {
    await primary
      .context()
      .addCookies([
        { name: "user_location", value: `${lat},${lng}`, url: BASE_URL },
      ]);
    const noise = watch(primary);
    await primary.goto("/search");
    await expect(
      primary.getByText("Nearby Places", { exact: true }),
    ).toBeVisible();
    const cards = primary.locator('a.MuiCard-root[href^="/map?placeId="]');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText(near.name);
    await expect(cards.nth(0)).toContainText("Wine Bar");
    await expect(cards.nth(0)).toContainText(/\d+m/);
    await expect(cards.nth(0)).toHaveAttribute(
      "href",
      `/map?placeId=${near.id}`,
    );
    await expect(cards.nth(1)).toContainText(far.name);
    await expect(primary.getByText("View all on map")).toBeVisible();
    expect(noise.pageErrors, "the search page threw").toEqual([]);
  } finally {
    await deletePlace(near.id);
    await deletePlace(far.id);
  }
});

test("the landing view is visible before any script runs", async ({
  browser,
}) => {
  // AnimateIn used to server-render `opacity:0` and wait for framer-motion to
  // hydrate; with JavaScript off nothing but the search box ever appeared.
  const ctx = await newContext(browser, {
    storageState: storageStatePath("primary"),
    javaScriptEnabled: false,
  });
  try {
    const page = await ctx.newPage();
    await page.goto("/search");
    const chip = page.locator("a[href] .MuiChip-root", { hasText: "Cellars" });
    await expect(chip).toBeVisible();
    // The CSS entrance takes ~0.5s; what matters is where it comes to rest
    // with no script at all — the old markup rested at opacity 0.
    const restingOpacity = () =>
      chip.evaluate((el) => {
        let node: Element | null = el;
        let min = 1;
        while (node) {
          min = Math.min(min, Number(getComputedStyle(node).opacity));
          node = node.parentElement;
        }
        return min;
      });
    await expect
      .poll(restingOpacity, {
        message: "a quick-link chip stays hidden without JavaScript",
        timeout: 5_000,
      })
      .toBe(1);
  } finally {
    await ctx.close();
  }
});
