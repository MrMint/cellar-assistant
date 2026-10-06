/**
 * `AUTH_PASSWORD_MODE` — the three modes, against real better-auth instances
 * over one scratch database, through `auth.handler` (the HTTP router, which is
 * where `disabledPaths` is enforced — `auth.api.*` would bypass it).
 *
 * Needs the stack's Postgres (`bun run stack:up`, host port 5433).
 */
import { hash as bcryptHash } from "bcryptjs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type AuthInstance, PASSWORD_PATHS } from "./auth.ts";
import {
  assertPasswordModeHasSocialFallback,
  PASSWORD_MODES,
  type PasswordMode,
  parsePasswordMode,
  readAuthConfig,
} from "./config.ts";
import { makeTestAuth, resetScratchDatabase } from "./testing.ts";

const DB = "auth_test_password_mode";
const BASE = "http://localhost:3002";
const PASSWORD = "123456789";
const USER_ID = "3f0a6f3e-5d1c-4f43-9e55-0d6b3b1c2a10";
const EMAIL = "legacy-password@test.com";

const post = (
  auth: AuthInstance,
  path: string,
  body: unknown,
  cookie?: string,
): Promise<Response> =>
  auth.handler(
    new Request(`${BASE}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        ...(cookie === undefined ? {} : { cookie }),
      },
      body: JSON.stringify(body),
    }),
  );

const signIn = (auth: AuthInstance, email = EMAIL, password = PASSWORD) =>
  post(auth, "/sign-in/email", { email, password });

const signUp = (auth: AuthInstance, email: string) =>
  post(auth, "/sign-up/email", { email, password: PASSWORD, name: "" });

const cookieOf = (response: Response): string =>
  response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

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

const credentialRow = (url: string) =>
  query<{ id: string; password: string; updated_at: Date }>(
    url,
    `SELECT id, password, updated_at FROM account WHERE user_id = $1 AND provider_id = 'credential'`,
    [USER_ID],
  );

describe("parsePasswordMode", () => {
  it("defaults to enabled when unset or empty, so dev needs no change", () => {
    expect(parsePasswordMode(undefined)).toBe("enabled");
    expect(parsePasswordMode("")).toBe("enabled");
  });

  it("accepts exactly the three modes", () => {
    for (const mode of PASSWORD_MODES)
      expect(parsePasswordMode(mode)).toBe(mode);
  });

  it.each([
    "false",
    "true",
    "Disabled",
    "signin_only",
    "off",
  ])("refuses %j rather than guessing", (raw) => {
    expect(() => parsePasswordMode(raw)).toThrow(/AUTH_PASSWORD_MODE/);
  });
});

describe("assertPasswordModeHasSocialFallback", () => {
  const none = { google: undefined, facebook: undefined, discord: undefined };
  const googleOnly = {
    ...none,
    google: { clientId: "id", clientSecret: "secret" },
  };

  it("refuses to boot `disabled` with no social provider — a total lockout", () => {
    expect(() => assertPasswordModeHasSocialFallback("disabled", none)).toThrow(
      /no social provider is configured/,
    );
  });

  it("warns loudly for `signin-only` with no social provider", () => {
    const warn = vi.fn();
    const message = assertPasswordModeHasSocialFallback(
      "signin-only",
      none,
      warn,
    );
    expect(message).toMatch(/NOBODY can create an account/);
    expect(warn).toHaveBeenCalledWith(message);
  });

  it("is silent when a provider is configured, or when passwords are enabled", () => {
    const warn = vi.fn();
    for (const mode of ["disabled", "signin-only"] as const) {
      expect(
        assertPasswordModeHasSocialFallback(mode, googleOnly, warn),
      ).toBeNull();
    }
    expect(assertPasswordModeHasSocialFallback("enabled", none, warn)).toBe(
      null,
    );
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("readAuthConfig wires AUTH_PASSWORD_MODE", () => {
  const base = {
    NODE_ENV: "test",
    BETTER_AUTH_SECRET: "test-secret-not-used-anywhere-else-000000000",
    AUTH_DATABASE_URL: "postgres://x@localhost/none",
    BETTER_AUTH_URL: "",
    AUTH_TRUSTED_ORIGINS: "",
    AUTH_PROXY_SECRET: "",
    GOOGLE_OAUTH_CLIENT_ID: "",
    GOOGLE_OAUTH_CLIENT_SECRET: "",
    FACEBOOK_OAUTH_CLIENT_ID: "",
    FACEBOOK_OAUTH_CLIENT_SECRET: "",
    DISCORD_OAUTH_CLIENT_ID: "",
    DISCORD_OAUTH_CLIENT_SECRET: "",
  };
  const withEnv = <T>(env: Record<string, string>, fn: () => T): T => {
    for (const [k, v] of Object.entries({ ...base, ...env })) vi.stubEnv(k, v);
    try {
      return fn();
    } finally {
      vi.unstubAllEnvs();
    }
  };

  it("unset reads as enabled", () => {
    expect(
      withEnv({ AUTH_PASSWORD_MODE: "" }, () => readAuthConfig().passwordMode),
    ).toBe("enabled");
  });

  it("refuses to start `disabled` with no provider, and starts with one", () => {
    expect(() =>
      withEnv({ AUTH_PASSWORD_MODE: "disabled" }, () => readAuthConfig()),
    ).toThrow(/no social provider is configured/);
    expect(
      withEnv(
        {
          AUTH_PASSWORD_MODE: "disabled",
          GOOGLE_OAUTH_CLIENT_ID: "id",
          GOOGLE_OAUTH_CLIENT_SECRET: "secret",
        },
        () => readAuthConfig().passwordMode,
      ),
    ).toBe("disabled");
  });

  it("refuses an unknown mode at boot", () => {
    expect(() =>
      withEnv({ AUTH_PASSWORD_MODE: "false" }, () => readAuthConfig()),
    ).toThrow(/AUTH_PASSWORD_MODE must be one of/);
  });
});

describe("AUTH_PASSWORD_MODE against better-auth", () => {
  let url: string;
  const instances = new Map<PasswordMode, AuthInstance>();
  const closers: (() => Promise<void>)[] = [];
  const auth = (mode: PasswordMode): AuthInstance => {
    const instance = instances.get(mode);
    if (instance === undefined) throw new Error(`no instance for ${mode}`);
    return instance;
  };

  beforeAll(async () => {
    url = await resetScratchDatabase(DB);
    // A migrated password user: the shape `scripts/migrate-users.ts` writes.
    const hash = await bcryptHash(PASSWORD, 10);
    await query(
      url,
      `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, role, disabled)
       VALUES ($1, 'legacy', $2, true, now(), now(), 'user', false)`,
      [USER_ID, EMAIL],
    );
    await query(
      url,
      `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'credential', $2, $3, now(), now())`,
      [USER_ID, USER_ID, hash],
    );
    for (const mode of PASSWORD_MODES) {
      // Rehash off, so the stored hash is byte-stable and "untouched" below
      // is a meaningful assertion rather than one the upgrade would break.
      const created = makeTestAuth(url, {
        passwordMode: mode,
        rehashOnSignIn: false,
      });
      instances.set(mode, created.auth);
      closers.push(() => created.pool.end());
    }
  }, 60_000);

  afterAll(async () => {
    for (const close of closers) await close();
  });

  describe("enabled (the default; dev, the shared lane, e2e)", () => {
    it("signs an existing password user in", async () => {
      const response = await signIn(auth("enabled"));
      expect(response.status).toBe(200);
      const body = (await response.json()) as { user: { id: string } };
      expect(body.user.id).toBe(USER_ID);
    });

    it("creates a new password account", async () => {
      const response = await signUp(auth("enabled"), "new-enabled@test.com");
      expect(response.status).toBe(200);
    });
  });

  describe("signin-only (production)", () => {
    it("refuses sign-up and creates no user", async () => {
      const email = "new-signin-only@test.com";
      const response = await signUp(auth("signin-only"), email);
      expect(response.status).toBe(400);
      const rows = await query(url, `SELECT 1 FROM "user" WHERE email = $1`, [
        email,
      ]);
      expect(rows).toEqual([]);
    });

    it("still signs an existing credential user in, to the same user id", async () => {
      const response = await signIn(auth("signin-only"));
      expect(response.status).toBe(200);
      const body = (await response.json()) as { user: { id: string } };
      expect(body.user.id).toBe(USER_ID);
    });

    it("still rejects a wrong password", async () => {
      const response = await signIn(auth("signin-only"), EMAIL, "wrong-pass1");
      expect(response.status).toBe(401);
    });

    it("refuses reset-by-email — no sender is configured in any mode", async () => {
      const response = await post(
        auth("signin-only"),
        "/request-password-reset",
        {
          email: EMAIL,
        },
      );
      expect(response.status).toBe(400);
      const body = (await response.json()) as { code?: string };
      expect(body.code).toBe("RESET_PASSWORD_DISABLED");
    });
  });

  describe("disabled", () => {
    it.each(PASSWORD_PATHS)("refuses %s with 404", async (path) => {
      const response = await post(auth("disabled"), path, {
        email: EMAIL,
        password: PASSWORD,
        currentPassword: PASSWORD,
        newPassword: `${PASSWORD}0`,
        newPassword2: `${PASSWORD}0`,
        token: "x",
        name: "",
      });
      expect(response.status).toBe(404);
    });

    it("refuses change-password even for a session minted elsewhere", async () => {
      // `/change-password` does not consult `emailAndPassword.enabled` in
      // better-auth 1.7.3 — this is what `disabledPaths` is for. The session
      // comes from the `enabled` instance on the same database.
      const session = cookieOf(await signIn(auth("enabled")));
      expect(session).not.toBe("");
      const response = await post(
        auth("disabled"),
        "/change-password",
        { currentPassword: PASSWORD, newPassword: `${PASSWORD}0` },
        session,
      );
      expect(response.status).toBe(404);
    });

    it("leaves the credential account row untouched, so re-enabling restores sign-in", async () => {
      const before = await credentialRow(url);
      expect(before).toHaveLength(1);
      expect((await signIn(auth("disabled"))).status).toBe(404);
      expect(await credentialRow(url)).toEqual(before);
      // Flip back: the same row signs the same user in.
      const restored = await signIn(auth("signin-only"));
      expect(restored.status).toBe(200);
      const body = (await restored.json()) as { user: { id: string } };
      expect(body.user.id).toBe(USER_ID);
    });

    it("still serves the non-password surface (JWKS)", async () => {
      const response = await auth("disabled").handler(
        new Request(`${BASE}/api/auth/jwks`),
      );
      expect(response.status).toBe(200);
    });
  });
});
