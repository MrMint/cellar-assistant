import { randomUUID } from "node:crypto";
import { ACCOUNTS, storageStatePath } from "../../fixtures/accounts.ts";
import {
  ensureFriends,
  ensureNotFriends,
  eventually,
  friendIds,
  unique,
} from "../../fixtures/data.ts";
import { expect, test } from "../../fixtures/mobile.ts";
import { Gql } from "../../fixtures/test.ts";

/**
 * X17 · shared links and invites, on a phone.
 *
 * A link to a PUBLIC tier list opens for someone with no account **at its own
 * URL** (the proxy rewrites, it does not redirect), with a preview card for
 * chat apps; a PRIVATE list and a list that does not exist read exactly the
 * same; signing in from the shared page comes back to it (D19); and an invite
 * link makes its opener a friend.
 *
 * Two tier lists are created through the API and deleted afterwards. No
 * places. The invite leaves the two accounts' friendship as it found it.
 */

const CREATE = `mutation Create($input: CreateTierListInput!) {
  createTierList(input: $input) {
    __typename
    ... on TierList { id }
    ... on Error { message }
  }
}`;

const DELETE = `mutation Delete($id: ID!) {
  deleteTierList(tierListId: $id) { __typename }
}`;

const ENSURE_INVITE = `mutation {
  ensureFriendInvite {
    __typename
    ... on FriendInvite { token }
    ... on Error { message }
  }
}`;

const NOT_SHARED = "Can't open this page";

let publicId = "";
let privateId = "";
let publicName = "";
let inviteToken = "";

const createTierList = async (
  api: Gql,
  name: string,
  privacy: "PUBLIC" | "PRIVATE",
): Promise<string> => {
  const data = await api.query(CREATE, {
    input: { name, privacy, listType: "beer" },
  });
  if (data.createTierList.__typename !== "TierList") {
    throw new Error(`createTierList: ${data.createTierList.message}`);
  }
  return data.createTierList.id;
};

test.beforeAll(async () => {
  const api = await Gql.forAccount("primary");
  try {
    publicName = unique("E2 Shared list");
    publicId = await createTierList(api, publicName, "PUBLIC");
    privateId = await createTierList(api, unique("E2 Private list"), "PRIVATE");
    const invite = (await api.query(ENSURE_INVITE)).ensureFriendInvite;
    if (invite.__typename !== "FriendInvite") {
      throw new Error(`ensureFriendInvite: ${invite.message}`);
    }
    inviteToken = invite.token;
  } finally {
    await api.dispose();
  }
});

test.afterAll(async () => {
  const api = await Gql.forAccount("primary");
  try {
    for (const id of [publicId, privateId].filter((id) => id !== "")) {
      await api.query(DELETE, { id });
    }
  } finally {
    await api.dispose();
  }
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a PUBLIC tier list opens at its own URL, with a preview card", async ({
    page,
    request,
  }) => {
    const response = await page.goto(`/tier-lists/${publicId}`);
    expect(response?.status()).toBe(200);
    // Rewritten, not redirected: the address bar keeps the shared URL.
    await expect(page).toHaveURL(new RegExp(`/tier-lists/${publicId}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: publicName }),
    ).toBeVisible();
    await expect(
      // The byline is "<maker> · <count kind>" ("Test · 3 beers").
      page.getByText(new RegExp(`^${ACCOUNTS.primary.displayName} · \\d+ `)),
    ).toBeVisible();

    const back = encodeURIComponent(`/tier-lists/${publicId}`);
    await expect(
      page.getByRole("link", { name: "Join", exact: true }),
    ).toHaveAttribute("href", `/sign-up?returnTo=${back}`);
    // The join button sits within thumb reach, on screen without scrolling.
    await expect(
      page.getByRole("link", { name: "Join", exact: true }),
    ).toBeInViewport();

    const og = await page
      .locator('meta[property="og:image"]')
      .first()
      .getAttribute("content");
    expect(og, "no og:image on the shared page").toContain(
      `/share/tier-lists/${publicId}/opengraph-image`,
    );
    const card = await request.get(
      new URL(og ?? "", "http://placeholder").pathname +
        new URL(og ?? "", "http://placeholder").search,
    );
    expect(card.status()).toBe(200);
    expect(card.headers()["content-type"]).toContain("image/png");
  });

  test("a PRIVATE list and a missing one read exactly the same, with a 404", async ({
    page,
  }) => {
    const texts: string[] = [];
    for (const id of [privateId, randomUUID()]) {
      const response = await page.goto(`/tier-lists/${id}`);
      expect(response?.status()).toBe(404);
      await expect(
        page.getByRole("heading", { name: NOT_SHARED }),
      ).toBeVisible();
      texts.push(
        (await page.locator("body").innerText()).replaceAll(id, "<id>"),
      );
    }
    expect(texts[0]).toBe(texts[1]);
  });

  test("signing in from a shared list comes back to it", async ({ page }) => {
    await page.goto(`/tier-lists/${publicId}`);
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in\?returnTo=/);
    await page.getByLabel("Email").fill(ACCOUNTS.primary.email);
    await page.getByLabel("Password").fill(ACCOUNTS.primary.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/tier-lists/${publicId}$`), {
      timeout: 30_000,
    });
    await expect(
      page.getByRole("heading", { level: 1, name: publicName }),
    ).toBeVisible();
  });

  test("an invite link names who sent it, and sign-up comes back to it", async ({
    page,
  }) => {
    await page.goto(`/invite/${inviteToken}`);
    await expect(
      page.getByRole("heading", {
        name: `${ACCOUNTS.primary.displayName} invited you`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        `Join to be friends with ${ACCOUNTS.primary.displayName}.`,
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Join", exact: true }),
    ).toHaveAttribute(
      "href",
      `/sign-up?returnTo=${encodeURIComponent(`/invite/${inviteToken}`)}`,
    );
  });

  test("a reset or made-up invite link says it no longer works", async ({
    page,
  }) => {
    const response = await page.goto(`/invite/${"A".repeat(44)}`);
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", {
        name: "This invite link doesn't work any more",
      }),
    ).toBeVisible();
  });
});

test.describe("signed in as the person invited", () => {
  test.use({ storageState: storageStatePath("secondary") });

  test("Add as a friend makes the two of you friends", async ({ page }) => {
    const api = await Gql.forAccount("primary");
    const api2 = await Gql.forAccount("secondary");
    const wereFriends = (await friendIds(api)).includes(ACCOUNTS.secondary.id);
    try {
      await ensureNotFriends(api, ACCOUNTS.secondary.id);
      const name = ACCOUNTS.primary.displayName;

      await page.goto(`/invite/${inviteToken}`);
      await expect(
        page.getByRole("heading", {
          name: `${name} invited you to be friends`,
        }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Accept", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: `You and ${name} are friends` }),
      ).toBeVisible();

      // Both sides, through the outbox: the inviter sees the new friend too.
      // Known red before Shell-Entry, and not the client's: `ensureNotFriends`
      // above enqueues `removeFriendOtherSide`, which can land after this
      // accept and delete the fresh row (services/actors user-actor.ts
      // removeFriend / acceptFriendInvite; outbox order holds only on a first
      // attempt). Handed to the actors owner in the h2 PR.
      await eventually(
        async () => (await friendIds(api)).includes(ACCOUNTS.secondary.id),
        { what: "the invite's friendship to reach the inviter" },
      );
      await page.reload();
      await expect(
        page.getByRole("heading", {
          name: `You and ${name} are already friends`,
        }),
      ).toBeVisible();
    } finally {
      if (wereFriends) {
        await ensureFriends(
          api,
          api2,
          ACCOUNTS.primary.id,
          ACCOUNTS.secondary.id,
        );
      } else {
        await ensureNotFriends(api, ACCOUNTS.secondary.id);
      }
      await api.dispose();
      await api2.dispose();
    }
  });
});
