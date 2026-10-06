/**
 * Social-first production: a migrated **password** user who signs in with a
 * social provider on the same verified email must land in the SAME user row,
 * keeping their data — and their password, which `signin-only` still honours.
 *
 * Unlike `./oauth-linking.test.ts`, which hands `handleOAuthUserInfo` a
 * profile written by hand, these go through each provider's own
 * `getUserInfo` (better-auth 1.7.3, `@better-auth/core/social-providers`), with
 * only the network stubbed. That matters because `emailVerified` — the bit
 * linking turns on — is decided inside `getUserInfo`, per provider:
 *
 *   - Google: the id token's `email_verified` claim.
 *   - Discord: `/users/@me`'s `verified`.
 *   - Facebook: `profile.email_verified ?? false` from Graph `/me`, which
 *     better-auth asks for `id,name,email,picture` only — and Graph's user
 *     node has no `email_verified` field — or a hard-coded `false` on the
 *     id-token path. So Facebook NEVER reports a verified email, and never
 *     links into an existing account by email. Pinned below so a better-auth
 *     upgrade that changes it is noticed. The remedy is not `trustedProviders`
 *     (that would let any Facebook account claim any local account by email);
 *     it is signing in with Google or Discord, or keeping the password.
 *
 * Needs the stack's Postgres (`bun run stack:up`, host port 5433).
 */
import { randomUUID } from "node:crypto";
import { hash as bcryptHash } from "bcryptjs";
import { handleOAuthUserInfo } from "better-auth/oauth2";
import { Client } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { AuthInstance } from "./auth.ts";
import type { PasswordMode } from "./config.ts";
import { makeTestAuth, resetScratchDatabase } from "./testing.ts";

const DB = "auth_test_credential_link";
const PASSWORD = "123456789";

type Ctx = Parameters<typeof handleOAuthUserInfo>[0];
type Context = Awaited<AuthInstance["$context"]>;
type UserInfo = NonNullable<
  Awaited<ReturnType<Context["socialProviders"][number]["getUserInfo"]>>
>;

const query = async <T extends Record<string, unknown>>(
  url: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.end();
  }
};

/** A password user exactly as `scripts/migrate-users.ts` writes one. */
const seedPasswordUser = async (
  url: string,
  email: string,
): Promise<string> => {
  const id = randomUUID();
  await query(
    url,
    `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, role, disabled)
     VALUES ($1, 'legacy', $2, true, now(), now(), 'user', false)`,
    [id, email],
  );
  await query(
    url,
    `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'credential', $2, $3, now(), now())`,
    [id, id, await bcryptHash(PASSWORD, 4)],
  );
  return id;
};

const providersOf = (url: string, userId: string) =>
  query<{ provider_id: string }>(
    url,
    `SELECT provider_id FROM account WHERE user_id = $1 ORDER BY provider_id`,
    [userId],
  ).then((rows) => rows.map((r) => r.provider_id));

const usersWith = (url: string, email: string) =>
  query<{ id: string }>(
    url,
    `SELECT id FROM "user" WHERE lower(email) = lower($1)`,
    [email],
  ).then((rows) => rows.map((r) => r.id));

/** An unsigned JWT — `getUserInfo` only decodes the id token, never verifies it. */
const fakeIdToken = (claims: Record<string, unknown>): string => {
  const part = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "none" })}.${part(claims)}.sig`;
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

/** Stubs exactly the provider endpoints `getUserInfo` calls; anything else fails. */
const stubProviderNetwork = (profiles: {
  discord?: Record<string, unknown>;
  facebook?: Record<string, unknown>;
}) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const href = decodeURIComponent(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (
        href.startsWith("https://discord.com/api/users/@me") &&
        profiles.discord
      ) {
        return json(profiles.discord);
      }
      if (
        href.startsWith("https://graph.facebook.com/debug_token") &&
        profiles.facebook
      ) {
        return json({
          data: {
            is_valid: true,
            app_id: "test-facebook-id",
            user_id: profiles.facebook.id,
          },
        });
      }
      if (
        href.startsWith("https://graph.facebook.com/me") &&
        profiles.facebook
      ) {
        return json(profiles.facebook);
      }
      throw new Error(`unexpected network call in test: ${href}`);
    }),
  );
};

describe.each<PasswordMode>(["signin-only", "disabled"])(
  "migrated password user signs in socially (AUTH_PASSWORD_MODE=%s)",
  (mode) => {
    let url: string;
    let auth: AuthInstance;
    let context: Context;
    let ctx: Ctx;
    let close: () => Promise<void>;

    const userInfoFrom = async (
      providerId: "google" | "discord" | "facebook",
      token: { accessToken?: string; idToken?: string },
    ): Promise<UserInfo> => {
      const provider = context.socialProviders.find((p) => p.id === providerId);
      if (provider === undefined)
        throw new Error(`${providerId} not registered`);
      const info = await provider.getUserInfo({
        ...token,
        tokenType: "Bearer",
      } as Parameters<typeof provider.getUserInfo>[0]);
      if (info === null) throw new Error(`${providerId} returned no user info`);
      return info;
    };

    /**
     * What the callback route does with `getUserInfo`'s result
     * (`api/routes/callback.mjs`): the provider's own user id — the profile's
     * `sub` or `id`, via `resolveOAuthAccountKey` — becomes both
     * `userInfo.id` and the account key. `getUserInfo` itself returns no id.
     */
    const signInWith = (
      providerId: string,
      info: UserInfo,
    ): ReturnType<typeof handleOAuthUserInfo> => {
      const profile = info.data as { id?: unknown; sub?: unknown };
      const accountId = String(profile.sub ?? profile.id);
      return handleOAuthUserInfo(ctx, {
        userInfo: {
          ...info.user,
          id: accountId,
          email: info.user.email ?? "",
          name: info.user.name || "",
        },
        account: { providerId, accountId },
      });
    };

    beforeAll(async () => {
      url = await resetScratchDatabase(`${DB}_${mode.replace("-", "_")}`);
      const created = makeTestAuth(url, { passwordMode: mode });
      auth = created.auth;
      close = () => created.pool.end();
      context = await auth.$context;
      ctx = {
        context,
        headers: new Headers(),
        request: undefined,
        setHeader: () => {},
        setCookie: () => {},
        json: (value: unknown) => value,
      } as unknown as Ctx;
    }, 60_000);

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    afterAll(async () => {
      await close?.();
    });

    it("google: links into the SAME user, keeping the credential account", async () => {
      const email = `pw-google-${mode}@gmail.com`;
      const id = await seedPasswordUser(url, email);
      const info = await userInfoFrom("google", {
        idToken: fakeIdToken({
          sub: "google-sub-1",
          email,
          email_verified: true,
          name: "Legacy User",
        }),
      });
      expect(info.user.emailVerified).toBe(true);

      const result = await signInWith("google", info);

      expect(result.error).toBeNull();
      expect(result.isRegister).toBe(false);
      expect(result.data?.user.id).toBe(id);
      expect(await usersWith(url, email)).toEqual([id]);
      expect(await providersOf(url, id)).toEqual(["credential", "google"]);
    });

    it("discord: links into the SAME user, keeping the credential account", async () => {
      const email = `pw-discord-${mode}@proton.me`;
      const id = await seedPasswordUser(url, email);
      stubProviderNetwork({
        discord: {
          id: "80351110224678912",
          username: "legacy",
          global_name: "Legacy",
          discriminator: "0",
          avatar: null,
          email,
          verified: true,
        },
      });
      const info = await userInfoFrom("discord", { accessToken: "discord-at" });
      expect(info.user.emailVerified).toBe(true);

      const result = await signInWith("discord", info);

      expect(result.error).toBeNull();
      expect(result.isRegister).toBe(false);
      expect(result.data?.user.id).toBe(id);
      expect(await usersWith(url, email)).toEqual([id]);
      expect(await providersOf(url, id)).toEqual(["credential", "discord"]);
    });

    it("discord: an unverified Discord email does NOT take over the password account", async () => {
      const email = `pw-discord-unverified-${mode}@zoho.com`;
      const id = await seedPasswordUser(url, email);
      stubProviderNetwork({
        discord: {
          id: "80351110224678913",
          username: "squatter",
          discriminator: "0",
          avatar: null,
          email,
          verified: false,
        },
      });
      const result = await signInWith(
        "discord",
        await userInfoFrom("discord", { accessToken: "discord-at" }),
      );
      expect(result.error).toBe("account not linked");
      expect(await providersOf(url, id)).toEqual(["credential"]);
    });

    it("facebook: better-auth reports the email as unverified, so it does NOT link", async () => {
      const email = `pw-facebook-${mode}@yahoo.com`;
      const id = await seedPasswordUser(url, email);
      // What Graph `/me?fields=id,name,email,picture` returns: no
      // `email_verified`, because it was not asked for and does not exist.
      stubProviderNetwork({
        facebook: {
          id: "10229999999999999",
          name: "Legacy User",
          email,
          picture: { data: { url: "https://example.invalid/p.png" } },
        },
      });
      const viaGraph = await userInfoFrom("facebook", { accessToken: "fb-at" });
      expect(viaGraph.user.emailVerified).toBe(false);
      // …and the id-token (Limited Login) path hard-codes `false`.
      const viaIdToken = await userInfoFrom("facebook", {
        idToken: fakeIdToken({ sub: "10229999999999999", email, name: "x" }),
      });
      expect(viaIdToken.user.emailVerified).toBe(false);

      const result = await signInWith("facebook", viaGraph);
      expect(result.error).toBe("account not linked");
      expect(await usersWith(url, email)).toEqual([id]);
      expect(await providersOf(url, id)).toEqual(["credential"]);
    });
  },
);
