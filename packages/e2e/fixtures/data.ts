import type { AccountKey } from "./accounts.ts";
import { Gql } from "./test.ts";

/** A name nothing else in the database will collide with. */
export const unique = (prefix: string): string =>
  `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Create a cellar through the API, for tests whose *subject* is something else.
 *
 * `02-cellars.spec.ts` creates one through the form — that is the flow under
 * test there. Everywhere else a cellar is a precondition, and driving four
 * form fields to get one makes a friend-visibility failure look like a cellar
 * failure.
 */
export async function createCellar(
  api: Gql,
  name: string,
  privacy: "PRIVATE" | "FRIENDS" | "PUBLIC",
): Promise<string> {
  const data = await api.query(
    `mutation Create($input: CreateCellarInput!) {
       createCellar(input: $input) {
         __typename
         ... on Cellar { id name }
         ... on Error { message }
       }
     }`,
    { input: { name, privacy } },
  );
  const result = data.createCellar;
  if (result.__typename !== "Cellar") {
    throw new Error(`createCellar: ${result.__typename}: ${result.message}`);
  }
  return result.id;
}

/**
 * Delete the cellars a spec created, through `deleteCellar`, as the account
 * that created them. For a `test.afterAll`, which has no `api` fixture (that
 * one is test-scoped), so it opens its own session.
 *
 * ## Why every spec that creates a cellar calls this
 *
 * Nothing used to. By 2026-09-28 `test@test.com` owned 423 cellars, every one
 * an e2e leftover, and each `myCellars(first: 100)` — the "add to cellar"
 * control, and `/cellars` — fanned out to 100 `CellarActor.get` calls. That
 * fan-out is what made the app channel's keep-alive race
 * (`services/actors/src/lib/app-channel-connections.ts`) land as a failed
 * e2e test, and it grew by five cellars a run.
 *
 * Throws unless every cellar is gone, and "gone" means `DeletedCellar`: a
 * `NotFoundError` from the wrong account, or a `ConflictError` from a cellar
 * that still holds items, is a leak, not a clean teardown. A cellar that holds
 * items has no API path to empty it — use `deleteCellarWithContents`
 * (`./db.ts`) for that.
 */
export async function deleteCellars(
  account: AccountKey,
  cellarIds: readonly string[],
): Promise<void> {
  if (cellarIds.length === 0) return;
  const api = await Gql.forAccount(account);
  try {
    const leaked: string[] = [];
    for (const cellarId of cellarIds) {
      const data = await api.query(
        `mutation Delete($cellarId: ID!) {
           deleteCellar(cellarId: $cellarId) {
             __typename
             ... on Error { message }
           }
         }`,
        { cellarId },
      );
      const result = data.deleteCellar;
      if (result.__typename !== "DeletedCellar") {
        leaked.push(`${cellarId}: ${result.__typename}: ${result.message}`);
      }
    }
    if (leaked.length > 0) {
      throw new Error(
        `deleteCellars left cellars behind:\n${leaked.join("\n")}`,
      );
    }
  } finally {
    await api.dispose();
  }
}

/** The viewer's friendship state, as the *collection* actor sees it. */
export async function friendIds(api: Gql): Promise<string[]> {
  const data = await api.query(
    `query { myFriends(first: 50) {
       __typename
       ... on FriendConnection { edges { node { user { id } } } }
     } }`,
  );
  const conn = data.myFriends;
  return conn.__typename === "FriendConnection"
    ? conn.edges.map((e: any) => e.node.user.id)
    : [];
}

/**
 * Put the two accounts in a known "not friends" state.
 *
 * Through the API rather than `delete from friends`: a raw SQL delete against a
 * table `UserActor` owns is exactly the case §1.3's caching rule assumes away,
 * and D5 already produced one false staleness report that way. Going through
 * `removeFriend` also exercises the outbox's reverse-side delete, which is
 * where B4b's staleness bug lived.
 */
export async function ensureNotFriends(
  api: Gql,
  otherUserId: string,
): Promise<void> {
  if (!(await friendIds(api)).includes(otherUserId)) return;
  await api.query(
    `mutation Remove($userId: ID!) {
       removeFriend(userId: $userId) {
         __typename
         ... on Error { message }
       }
     }`,
    { userId: otherUserId },
  );
  // `removeFriend` does not read your own write back — see E2's defect list.
  // It answers `RemoveFriendPayload` while the `friends` row is *still there*
  // (measured: row present on the read immediately after the success reply,
  // gone ~0.5s later, and the read path keeps serving the friendship for about
  // another 0.5s after that). Converges in ~1s.
  //
  // Polling here is a statement about the *fixture*, not an excuse for the
  // defect: this helper's job is to establish a precondition, and a precondition
  // that fails on a known 1s lag makes every downstream friendship test look
  // broken for the wrong reason. The lag itself is asserted as a defect in
  // `specs/03-friends.spec.ts`, where it is the subject rather than the setup.
  await eventually(async () => !(await friendIds(api)).includes(otherUserId), {
    what: "removeFriend to become visible to the viewer's own read",
    timeoutMs: 15_000,
  });
}

/**
 * Put the two accounts in a known "friends" state, from either side.
 *
 * Needed because module-level state does not survive a worker restart, and
 * Playwright restarts the worker after a failing test — so a spec that sets a
 * variable in one test and reads it in another silently loses it the moment an
 * *unrelated* test in the same file fails. A precondition helper that
 * establishes the state itself is immune to that.
 */
export async function ensureFriends(
  api: Gql,
  api2: Gql,
  viewerId: string,
  otherUserId: string,
): Promise<void> {
  if ((await friendIds(api)).includes(otherUserId)) return;

  await api2.query(
    `mutation Send($userId: ID!) {
       sendFriendRequest(userId: $userId) {
         __typename
         ... on Error { message }
       }
     }`,
    { userId: viewerId },
  );

  const requestId = await eventually(
    async () => {
      const data = await api.query(
        `query { myFriendRequests(first: 20, direction: INCOMING) {
           __typename
           ... on FriendRequestConnection { edges { node { id } } }
         } }`,
      );
      const conn = data.myFriendRequests;
      if (conn.__typename !== "FriendRequestConnection") return null;
      return conn.edges[0]?.node.id ?? null;
    },
    { what: "the friend request to become visible to its recipient" },
  );

  await api.query(
    `mutation Accept($requestId: ID!) {
       acceptFriendRequest(requestId: $requestId) {
         __typename
         ... on Error { message }
       }
     }`,
    { requestId },
  );

  await eventually(async () => (await friendIds(api)).includes(otherUserId), {
    what: "the accepted friendship to become visible",
  });
}

/** Poll until `check` passes or the budget runs out. For outbox-written rows. */
export async function eventually<T>(
  check: () => Promise<T | null>,
  { timeoutMs = 30_000, intervalMs = 750, what = "condition" } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value !== null && value !== undefined && value !== false)
        return value;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(
    `timed out after ${timeoutMs}ms waiting for ${what}${last ? `; last error: ${last}` : ""}`,
  );
}
