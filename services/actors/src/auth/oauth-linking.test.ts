/**
 * A6 acceptance: each OAuth provider relinks an existing user **by email**
 * instead of creating a duplicate.
 *
 * No live provider credentials are used, and none are needed. Every social
 * callback in better-auth — Google, Facebook, Discord alike — funnels the
 * provider's profile into `handleOAuthUserInfo`, which is the function that
 * decides link-vs-create. The provider-specific half is only "fetch the token,
 * then fetch the profile". So the tests drive `handleOAuthUserInfo` directly
 * with the profile each provider would have returned, once per provider id.
 * What is *not* covered here is the token exchange and the profile fetch,
 * which cannot be exercised without a registered OAuth application.
 */
import { randomUUID } from "node:crypto";
import { handleOAuthUserInfo } from "better-auth/oauth2";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthInstance } from "./auth.ts";
import { makeTestAuth, resetScratchDatabase } from "./testing.ts";

const DB = "auth_test_oauth";
const PROVIDERS = ["google", "facebook", "discord"] as const;

type Ctx = Parameters<typeof handleOAuthUserInfo>[0];

const seedUser = async (
  url: string,
  args: { id: string; email: string; emailVerified: boolean },
): Promise<void> => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, role, disabled)
       VALUES ($1, $2, $3, $4, now(), now(), 'user', false)`,
      [args.id, args.email, args.email, args.emailVerified],
    );
  } finally {
    await client.end();
  }
};

const countUsers = async (url: string, email: string): Promise<number> => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM "user" WHERE lower(email) = lower($1)`,
      [email],
    );
    return Number(rows[0]?.n ?? "0");
  } finally {
    await client.end();
  }
};

const accountsFor = async (
  url: string,
  userId: string,
): Promise<{ provider_id: string; account_id: string }[]> => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{
      provider_id: string;
      account_id: string;
    }>(
      `SELECT provider_id, account_id FROM account WHERE user_id = $1 ORDER BY provider_id`,
      [userId],
    );
    return rows;
  } finally {
    await client.end();
  }
};

describe("OAuth account linking", () => {
  let url: string;
  let auth: AuthInstance;
  let ctx: Ctx;
  let close: () => Promise<void>;

  const call = (args: {
    providerId: string;
    providerUserId: string;
    email: string;
    emailVerified: boolean;
  }) =>
    handleOAuthUserInfo(ctx, {
      userInfo: {
        id: args.providerUserId,
        email: args.email,
        emailVerified: args.emailVerified,
        name: args.email,
        image: null,
      },
      account: {
        providerId: args.providerId,
        accountId: args.providerUserId,
      },
    });

  beforeAll(async () => {
    url = await resetScratchDatabase(DB);
    const created = makeTestAuth(url);
    auth = created.auth;
    close = () => created.pool.end();
    const context = await auth.$context;
    // handleOAuthUserInfo only reaches for `context`; the response helpers are
    // used on paths (redirect on database error, account cookie) that these
    // cases do not take, and `storeAccountCookie` is off by default.
    ctx = {
      context,
      headers: new Headers(),
      request: undefined,
      setHeader: () => {},
      setCookie: () => {},
      json: (value: unknown) => value,
    } as unknown as Ctx;
  }, 60_000);

  afterAll(async () => {
    await close?.();
  });

  for (const provider of PROVIDERS) {
    it(`${provider}: links to the existing user by email instead of creating one`, async () => {
      const id = randomUUID();
      const email = `link-${provider}@test.com`;
      await seedUser(url, { id, email, emailVerified: true });

      const result = await call({
        providerId: provider,
        providerUserId: `${provider}-uid-1`,
        email,
        emailVerified: true,
      });

      expect(result.error).toBeNull();
      expect(result.isRegister).toBe(false);
      expect(result.data?.user.id).toBe(id);
      expect(await countUsers(url, email)).toBe(1);
      expect(await accountsFor(url, id)).toEqual([
        { provider_id: provider, account_id: `${provider}-uid-1` },
      ]);
    });

    it(`${provider}: a second sign-in reuses the same account row`, async () => {
      const email = `link-${provider}@test.com`;
      const before = await countUsers(url, email);
      const result = await call({
        providerId: provider,
        providerUserId: `${provider}-uid-1`,
        email,
        emailVerified: true,
      });
      expect(result.error).toBeNull();
      expect(result.isRegister).toBe(false);
      expect(await countUsers(url, email)).toBe(before);
    });

    it(`${provider}: refuses to link when the provider has not verified the email`, async () => {
      const id = randomUUID();
      const email = `unverified-provider-${provider}@test.com`;
      await seedUser(url, { id, email, emailVerified: true });

      const result = await call({
        providerId: provider,
        providerUserId: `${provider}-uid-2`,
        email,
        emailVerified: false,
      });

      expect(result.error).toBe("account not linked");
      expect(result.data).toBeNull();
      // No duplicate, and no account bound to the untrusted assertion.
      expect(await countUsers(url, email)).toBe(1);
      expect(await accountsFor(url, id)).toEqual([]);
    });

    it(`${provider}: refuses to link into a local account with an unverified email`, async () => {
      // The pre-hijack case: someone registers victim@… with a password and
      // never verifies it; the real owner then signs in with the provider.
      const id = randomUUID();
      const email = `unverified-local-${provider}@test.com`;
      await seedUser(url, { id, email, emailVerified: false });

      const result = await call({
        providerId: provider,
        providerUserId: `${provider}-uid-3`,
        email,
        emailVerified: true,
      });

      expect(result.error).toBe("account not linked");
      expect(await accountsFor(url, id)).toEqual([]);
    });

    it(`${provider}: creates a user when the email is unknown`, async () => {
      const email = `newcomer-${provider}@test.com`;
      const result = await call({
        providerId: provider,
        providerUserId: `${provider}-uid-4`,
        email,
        emailVerified: true,
      });
      expect(result.error).toBeNull();
      expect(result.isRegister).toBe(true);
      expect(await countUsers(url, email)).toBe(1);
    });
  }

  it("links all three providers onto one migrated user", async () => {
    const id = randomUUID();
    const email = "multi@test.com";
    await seedUser(url, { id, email, emailVerified: true });
    for (const provider of PROVIDERS) {
      const result = await call({
        providerId: provider,
        providerUserId: `${provider}-multi`,
        email,
        emailVerified: true,
      });
      expect(result.error).toBeNull();
      expect(result.data?.user.id).toBe(id);
    }
    expect(await countUsers(url, email)).toBe(1);
    expect(await accountsFor(url, id)).toEqual([
      { provider_id: "discord", account_id: "discord-multi" },
      { provider_id: "facebook", account_id: "facebook-multi" },
      { provider_id: "google", account_id: "google-multi" },
    ]);
  });
});
