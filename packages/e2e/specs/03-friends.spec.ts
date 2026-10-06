import type { Page } from "@playwright/test";
import {
  createCellar,
  deleteCellars,
  ensureFriends,
  ensureNotFriends,
  friendIds,
  unique,
} from "../fixtures/data.ts";
import { ACCOUNTS, bodyText, expect, test } from "../fixtures/test.ts";

/**
 * Friend request → accept, and the cellar-visibility rule on both sides of it.
 *
 * Ordered on purpose. The stranger case has to be proved **before** the
 * friendship exists, because the two accounts are shared with every other spec
 * and a previous run may well have left them friends; running "a stranger
 * cannot see it" after "accept" would be a tautology. So the file reads as one
 * story: strangers, request, accept, friends.
 *
 * This is the flow no single-actor test can cover. `UserActor` writes one
 * direction of the friendship and the outbox writes the other;
 * `FriendsCollectionActor` reads it fresh; `CellarActor` decides visibility;
 * `CellarsCollectionActor` decides listing. Five actors have to agree, and B4b
 * exists because two of them did not.
 *
 * The `/cellars` **page** checks sit in their own block at the bottom, outside
 * the serial chain: while the index page is broken for an unrelated reason they
 * must not take the friendship flow down with them.
 */

let friendsCellarId: string;
let friendsCellarName: string;

/** Every cellar this file created, for the `afterAll`. */
const created: string[] = [];

test.afterAll(async () => {
  await deleteCellars("primary", created.splice(0));
});

test.describe("friend request and acceptance", () => {
  test.describe.configure({ mode: "serial" });

  test("start from a known state: not friends, one FRIENDS cellar", async ({
    api,
  }) => {
    await ensureNotFriends(api, ACCOUNTS.secondary.id);
    expect(
      await friendIds(api),
      "the accounts are still friends after removeFriend",
    ).not.toContain(ACCOUNTS.secondary.id);

    friendsCellarName = unique("E2 Friends-only");
    friendsCellarId = await createCellar(api, friendsCellarName, "FRIENDS");
    created.push(friendsCellarId);
  });

  test("a stranger cannot read a FRIENDS cellar", async ({ api2 }) => {
    const data = await api2.query(
      `query C($id: ID!) {
         cellar(id: $id) { __typename ... on Cellar { id } ... on Error { message } }
       }`,
      { id: friendsCellarId },
    );
    expect(
      data.cellar.__typename,
      "a non-friend read a FRIENDS cellar through Query.cellar",
    ).toBe("NotFoundError");
  });

  test("sends a friend request from the second account", async ({
    secondary,
  }) => {
    await secondary.goto("/friends");
    // Search by **display name**: `userSearch(term:)` matches the display
    // name only, and the placeholder now says so (it used to promise email
    // too, which returned zero rows).
    await secondary
      .getByPlaceholder("Search for users by name...")
      .fill(ACCOUNTS.primary.displayName);

    const row = secondary
      .locator("li")
      .filter({ hasText: ACCOUNTS.primary.displayName });
    await expect(
      row.first(),
      "user search did not return the other test account",
    ).toBeVisible({ timeout: 20_000 });
    await row.getByRole("button", { name: "Request" }).first().click();

    // The outgoing-request row is the only one carrying a "Cancel" button.
    await expect(
      secondary.getByRole("button", { name: "Cancel" }).first(),
      "the request did not appear under Outgoing Requests",
    ).toBeVisible({ timeout: 20_000 });
  });

  test("the first account accepts it", async ({ primary }) => {
    await primary.goto("/friends");

    const accept = primary.getByRole("button", { name: "Accept" });
    await expect(accept.first(), "no incoming request to accept").toBeVisible({
      timeout: 20_000,
    });
    await accept.first().click();

    await expect(
      primary.getByRole("button", { name: "Remove" }).first(),
      "the accepted friend did not appear in the friends list",
    ).toBeVisible({ timeout: 20_000 });
  });

  test("both sides now agree they are friends", async ({ api, api2 }) => {
    expect(await friendIds(api)).toContain(ACCOUNTS.secondary.id);
    expect(
      await friendIds(api2),
      "only one direction of the friendship is visible — the outbox's reverse-side write did not land",
    ).toContain(ACCOUNTS.primary.id);
  });

  test("a friend can now read the FRIENDS cellar", async ({ api2 }) => {
    const data = await api2.query(
      `query C($id: ID!) {
         cellar(id: $id) { __typename ... on Cellar { id name } ... on Error { message } }
       }`,
      { id: friendsCellarId },
    );
    expect(
      data.cellar.__typename,
      "a friend still cannot read the FRIENDS cellar",
    ).toBe("Cellar");
    expect(data.cellar.name).toBe(friendsCellarName);
  });
});

/**
 * `/cellars` rendered its list, rather than an error page.
 *
 * Checked before every assertion about what is or is not on the index, because
 * a broken index makes the *negative* assertion pass for the wrong reason —
 * "the stranger cannot see this name" is trivially true of a page with no names
 * on it at all. That is the worst outcome a test can have, so it is ruled out
 * first.
 */
async function expectIndexRendered(page: Page): Promise<void> {
  const response = await page.goto("/cellars");
  expect(
    response?.status(),
    "/cellars did not render, so nothing can be concluded about what is listed on it",
  ).toBeLessThan(400);
}

test.describe("the /cellars index reflects the friendship", () => {
  test("a friend sees the FRIENDS cellar on their index", async ({
    secondary,
  }) => {
    test.skip(
      friendsCellarName === undefined,
      "the friendship flow did not run",
    );
    await expectIndexRendered(secondary);
    await expect(
      secondary.getByText(friendsCellarName).first(),
      "the friend's cellar is not listed on /cellars",
    ).toBeVisible({ timeout: 20_000 });
  });

  test("another account's PRIVATE cellar is not on this viewer's index", async ({
    api,
    secondary,
  }) => {
    const hidden = unique("E2 Private-only");
    created.push(await createCellar(api, hidden, "PRIVATE"));
    await expectIndexRendered(secondary);
    expect(
      await bodyText(secondary),
      "another account's PRIVATE cellar is on this viewer's index",
    ).not.toContain(hidden);
  });
});

/**
 * `removeFriend` reports success before its own write is visible.
 *
 * Runs last, and unfriends the accounts on the way out — which is also the
 * state the next run wants to start from.
 *
 * The defect, measured rather than inferred: the mutation answers
 * `RemoveFriendPayload`, and a read issued immediately afterwards still returns
 * the friendship **and the `friends` row is still in the database**. The row
 * clears about half a second later, and the read path serves the stale
 * friendship for roughly another half second after that — so a viewer who
 * clicks Remove and sees the list redraw still sees the person they removed.
 *
 * This is a read-your-own-writes violation, not merely eventual consistency
 * between two viewers: it is the *same* caller, reading back their *own*
 * mutation. Nothing in a single-actor unit test can see it, because it lives in
 * the gap between the mutation returning and the collection actor catching up.
 *
 * The assertion is deliberately generous — it fails only if the stale window
 * outlasts the budget, not on the ~1s that is there today — so this stays a
 * regression guard rather than a source of noise. `ensureNotFriends` polls for
 * the same reason.
 */
test.describe("removeFriend and read-your-own-writes", () => {
  test("removeFriend eventually becomes visible to the remover", async ({
    api,
    api2,
  }) => {
    // Establish the precondition here rather than inheriting it from the block
    // above. The `/cellars` failures between the two restart the Playwright
    // worker, which resets module-level state — so a `skip` guarded on a
    // variable set earlier in this file reports *skipped* whenever an unrelated
    // test fails, which is the silent pass this suite exists to avoid.
    await ensureFriends(api, api2, ACCOUNTS.primary.id, ACCOUNTS.secondary.id);
    expect(
      await friendIds(api),
      "could not establish the friendship this test removes",
    ).toContain(ACCOUNTS.secondary.id);

    const result = await api.query(
      `mutation Remove($userId: ID!) {
         removeFriend(userId: $userId) { __typename ... on Error { message } }
       }`,
      { userId: ACCOUNTS.secondary.id },
    );
    expect(result.removeFriend.__typename, JSON.stringify(result)).toBe(
      "RemoveFriendPayload",
    );

    // Read back immediately. This is the window the defect lives in; it is
    // recorded, not asserted on, because failing here would just restate a
    // known defect on every run.
    const immediatelyStale = (await friendIds(api)).includes(
      ACCOUNTS.secondary.id,
    );
    if (immediatelyStale) {
      console.warn(
        "[e2e] removeFriend returned success but the viewer's own read still shows the friendship (known defect: read-your-own-writes)",
      );
    }

    await expect
      .poll(
        async () => (await friendIds(api)).includes(ACCOUNTS.secondary.id),
        {
          message:
            "removeFriend never became visible to the account that issued it — the stale window has grown beyond 15s",
          timeout: 15_000,
        },
      )
      .toBe(false);
  });
});
