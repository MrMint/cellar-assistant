import { createCellar, ensureFriends, unique } from "../fixtures/data.ts";
import { deleteCellarWithContents } from "../fixtures/db.ts";
import { ACCOUNTS, expect, test } from "../fixtures/test.ts";

/**
 * X02 · the drink log across people and bottles.
 *
 * 1. A log with a companion writes the companion an entry of their own: it is
 *    in *their* "Your log", says who they drank with, and carries none of the
 *    logger's score or note (that is one person's opinion).
 * 2. Removing the bottle a log was poured from keeps the log (D5: "logs
 *    survive the bottle").
 * 3. The friends feed gets one CHECKED_IN entry per occasion.
 *
 * `test@test.com` and `test2@test.com` are made friends first
 * (`ensureFriends`), as `03-friends` does. One cellar, one tea (the type
 * `createItem` writes without onboarding, as in `11-items`); no places.
 */
test.describe.configure({ mode: "serial" });

let cellarId: string | undefined;
let teaId: string;
let teaName: string;
let bottleId: string;
let logId: string;

test.afterAll(async () => {
  if (cellarId !== undefined) deleteCellarWithContents(cellarId);
});

test("fixtures: friends, a cellar, a tea, a bottle of it", async ({
  api,
  api2,
}) => {
  await ensureFriends(api, api2, ACCOUNTS.primary.id, ACCOUNTS.secondary.id);
  cellarId = await createCellar(api, unique("E2 Log Cellar"), "PRIVATE");

  const ref = await api.query(
    `query { referenceData(kind: TEA_CATEGORY, first: 1) {
       __typename ... on ReferenceRowConnection { edges { node { value } } }
     } }`,
  );
  const category = ref.referenceData.edges[0]?.node.value;
  expect(category, "no tea categories seeded").toBeTruthy();

  teaName = unique("E2 Log Tea");
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
        description: "An e2e tea for the drink log.",
        tea: { category },
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
});

test("a log from the bottle, with a friend: each gets their own entry", async ({
  api,
}) => {
  logId = crypto.randomUUID();
  const logged = await api.query(
    `mutation L($id: ID!, $input: LogDrinkInput!) {
       logDrink(id: $id, input: $input) {
         __typename
         ... on LoggedDrinkPayload { drinkerCount entry { id score note fromCellar companionIds } }
         ... on Error { message }
       }
     }`,
    {
      id: logId,
      input: {
        bottle: { cellarId, cellarItemId: bottleId },
        score: 4.5,
        note: "E2 dark cherry",
        tags: ["Cherry"],
        companionIds: [ACCOUNTS.secondary.id],
      },
    },
  );
  expect(logged.logDrink.__typename, JSON.stringify(logged.logDrink)).toBe(
    "LoggedDrinkPayload",
  );
  expect(logged.logDrink.drinkerCount).toBe(2);
  expect(logged.logDrink.entry).toMatchObject({
    id: logId,
    score: 4.5,
    note: "E2 dark cherry",
    fromCellar: true,
    companionIds: [ACCOUNTS.secondary.id],
  });
});

test("the friend sees it in their own log, without the logger's opinion", async ({
  secondary,
  api2,
}) => {
  const theirs = await api2.query(
    `query Mine($id: ID!) {
       item(type: TEA, id: $id) {
         __typename
         ... on QueryItemSuccess {
           data { checkIns(first: 5, scope: MINE) { edges { node {
             id score note tags companionIds createdById fromCellar
           } } } }
         }
       }
     }`,
    { id: teaId },
  );
  const entries = theirs.item.data.checkIns.edges.map((e: any) => e.node);
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    score: null,
    note: null,
    tags: [],
    companionIds: [ACCOUNTS.primary.id],
    createdById: ACCOUNTS.primary.id,
  });

  await secondary.goto(`/teas/${teaId}`);
  const log = secondary.locator("section", {
    has: secondary.getByRole("heading", { name: "Your log" }),
  });
  await log.scrollIntoViewIfNeeded();
  await expect(log.locator('[data-slot="drink-log-entry"]')).toHaveCount(1, {
    timeout: 20_000,
  });
  await expect(log).toContainText(/with /);
});

test("the feed has the occasion once", async ({ api }) => {
  const data = await api.query(
    `query { me { recentActivity(kinds: [CHECKED_IN], limit: 20, first: 20) {
       edges { node { kind checkIn { id } } }
     } } }`,
  );
  const ids = data.me.recentActivity.edges.map((e: any) => e.node.checkIn?.id);
  expect(ids.filter((id: string) => id === logId)).toHaveLength(1);
});

test("removing the bottle keeps the log (D5)", async ({ api }) => {
  const removed = await api.query(
    `mutation R($cellarId: ID!, $cellarItemId: ID!) {
       removeItemFromCellar(cellarId: $cellarId, cellarItemId: $cellarItemId) {
         __typename ... on Error { message }
       }
     }`,
    { cellarId, cellarItemId: bottleId },
  );
  expect(removed.removeItemFromCellar.__typename).not.toMatch(/Error$/);

  const mine = await api.query(
    `query Mine($id: ID!) {
       item(type: TEA, id: $id) {
         __typename
         ... on QueryItemSuccess {
           data { checkIns(first: 5, scope: MINE) { edges { node { id note fromCellar } } } }
         }
       }
     }`,
    { id: teaId },
  );
  const entries = mine.item.data.checkIns.edges.map((e: any) => e.node);
  expect(entries).toEqual([
    { id: logId, note: "E2 dark cherry", fromCellar: false },
  ]);

  // Undo of the occasion, by its writer: both entries go.
  const deleted = await api.query(
    `mutation D($id: ID!) {
       deleteDrinkLog(id: $id) {
         __typename ... on DeletedDrinkLogPayload { ids } ... on Error { message }
       }
     }`,
    { id: logId },
  );
  expect(deleted.deleteDrinkLog.ids).toHaveLength(2);
});
