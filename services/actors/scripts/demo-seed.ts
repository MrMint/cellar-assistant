/**
 * `bun run dev:seed:demo` — a large, synthetic demo dataset for reviewing the
 * app: four accounts with cellars, ratings, a year of drink logs, tier lists,
 * recipes, places and a menu scan. The data itself is in `./demo-seed-data.ts`.
 *
 *   DATABASE_URL=postgres://cellar:cellar@127.0.0.1:<pg>/cellar \
 *   BETTER_AUTH_URL=http://localhost:<actors> \
 *   GRAPHQL_API_URL=http://localhost:<api>/graphql \
 *   AUTH_TRUSTED_ORIGIN=http://localhost:<web> \
 *   node scripts/demo-seed.ts
 *
 * `bun run dev:seed:demo` fills all four from this worktree's stack
 * (`scripts/stack/stack.sh seed:demo`). Each also takes a flag —
 * `--database-url`, `--auth-url`, `--api-url`, `--origin` — which wins over
 * the environment, for loading another stack.
 *
 * Run `bun run dev:seed` (or `db:seed`) first: this script needs the reference
 * tables and the two fixed-id test accounts, and refuses to start without them.
 *
 * ## Through the API, as each user
 *
 * Every row a user could make in the app is made through the GraphQL API with
 * that user's own token, so visibility rules, the outbox and every derived row
 * (companions' entries, friendships' mirror rows, tier-list history, recipe
 * ingredient classification) are the app's, not this script's.
 *
 * The exceptions write to Postgres directly, because the API has no write for
 * them:
 *
 *  1. **Place approval.** `createPlace` leaves a place `pending` until the
 *     AI review approves it; this sets `review_status = 'approved'` on every
 *     demo place but one, which stays pending ("Under review").
 *  2. **The menu scan.** Extraction is a model call, so the scan
 *     (`menu_scans`, `processing_status = 'completed'`), its lines
 *     (`place_menu_items`) and their pending suggestions
 *     (`item_match_suggestions`) are inserted. The image itself is uploaded
 *     through `createUploadTarget` / `verifyUpload`, so `files` is real.
 *  3. **Backdated `created_at`** on reviews and cellar bottles. Drink logs are
 *     backdated through the API (`logDrink(drankAt:)`); reviews and bottles
 *     have no such field, and a year of activity all stamped "today" makes the
 *     friends feed and "recently added" look fake.
 *
 * ## Idempotent
 *
 * Every client-minted id (items, bottles, logs, reviews, places, tier-list
 * entries, the scan) is a v5-shaped uuid hashed from a stable key in
 * `demo-seed-data.ts`, and every write is skipped when its row already
 * exists. Catalog items, cellars, tier lists and recipes are found by name
 * first, so a stack that already holds "Pliny the Elder" reuses it instead of
 * minting a second one. A second run prints `0 created` for every step.
 */
import { createHash } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import { createDb } from "@cellar-assistant/db";
import { sql } from "@cellar-assistant/db/orm";
import {
  BOTTLES,
  BREW_PREFS,
  CELLARS,
  type DemoItem,
  type DemoUser,
  type DemoUserKey,
  FAVORITES,
  FRIENDSHIPS,
  ITEMS,
  type ItemType,
  LOG_COUNTS,
  MENU_SCAN,
  NOTES,
  PANTRY,
  PASSWORD,
  PLACES,
  RECIPES,
  REVIEW_TEXT,
  REVIEWS,
  TAGS,
  TIER_LISTS,
  TYPE_PLACES,
  TYPE_WEIGHTS,
  USERS,
  WANT_TO_TRY,
} from "./demo-seed-data.ts";

/* -------------------------------------------------------------------------- */
/* Configuration                                                               */
/* -------------------------------------------------------------------------- */

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};

const DATABASE_URL =
  flag("database-url") ??
  process.env.DATABASE_URL ??
  "postgres://cellar:cellar@localhost:5433/cellar";
const AUTH_URL =
  flag("auth-url") ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3002";
const API_URL =
  flag("api-url") ??
  process.env.GRAPHQL_API_URL ??
  "http://localhost:3001/graphql";
const ORIGIN =
  flag("origin") ?? process.env.AUTH_TRUSTED_ORIGIN ?? "http://localhost:3000";

const DAY = 86_400_000;
const NOW = Date.now();
const daysAgo = (d: number, hourUtc = 1): Date => {
  const at = new Date(NOW - d * DAY);
  at.setUTCHours(hourUtc, (d * 7) % 60, 0, 0);
  // Never in the future: logDrink refuses a drankAt past now.
  return at.getTime() > NOW - 60_000 ? new Date(NOW - 2 * 3_600_000) : at;
};
const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

/* -------------------------------------------------------------------------- */
/* Deterministic ids and randomness                                            */
/* -------------------------------------------------------------------------- */

/** A uuid hashed from `key`, shaped as v5 so every uuid validator accepts it. */
const demoId = (key: string): string => {
  const h = createHash("sha256")
    .update(`cellar-demo-seed:${key}`)
    .digest("hex");
  const variant = ((Number.parseInt(h.charAt(16), 16) & 0x3) | 0x8).toString(
    16,
  );
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

/** mulberry32: the same sequence on every run, so logs keep their ids. */
const rng = (seed: string): (() => number) => {
  let a = Number.parseInt(
    createHash("sha256").update(seed).digest("hex").slice(0, 8),
    16,
  );
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};
const pick = <T>(r: () => number, xs: readonly T[]): T => {
  const x = xs[Math.floor(r() * xs.length)];
  if (x === undefined) throw new Error("pick from an empty list");
  return x;
};
const clampScore = (s: number): number =>
  Math.min(5, Math.max(1, Math.round(s * 2) / 2));

/* -------------------------------------------------------------------------- */
/* Lookups                                                                     */
/* -------------------------------------------------------------------------- */

const TABLE: Record<ItemType, string> = {
  WINE: "wines",
  BEER: "beers",
  SPIRIT: "spirits",
  COFFEE: "coffees",
  SAKE: "sakes",
  TEA: "teas",
};
const COLUMN: Record<ItemType, string> = {
  WINE: "wine_id",
  BEER: "beer_id",
  SPIRIT: "spirit_id",
  COFFEE: "coffee_id",
  SAKE: "sake_id",
  TEA: "tea_id",
};

const itemByKey = new Map<string, DemoItem>(ITEMS.map((i) => [i.key, i]));
const item = (key: string): DemoItem => {
  const found = itemByKey.get(key);
  if (found === undefined) throw new Error(`demo-seed-data: no item ${key}`);
  return found;
};
const userByKey = new Map<DemoUserKey, DemoUser>(USERS.map((u) => [u.key, u]));
const user = (key: DemoUserKey): DemoUser => {
  const found = userByKey.get(key);
  if (found === undefined) throw new Error(`demo-seed-data: no user ${key}`);
  return found;
};

type Db = ReturnType<typeof createDb>;
const db: Db = createDb(DATABASE_URL);

const one = async <T>(query: ReturnType<typeof sql>): Promise<T | undefined> =>
  ((await db.execute(query)).rows[0] as T | undefined) ?? undefined;
const exists = async (query: ReturnType<typeof sql>): Promise<boolean> =>
  (await one(query)) !== undefined;

/** Resolved database ids, filled as each step runs. */
const ids = {
  user: new Map<DemoUserKey, string>(),
  item: new Map<string, string>(),
  cellar: new Map<string, string>(),
  place: new Map<string, string>(),
  recipe: new Map<string, string>(),
};
const need = (m: Map<string, string>, key: string, what: string): string => {
  const v = m.get(key);
  if (v === undefined) throw new Error(`no ${what} id for ${key}`);
  return v;
};
const userId = (k: DemoUserKey): string =>
  need(ids.user as Map<string, string>, k, "user");
const itemId = (k: string): string => need(ids.item, k, "item");

/* -------------------------------------------------------------------------- */
/* Auth and GraphQL                                                            */
/* -------------------------------------------------------------------------- */

/** Marks a GraphQL document; `demo-seed-documents.test.ts` validates each one. */
const gql = (strings: TemplateStringsArray): string => strings.join("");

const tokens = new Map<DemoUserKey, { token: string; at: number }>();

const signUp = async (u: DemoUser): Promise<void> => {
  const res = await fetch(`${AUTH_URL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email: u.email, password: PASSWORD, name: u.name }),
  });
  if (res.ok) return;
  const body = await res.text();
  if (/already exists|ALREADY_EXISTS/i.test(body)) return;
  throw new Error(`sign-up ${u.email}: ${res.status} ${body}`);
};

const tokenFor = async (k: DemoUserKey): Promise<string> => {
  const cached = tokens.get(k);
  if (cached !== undefined && NOW_MS() - cached.at < 5 * 60_000)
    return cached.token;
  const u = user(k);
  const res = await fetch(`${AUTH_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email: u.email, password: PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(
      `sign-in ${u.email}: ${res.status} ${await res.text()}\n` +
        `  (is ${ORIGIN} in this stack's AUTH_TRUSTED_ORIGINS? is the password ${PASSWORD}?)`,
    );
  }
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const tok = await fetch(`${AUTH_URL}/api/auth/token`, {
    headers: { cookie, origin: ORIGIN },
  });
  if (!tok.ok)
    throw new Error(`token ${u.email}: ${tok.status} ${await tok.text()}`);
  const { token } = (await tok.json()) as { token: string };
  tokens.set(k, { token, at: NOW_MS() });
  return token;
};
const NOW_MS = (): number => Date.now();

// biome-ignore lint/suspicious/noExplicitAny: raw GraphQL responses — each caller reads the one field its document asked for, and the documents are validated offline (demo-seed-documents.test.ts)
type Data = Record<string, any>;

const call = async (
  as: DemoUserKey,
  query: string,
  variables: Record<string, unknown>,
): Promise<Data> => {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${await tokenFor(as)}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let body: { data?: Data; errors?: { message: string }[] };
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`non-JSON response ${res.status}: ${text.slice(0, 300)}`);
  }
  if (body.errors?.length) {
    throw new Error(`GraphQL: ${body.errors.map((e) => e.message).join("; ")}`);
  }
  return body.data ?? {};
};

/**
 * The one result field of a mutation: returns it when it is `expected`,
 * returns null for a `ConflictError` when `conflictOk`, throws otherwise.
 */
const run = async (
  as: DemoUserKey,
  query: string,
  variables: Record<string, unknown>,
  expected: string,
  opts: { conflictOk?: boolean } = {},
): Promise<Data | null> => {
  const data = await call(as, query, variables);
  const field = Object.values(data)[0] as Data | undefined;
  if (field === undefined || field === null) throw new Error("empty result");
  if (field.__typename === expected) return field;
  if (opts.conflictOk && field.__typename === "ConflictError") return null;
  throw new Error(
    `${field.__typename}: ${field.message ?? JSON.stringify(field)}`,
  );
};

/** Poll until `check` passes — for rows the outbox writes a moment later. */
const eventually = async (
  check: () => Promise<boolean>,
  what: string,
): Promise<void> => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`timed out waiting for ${what}`);
};

/* -------------------------------------------------------------------------- */
/* Documents                                                                   */
/* -------------------------------------------------------------------------- */

const SEND_FRIEND_REQUEST = gql`
  mutation DemoSendFriendRequest($userId: ID!) {
    sendFriendRequest(userId: $userId) {
      __typename
      ... on FriendRequest { id }
      ... on Error { message }
    }
  }
`;
const INCOMING_REQUESTS = gql`
  query DemoIncomingRequests {
    myFriendRequests(first: 50, direction: INCOMING) {
      __typename
      ... on FriendRequestConnection { edges { node { id requesterId } } }
    }
  }
`;
const ACCEPT_FRIEND_REQUEST = gql`
  mutation DemoAcceptFriendRequest($requestId: ID!) {
    acceptFriendRequest(requestId: $requestId) {
      __typename
      ... on Error { message }
    }
  }
`;
const OPEN_ITEM_DRAFT = gql`
  mutation DemoOpenItemDraft($draftId: ID!, $type: ItemType!) {
    openItemDraft(draftId: $draftId, type: $type) {
      __typename
      ... on ItemOnboarding { id }
      ... on Error { message }
    }
  }
`;
const CONFIRM_ITEM_ONBOARDING = gql`
  mutation DemoConfirmItemOnboarding($onboardingId: ID!, $input: ConfirmItemOnboardingInput!) {
    confirmItemOnboarding(onboardingId: $onboardingId, input: $input) {
      __typename
      ... on Error { message }
    }
  }
`;
const RESOLVE_BRAND = gql`
  mutation DemoResolveBrand($name: String!) {
    resolveBrand(name: $name) {
      __typename
      ... on Brand { id }
      ... on Error { message }
    }
  }
`;
const LINK_ITEM_BRAND = gql`
  mutation DemoLinkItemBrand($brandId: ID!, $itemId: ID!, $type: ItemType!) {
    linkItemBrand(brandId: $brandId, itemId: $itemId, type: $type, isPrimary: true) {
      __typename
      ... on Error { message }
    }
  }
`;
const CREATE_PLACE = gql`
  mutation DemoCreatePlace($input: CreatePlaceInput!) {
    createPlace(input: $input) {
      __typename
      ... on CreatePlacePayload { place { id } }
      ... on Error { message }
    }
  }
`;
const CREATE_UPLOAD_TARGET = gql`
  mutation DemoCreateUploadTarget($fileId: ID, $input: CreateUploadTargetInput!) {
    createUploadTarget(fileId: $fileId, input: $input) {
      __typename
      ... on UploadTarget { fileId uploadUrl }
      ... on Error { message }
    }
  }
`;
const VERIFY_UPLOAD = gql`
  mutation DemoVerifyUpload($fileId: ID!) {
    verifyUpload(fileId: $fileId) {
      __typename
      ... on File { id }
      ... on Error { message }
    }
  }
`;
const CREATE_CELLAR = gql`
  mutation DemoCreateCellar($input: CreateCellarInput!) {
    createCellar(input: $input) {
      __typename
      ... on Cellar { id }
      ... on Error { message }
    }
  }
`;
const ADD_ITEM_TO_CELLAR = gql`
  mutation DemoAddItemToCellar($cellarId: ID!, $input: AddCellarItemInput!) {
    addItemToCellar(cellarId: $cellarId, input: $input) {
      __typename
      ... on CellarItem { id }
      ... on Error { message }
    }
  }
`;
const ADD_ITEM_REVIEW = gql`
  mutation DemoAddItemReview($itemId: ID!, $type: ItemType!, $input: AddItemReviewInput!) {
    addItemReview(itemId: $itemId, type: $type, input: $input) {
      __typename
      ... on ItemReview { id }
      ... on Error { message }
    }
  }
`;
const LOG_DRINK = gql`
  mutation DemoLogDrink($id: ID, $input: LogDrinkInput!) {
    logDrink(id: $id, input: $input) {
      __typename
      ... on LoggedDrinkPayload { entryIds }
      ... on Error { message }
    }
  }
`;
const SET_WANT_TO_TRY = gql`
  mutation DemoSetWantToTry($target: WantToTryTargetInput!) {
    setWantToTry(target: $target, wantToTry: true) {
      __typename
      ... on Error { message }
    }
  }
`;
const SET_FAVORITE = gql`
  mutation DemoSetFavorite($itemId: ID!, $type: ItemType!) {
    setFavorite(itemId: $itemId, type: $type, favorited: true) {
      __typename
      ... on Error { message }
    }
  }
`;
const SET_BREW_PREFS = gql`
  mutation DemoSetBrewPrefs(
    $itemId: ID!
    $itemType: ItemType!
    $doseGrams: Float
    $waterMl: Float
    $waterTempC: Int
    $steepSeconds: Int
  ) {
    setBrewPrefs(
      itemId: $itemId
      itemType: $itemType
      doseGrams: $doseGrams
      waterMl: $waterMl
      waterTempC: $waterTempC
      steepSeconds: $steepSeconds
    ) {
      __typename
      ... on Error { message }
    }
  }
`;
const SET_BAR_PANTRY_ITEM = gql`
  mutation DemoSetBarPantryItem($kind: IngredientKind!) {
    setBarPantryItem(kind: $kind, have: true) {
      __typename
      ... on Error { message }
    }
  }
`;
const CREATE_RECIPE = gql`
  mutation DemoCreateRecipe($input: CreateRecipeInput!) {
    createRecipe(input: $input) {
      __typename
      ... on Recipe { id }
      ... on Error { message }
    }
  }
`;
const SET_RECIPE_INGREDIENTS = gql`
  mutation DemoSetRecipeIngredients($recipeId: ID!, $ingredients: [RecipeIngredientInput!]!) {
    setRecipeIngredients(recipeId: $recipeId, ingredients: $ingredients) {
      __typename
      ... on Error { message }
    }
  }
`;
const SET_RECIPE_INSTRUCTIONS = gql`
  mutation DemoSetRecipeInstructions($recipeId: ID!, $instructions: [RecipeInstructionInput!]!) {
    setRecipeInstructions(recipeId: $recipeId, instructions: $instructions) {
      __typename
      ... on Error { message }
    }
  }
`;
const SET_RECIPE_LOVE = gql`
  mutation DemoSetRecipeLove($recipeId: ID!) {
    setRecipeLove(recipeId: $recipeId, loved: true) {
      __typename
      ... on Error { message }
    }
  }
`;
const CREATE_TIER_LIST = gql`
  mutation DemoCreateTierList($input: CreateTierListInput!) {
    createTierList(input: $input) {
      __typename
      ... on TierList { id }
      ... on Error { message }
    }
  }
`;
const ADD_TIER_LIST_ITEMS = gql`
  mutation DemoAddTierListItems($tierListId: ID!, $input: AddTierListItemsInput!) {
    addTierListItems(tierListId: $tierListId, input: $input) {
      __typename
      ... on AddTierListItemsPayload { skippedCount }
      ... on Error { message }
    }
  }
`;
const REORDER_TIER_LIST_BAND = gql`
  mutation DemoReorderTierListBand($tierListId: ID!, $band: Int!, $orderedIds: [ID!]!) {
    reorderTierListBand(tierListId: $tierListId, band: $band, orderedIds: $orderedIds) {
      __typename
      ... on Error { message }
    }
  }
`;
const TIER_LIST_HISTORY = gql`
  query DemoTierListHistory($id: ID!) {
    tierList(id: $id) {
      __typename
      ... on TierList { editHistory { editCount undo { seq } } }
    }
  }
`;
const UNDO_TIER_LIST_EDIT = gql`
  mutation DemoUndoTierListEdit($tierListId: ID!, $expectedSeq: Int!) {
    undoTierListEdit(tierListId: $tierListId, expectedSeq: $expectedSeq) {
      __typename
      ... on Error { message }
    }
  }
`;

/* -------------------------------------------------------------------------- */
/* Steps                                                                       */
/* -------------------------------------------------------------------------- */

const tally = new Map<string, { created: number; kept: number }>();
const count = (step: string, created: boolean): void => {
  const t = tally.get(step) ?? { created: 0, kept: 0 };
  if (created) t.created += 1;
  else t.kept += 1;
  tally.set(step, t);
};

const stepAccounts = async (): Promise<void> => {
  for (const u of USERS) {
    const before = await one<{ id: string }>(
      sql`select id from "user" where email = ${u.email}`,
    );
    if (
      before === undefined &&
      (u.email === "test@test.com" || u.email === "test2@test.com")
    ) {
      throw new Error(
        `${u.email} does not exist. Run \`bun run dev:seed\` (or db:seed) first: ` +
          "it creates the two test accounts with the fixed ids the e2e suite relies on.",
      );
    }
    if (before === undefined) await signUp(u);
    const row = await one<{ id: string }>(
      sql`select id from "user" where email = ${u.email}`,
    );
    if (row === undefined) throw new Error(`no user row for ${u.email}`);
    ids.user.set(u.key, row.id);
    count("accounts", before === undefined);
  }
};

const areFriends = (a: string, b: string): Promise<boolean> =>
  exists(
    sql`select 1 from friends where user_id = ${a}::uuid and friend_id = ${b}::uuid`,
  );

const stepFriends = async (): Promise<void> => {
  for (const [from, to] of FRIENDSHIPS) {
    const a = userId(from);
    const b = userId(to);
    if ((await areFriends(a, b)) && (await areFriends(b, a))) {
      count("friendships", false);
      continue;
    }
    const sent = await run(
      from,
      SEND_FRIEND_REQUEST,
      { userId: b },
      "FriendRequest",
      {
        conflictOk: true,
      },
    );
    let requestId: string | undefined = sent?.id;
    if (requestId === undefined) {
      const data = await call(to, INCOMING_REQUESTS, {});
      const edges = (data.myFriendRequests?.edges ?? []) as {
        node: { id: string; requesterId: string };
      }[];
      requestId = edges.find((e) => e.node.requesterId === a)?.node.id;
    }
    if (requestId !== undefined) {
      await run(
        to,
        ACCEPT_FRIEND_REQUEST,
        { requestId },
        "AcceptFriendRequestPayload",
        {
          conflictOk: true,
        },
      );
    }
    await eventually(
      async () => (await areFriends(a, b)) && (await areFriends(b, a)),
      `${from} and ${to} to be friends`,
    );
    count("friendships", true);
  }
};

/**
 * Items are made the way the app makes a hand-typed one: `openItemDraft` (an
 * onboarding with nothing to read, no model call) then `confirmItemOnboarding`,
 * which creates the item and links the producer as its primary brand through
 * the outbox. `createItem` alone is refused — every item row names the
 * onboarding it came from.
 */
const stepItems = async (): Promise<void> => {
  const me = userId("me");
  for (const i of ITEMS) {
    const table = sql.raw(TABLE[i.type]);
    const lookup = () =>
      one<{ id: string; created_by_id: string | null }>(
        sql`select id, created_by_id from ${table} where name = ${i.name} order by created_at limit 1`,
      );
    const found = await lookup();
    // A create that dies in the outbox (a bad attribute, say) leaves its
    // onboarding CONFIRMED with no item, and confirming it again is a no-op —
    // so a second attempt opens a fresh draft.
    for (let attempt = 0; found === undefined && attempt < 2; attempt++) {
      const draft = await run(
        "me",
        OPEN_ITEM_DRAFT,
        {
          draftId: demoId(
            attempt === 0 ? `draft:${i.key}` : `draft:${i.key}:${attempt}`,
          ),
          type: i.type,
        },
        "ItemOnboarding",
      );
      await run(
        "me",
        CONFIRM_ITEM_ONBOARDING,
        {
          onboardingId: draft?.id,
          input: {
            itemId: demoId(`item:${i.key}`),
            name: i.name,
            country: i.country,
            brandName: i.brand,
            attributes: i.attrs,
            ...(i.description === undefined
              ? {}
              : { description: i.description }),
          },
        },
        "ConfirmedItemOnboarding",
      );
      try {
        await eventually(
          async () => (await lookup()) !== undefined,
          `item ${i.name}`,
        );
        break;
      } catch (error) {
        if (attempt === 1) throw error;
        console.log(
          `[demo-seed] ${i.name} did not appear; retrying with a fresh draft`,
        );
      }
    }
    const row = await lookup();
    if (row === undefined) throw new Error(`item ${i.name} never appeared`);
    ids.item.set(i.key, row.id);
    count("items", found === undefined);

    // An item that was already there and is ours but has no brand: link it.
    // (Linking is the creator's alone, so someone else's item is left as is.)
    const col = sql.raw(COLUMN[i.type]);
    if (
      found !== undefined &&
      found.created_by_id === me &&
      !(await exists(
        sql`select 1 from item_brands where ${col} = ${row.id}::uuid`,
      ))
    ) {
      const brand = await run("me", RESOLVE_BRAND, { name: i.brand }, "Brand");
      await run(
        "me",
        LINK_ITEM_BRAND,
        { brandId: brand?.id, itemId: row.id, type: i.type },
        "ItemBrand",
        { conflictOk: true },
      );
      count("brand links", true);
    }
  }
};

const stepPlaces = async (): Promise<void> => {
  for (const p of PLACES) {
    const found = await one<{ id: string }>(
      sql`select id from places where name = ${p.name} order by created_at limit 1`,
    );
    let id = found?.id;
    if (id === undefined) {
      const res = await run(
        "me",
        CREATE_PLACE,
        {
          input: {
            placeId: demoId(`place:${p.key}`),
            name: p.name,
            categories: p.categories,
            description: p.description,
            location: { lat: p.lat, lng: p.lng },
            streetAddress: p.street,
            locality: "Madison",
            region: "WI",
            postcode: p.postcode,
            countryCode: "US",
          },
        },
        "CreatePlacePayload",
      );
      id = res?.place.id as string;
    }
    ids.place.set(p.key, id);
    count("places", found === undefined);
    // Direct write (1): approve every demo place but the one under review.
    const status = p.underReview ? "pending" : "approved";
    await db.execute(sql`
      update places
         set review_status = ${status},
             reviewed_at = case when ${status} = 'approved' then coalesce(reviewed_at, now()) else null end,
             updated_at = now()
       where id = ${id}::uuid and created_by = ${userId("me")}::uuid
         and review_status is distinct from ${status}
    `);
  }
};

/** A small off-white PNG with ruled lines — a stand-in photo of a menu. */
const menuPng = (): Buffer => {
  const w = 300;
  const h = 420;
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0;
    const ruled = y > 40 && y % 28 < 3;
    for (let x = 0; x < w; x++) {
      const text = ruled && x > 24 && x < (y % 56 < 28 ? 260 : 200);
      raw[y * (w + 1) + 1 + x] = y < 34 ? 60 : text ? 90 : 238;
    }
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

const stepMenuScan = async (): Promise<void> => {
  const scanId = demoId(`menu-scan:${MENU_SCAN.key}`);
  if (await exists(sql`select 1 from menu_scans where id = ${scanId}::uuid`)) {
    count("menu scans", false);
    return;
  }
  const owner = MENU_SCAN.owner;
  const fileId = demoId(`file:${MENU_SCAN.key}`);
  if (
    !(await exists(
      sql`select 1 from files where id = ${fileId}::uuid and verified_at is not null`,
    ))
  ) {
    const target = await run(
      owner,
      CREATE_UPLOAD_TARGET,
      { fileId, input: { kind: "menu-scan", contentType: "image/png" } },
      "UploadTarget",
    );
    const put = await fetch(target?.uploadUrl as string, {
      method: "PUT",
      headers: { "content-type": "image/png" },
      body: menuPng(),
    });
    if (!put.ok)
      throw new Error(`menu image PUT: ${put.status} ${await put.text()}`);
    await run(owner, VERIFY_UPLOAD, { fileId }, "File");
  }

  // Direct write (2): the scan, its lines and its pending suggestions.
  const placeId = need(ids.place, MENU_SCAN.place, "place");
  const place = PLACES.find((p) => p.key === MENU_SCAN.place);
  const at = daysAgo(MENU_SCAN.daysAgo, 2).toISOString();
  const lines = MENU_SCAN.lines;
  const matched = lines.filter(
    (l) => "matched" in l && l.matched !== undefined,
  ).length;
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into menu_scans (id, user_id, place_id, original_image_id, processing_status,
        confidence_score, scan_location, processing_model, processing_duration_ms,
        items_detected, items_matched, scanned_at, processed_at, created_at, updated_at,
        header_name, extracted_text)
      values (${scanId}::uuid, ${userId(owner)}::uuid, ${placeId}::uuid, ${fileId}::uuid,
        'completed', 0.92,
        ST_SetSRID(ST_MakePoint(${place?.lng ?? 0}, ${place?.lat ?? 0}), 4326)::geography,
        'demo-seed', 4100, ${lines.length}, ${matched}, ${at}::timestamptz,
        ${at}::timestamptz, ${at}::timestamptz, ${at}::timestamptz, ${MENU_SCAN.header},
        ${lines.map((l) => `${l.name}  $${l.price}`).join("\n")})
    `);
    for (const [n, line] of lines.entries()) {
      const lineId = demoId(`menu-line:${MENU_SCAN.key}:${n}`);
      const m = "matched" in line ? line.matched : undefined;
      const s = "suggested" in line ? line.suggested : undefined;
      const mi = m === undefined ? undefined : item(m);
      const col = (t: ItemType): string | null =>
        mi !== undefined && mi.type === t ? itemId(mi.key) : null;
      await tx.execute(sql`
        insert into place_menu_items (id, menu_scan_id, place_id, menu_item_name,
          menu_item_description, menu_item_price, menu_category, detected_item_type,
          confidence_score, search_name, wine_id, beer_id, spirit_id, coffee_id, sake_id,
          tea_id, created_at, updated_at)
        values (${lineId}::uuid, ${scanId}::uuid, ${placeId}::uuid, ${line.name},
          ${"description" in line ? (line.description ?? null) : null}, ${line.price},
          ${line.category}, ${line.type}, ${m !== undefined ? 0.95 : s !== undefined ? 0.7 : 0.4},
          ${line.name
            .toLowerCase()
            .replace(/\(.*\)/, "")
            .trim()},
          ${col("WINE")}::uuid, ${col("BEER")}::uuid, ${col("SPIRIT")}::uuid,
          ${col("COFFEE")}::uuid, ${col("SAKE")}::uuid, ${col("TEA")}::uuid,
          ${at}::timestamptz, ${at}::timestamptz)
      `);
      if (s !== undefined) {
        const si = item(s);
        const scol = sql.raw(`suggested_${COLUMN[si.type]}`);
        await tx.execute(sql`
          insert into item_match_suggestions (id, place_menu_item_id, ${scol},
            confidence_score, match_reasoning, created_at)
          values (${demoId(`menu-suggestion:${MENU_SCAN.key}:${n}`)}::uuid, ${lineId}::uuid,
            ${itemId(si.key)}::uuid, 0.78,
            ${`The menu line reads like ${si.name}; the name differs, so confirm it.`},
            ${at}::timestamptz)
        `);
      }
    }
  });
  count("menu scans", true);
};

const stepCellars = async (): Promise<void> => {
  for (const c of CELLARS) {
    const owner = userId(c.owner);
    const found = await one<{ id: string }>(
      sql`select id from cellars where created_by_id = ${owner}::uuid and name = ${c.name} order by created_at limit 1`,
    );
    let id = found?.id;
    if (id === undefined) {
      const res = await run(
        c.owner,
        CREATE_CELLAR,
        {
          input: {
            name: c.name,
            privacy: c.privacy,
            ...(c.coOwners === undefined
              ? {}
              : { coOwnerIds: c.coOwners.map(userId) }),
          },
        },
        "Cellar",
      );
      id = res?.id as string;
    }
    ids.cellar.set(c.key, id);
    count("cellars", found === undefined);
  }

  for (const bottle of BOTTLES) {
    const id = demoId(`bottle:${bottle.key}`);
    if (await exists(sql`select 1 from cellar_items where id = ${id}::uuid`)) {
      count("bottles", false);
      continue;
    }
    const cellar = CELLARS.find((c) => c.key === bottle.cellar);
    if (cellar === undefined) throw new Error(`no cellar ${bottle.cellar}`);
    const i = item(bottle.item);
    const acquired = daysAgo(bottle.acquired);
    await run(
      cellar.owner,
      ADD_ITEM_TO_CELLAR,
      {
        cellarId: need(ids.cellar, bottle.cellar, "cellar"),
        input: {
          cellarItemId: id,
          item: { id: itemId(i.key), type: i.type },
          sourceType: "manual",
          acquiredOn: isoDate(acquired),
          ...(bottle.opened === undefined
            ? {}
            : { openAt: daysAgo(bottle.opened, 2).toISOString() }),
          ...(bottle.emptied === undefined
            ? {}
            : { emptyAt: daysAgo(bottle.emptied, 3).toISOString() }),
          ...(bottle.left === undefined
            ? {}
            : { percentageRemaining: bottle.left }),
          ...(bottle.drinkUntilIn === undefined
            ? {}
            : {
                drinkUntil: isoDate(new Date(NOW + bottle.drinkUntilIn * DAY)),
              }),
          ...(bottle.packaged === undefined
            ? {}
            : { packagedOn: isoDate(daysAgo(bottle.packaged)) }),
          ...(bottle.price === undefined
            ? {}
            : { priceAmount: bottle.price, priceCurrency: "USD" }),
          ...(bottle.location === undefined
            ? {}
            : { location: bottle.location }),
        },
      },
      "CellarItem",
    );
    // Direct write (3): the bottle was added when it was bought, not today.
    await db.execute(
      sql`update cellar_items set created_at = ${acquired.toISOString()}::timestamptz where id = ${id}::uuid`,
    );
    count("bottles", true);
  }
};

const stepReviews = async (): Promise<void> => {
  for (const u of USERS) {
    const keys = REVIEWS[u.key];
    for (const [n, key] of keys.entries()) {
      const i = item(key);
      const col = sql.raw(COLUMN[i.type]);
      if (
        await exists(
          sql`select 1 from item_reviews where user_id = ${userId(u.key)}::uuid and ${col} = ${itemId(key)}::uuid`,
        )
      ) {
        count("reviews", false);
        continue;
      }
      const reviewId = demoId(`review:${u.key}:${key}`);
      const text = u.key === "me" ? REVIEW_TEXT[key] : undefined;
      await run(
        u.key,
        ADD_ITEM_REVIEW,
        {
          itemId: itemId(key),
          type: i.type,
          input: {
            reviewId,
            score: clampScore(i.score + u.bias(i)),
            ...(text === undefined ? {} : { text: { text } }),
          },
        },
        "ItemReview",
        { conflictOk: true },
      );
      // Direct write (3): spread reviews over the year.
      const when = daysAgo(
        5 + ((n * 37 + u.key.length * 11) % 330),
        3,
      ).toISOString();
      await db.execute(sql`
        update item_reviews set created_at = ${when}::timestamptz, updated_at = ${when}::timestamptz
         where id = ${reviewId}::uuid
      `);
      count("reviews", true);
    }
  }
};

const friendsOf = (k: DemoUserKey): DemoUserKey[] =>
  FRIENDSHIPS.flatMap(([a, b]) => (a === k ? [b] : b === k ? [a] : []));

type PlannedLog = {
  readonly id: string;
  readonly as: DemoUserKey;
  readonly input: Record<string, unknown>;
};

/** Every drink log, planned up front from a seeded PRNG so ids never move. */
const planLogs = (): PlannedLog[] => {
  const plan: PlannedLog[] = [];
  const types = Object.keys(TYPE_WEIGHTS) as ItemType[];
  const totalWeight = types.reduce((s, t) => s + TYPE_WEIGHTS[t], 0);
  for (const u of USERS) {
    const r = rng(`logs:${u.key}`);
    const friends = friendsOf(u.key);
    for (let n = 0; n < LOG_COUNTS[u.key]; n++) {
      const roll = r() * totalWeight;
      let reached = 0;
      const type =
        types.find((t) => {
          reached += TYPE_WEIGHTS[t];
          return roll < reached;
        }) ?? "BEER";
      const i = pick(
        r,
        ITEMS.filter((x) => x.type === type),
      );
      // A dozen in the last three weeks, so this month's Recap has a deck.
      const day = n < 12 ? 1 + Math.floor(r() * 20) : Math.floor(r() * 420);
      const placeKey = pick(r, TYPE_PLACES[type]);
      const withFriend =
        friends.length > 0 && r() < 0.3 ? pick(r, friends) : undefined;
      const tagged = r() < 0.45;
      const noted = r() < 0.2;
      const scored = r() < 0.85;
      const noise = pick(r, [-0.5, 0, 0, 0, 0.5]);
      const tagPool = TAGS[type];
      const tags = tagged
        ? [...new Set([pick(r, tagPool), pick(r, tagPool)])]
        : undefined;
      plan.push({
        id: demoId(`log:${u.key}:${n}`),
        as: u.key,
        input: {
          item: { id: i.key, type: i.type },
          drankAt: daysAgo(day, 18 + Math.floor(r() * 5)).toISOString(),
          ...(scored ? { score: clampScore(i.score + u.bias(i) + noise) } : {}),
          ...(tags === undefined ? {} : { tags }),
          ...(noted ? { note: pick(r, NOTES) } : {}),
          ...(placeKey === null ? {} : { placeId: placeKey }),
          ...(withFriend === undefined ? {} : { companionIds: [withFriend] }),
        },
      });
    }
  }
  for (const recipe of RECIPES) {
    for (const [n, d] of (recipe.made ?? []).entries()) {
      plan.push({
        id: demoId(`made:${recipe.key}:${n}`),
        as: "me",
        input: {
          recipeId: recipe.key,
          drankAt: daysAgo(d, 2).toISOString(),
          score: 4.5,
        },
      });
    }
  }
  return plan;
};

const stepLogs = async (): Promise<void> => {
  for (const log of planLogs()) {
    if (await exists(sql`select 1 from check_ins where id = ${log.id}::uuid`)) {
      count("drink logs", false);
      continue;
    }
    const raw = log.input as {
      item?: { id: string; type: ItemType };
      placeId?: string;
      recipeId?: string;
      companionIds?: DemoUserKey[];
    };
    const input = {
      ...log.input,
      ...(raw.item === undefined
        ? {}
        : { item: { id: itemId(raw.item.id), type: raw.item.type } }),
      ...(raw.placeId === undefined
        ? {}
        : { placeId: need(ids.place, raw.placeId, "place") }),
      ...(raw.recipeId === undefined
        ? {}
        : { recipeId: need(ids.recipe, raw.recipeId, "recipe") }),
      ...(raw.companionIds === undefined
        ? {}
        : { companionIds: raw.companionIds.map(userId) }),
    };
    await run(log.as, LOG_DRINK, { id: log.id, input }, "LoggedDrinkPayload", {
      conflictOk: true,
    });
    count("drink logs", true);
  }
};

const stepLists = async (): Promise<void> => {
  for (const u of USERS) {
    for (const t of WANT_TO_TRY[u.key]) {
      const target =
        t.item !== undefined
          ? { itemId: itemId(t.item), itemType: item(t.item).type }
          : t.place !== undefined
            ? { placeId: need(ids.place, t.place, "place") }
            : { recipeId: need(ids.recipe, t.recipe ?? "", "recipe") };
      await run(u.key, SET_WANT_TO_TRY, { target }, "SetWantToTryPayload");
      count("want to try (set)", true);
    }
    for (const key of FAVORITES[u.key]) {
      await run(
        u.key,
        SET_FAVORITE,
        { itemId: itemId(key), type: item(key).type },
        "SetFavoritePayload",
      );
      count("favorites (set)", true);
    }
  }
  for (const p of BREW_PREFS) {
    const i = item(p.item);
    await run(
      "me",
      SET_BREW_PREFS,
      {
        itemId: itemId(p.item),
        itemType: i.type,
        doseGrams: p.doseGrams ?? null,
        waterMl: p.waterMl ?? null,
        waterTempC: p.waterTempC ?? null,
        steepSeconds: p.steepSeconds ?? null,
      },
      "SetBrewPrefsPayload",
    );
    count("brew prefs (set)", true);
  }
  for (const kind of PANTRY) {
    await run("me", SET_BAR_PANTRY_ITEM, { kind }, "BarPantryEntry");
    count("pantry (set)", true);
  }
};

const stepRecipes = async (): Promise<void> => {
  for (const r of RECIPES) {
    const owner = userId(r.owner);
    const found = await one<{ id: string }>(
      sql`select id from recipes where created_by_id = ${owner}::uuid and name = ${r.name} order by created_at limit 1`,
    );
    let id = found?.id;
    if (id === undefined) {
      const res = await run(
        r.owner,
        CREATE_RECIPE,
        {
          input: {
            name: r.name,
            description: r.description,
            type: "cocktail",
            privacy: r.privacy,
            difficultyLevel: r.difficulty,
            prepTimeMinutes: r.minutes,
            servingSize: 1,
          },
        },
        "Recipe",
      );
      id = res?.id as string;
    }
    ids.recipe.set(r.key, id);
    count("recipes", found === undefined);
    if (
      !(await exists(
        sql`select 1 from recipe_ingredients where recipe_id = ${id}::uuid`,
      ))
    ) {
      await run(
        r.owner,
        SET_RECIPE_INGREDIENTS,
        {
          recipeId: id,
          ingredients: r.ingredients.map((g) => ({
            kind: g.kind,
            role: g.role,
            ...(g.qty === undefined ? {} : { quantity: g.qty }),
            ...(g.unit === undefined ? {} : { unit: g.unit }),
            newGenericItem: {
              name: g.name,
              category: g.category,
              kind: g.generic,
            },
          })),
        },
        "RecipeIngredientsPayload",
      );
    }
    if (
      !(await exists(
        sql`select 1 from recipe_instructions where recipe_id = ${id}::uuid`,
      ))
    ) {
      await run(
        r.owner,
        SET_RECIPE_INSTRUCTIONS,
        {
          recipeId: id,
          instructions: r.steps.map((s) => ({ instructionText: s })),
        },
        "RecipeInstructionsPayload",
      );
    }
    if (r.loved)
      await run(
        r.owner,
        SET_RECIPE_LOVE,
        { recipeId: id },
        "SetRecipeLovePayload",
      );
  }
};

const stepTierLists = async (): Promise<void> => {
  for (const t of TIER_LISTS) {
    const owner = userId(t.owner);
    const found = await one<{ id: string }>(
      sql`select id from tier_lists where created_by_id = ${owner}::uuid and name = ${t.name} order by created_at limit 1`,
    );
    let id = found?.id;
    if (id === undefined) {
      const res = await run(
        t.owner,
        CREATE_TIER_LIST,
        {
          input: {
            name: t.name,
            description: t.description,
            listType: t.listType,
            privacy: t.privacy,
            startFrom: t.fromRatings ? "RATINGS" : "EMPTY",
          },
        },
        "TierList",
      );
      id = res?.id as string;
    }
    count("tier lists", found === undefined);
    const entries = t.entries ?? [];
    const entryId = (key: string): string =>
      demoId(`tier-entry:${t.key}:${key}`);
    const missing = [];
    for (const [band, key] of entries) {
      if (
        !(await exists(
          sql`select 1 from tier_list_items where id = ${entryId(key)}::uuid`,
        ))
      ) {
        missing.push([band, key] as const);
      }
    }
    if (missing.length > 0) {
      await run(
        t.owner,
        ADD_TIER_LIST_ITEMS,
        {
          tierListId: id,
          input: {
            entries: missing.map(([band, key]) => ({
              band,
              tierListItemId: entryId(key),
              entry:
                t.listType === "place"
                  ? { id: need(ids.place, key, "place"), type: "PLACE" }
                  : { id: itemId(key), type: item(key).type },
            })),
          },
        },
        "AddTierListItemsPayload",
      );
      count("tier list entries", true);
    }
    // Undo history: only on the run that built the list, so a re-run adds no edits.
    if (t.history && missing.length === entries.length && entries.length > 0) {
      const inBand = (b: number): string[] =>
        entries.filter(([band]) => band === b).map(([, k]) => entryId(k));
      const four = inBand(4);
      await run(
        t.owner,
        REORDER_TIER_LIST_BAND,
        { tierListId: id, band: 4, orderedIds: [...four].reverse() },
        "ReorderBandPayload",
      );
      await run(
        t.owner,
        REORDER_TIER_LIST_BAND,
        { tierListId: id, band: 4, orderedIds: four },
        "ReorderBandPayload",
      );
      const promoted = inBand(3)[0];
      if (promoted !== undefined) {
        await run(
          t.owner,
          REORDER_TIER_LIST_BAND,
          { tierListId: id, band: 5, orderedIds: [...inBand(5), promoted] },
          "ReorderBandPayload",
        );
        const h = await call(t.owner, TIER_LIST_HISTORY, { id });
        const seq = h.tierList?.editHistory?.undo?.seq;
        if (typeof seq === "number") {
          await run(
            t.owner,
            UNDO_TIER_LIST_EDIT,
            { tierListId: id, expectedSeq: seq },
            "TierListHistoryStep",
          );
        }
      }
      count("tier list history", true);
    }
  }
};

/* -------------------------------------------------------------------------- */

const report = async (): Promise<void> => {
  const people = USERS.map((u) => userId(u.key));
  const list = sql.join(
    people.map((p) => sql`${p}::uuid`),
    sql`, `,
  );
  const rows = await db.execute<{ what: string; n: string }>(sql`
    select 'cellars' what, count(*)::text n from cellars where created_by_id in (${list})
    union all select 'cellar_items', count(*)::text from cellar_items where created_by in (${list})
    union all select 'check_ins', count(*)::text from check_ins where user_id in (${list})
    union all select 'item_reviews', count(*)::text from item_reviews where user_id in (${list})
    union all select 'want_to_try', count(*)::text from want_to_try where user_id in (${list})
    union all select 'tier_lists', count(*)::text from tier_lists where created_by_id in (${list})
    union all select 'tier_list_items', count(*)::text from tier_list_items t join tier_lists l on l.id = t.tier_list_id where l.created_by_id in (${list})
    union all select 'tier_list_history', count(*)::text from tier_list_history h join tier_lists l on l.id = h.tier_list_id where l.created_by_id in (${list})
    union all select 'recipes', count(*)::text from recipes where created_by_id in (${list})
    union all select 'places', count(*)::text from places where created_by in (${list})
    union all select 'menu_scans', count(*)::text from menu_scans where user_id in (${list})
    union all select 'place_menu_items', count(*)::text from place_menu_items m join menu_scans s on s.id = m.menu_scan_id where s.user_id in (${list})
    union all select 'friends', count(*)::text from friends where user_id in (${list})
    union all select 'bar_pantry_items', count(*)::text from bar_pantry_items where user_id in (${list})
  `);
  console.log("[demo-seed] rows owned by the four demo accounts:");
  for (const r of rows.rows) console.log(`  ${r.what.padEnd(18)} ${r.n}`);
};

const STEPS: readonly [string, () => Promise<void>][] = [
  ["accounts", stepAccounts],
  ["friends", stepFriends],
  ["items", stepItems],
  ["places", stepPlaces],
  ["menu scan", stepMenuScan],
  ["cellars", stepCellars],
  ["reviews", stepReviews],
  ["recipes", stepRecipes],
  ["drink logs", stepLogs],
  ["want to try, favorites, bar", stepLists],
  ["tier lists", stepTierLists],
];

const main = async (): Promise<void> => {
  console.log(`[demo-seed] db ${DATABASE_URL.replace(/:[^:@/]*@/, ":***@")}`);
  console.log(`[demo-seed] auth ${AUTH_URL}  api ${API_URL}  origin ${ORIGIN}`);
  try {
    for (const [name, step] of STEPS) {
      const started = Date.now();
      await step();
      console.log(
        `[demo-seed] ${name} done (${((Date.now() - started) / 1000).toFixed(1)}s)`,
      );
    }
    console.log("[demo-seed] created / already there:");
    for (const [step, t] of tally) {
      console.log(
        `  ${step.padEnd(20)} ${String(t.created).padStart(4)} created  ${String(t.kept).padStart(4)} kept`,
      );
    }
    await report();
    console.log(
      `[demo-seed] done. Sign in as any of: ${USERS.map((u) => u.email).join(", ")} (password ${PASSWORD})`,
    );
  } finally {
    await db.$client.end();
  }
};

await main();
