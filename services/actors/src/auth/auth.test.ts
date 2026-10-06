/**
 * A6 acceptance, hermetically: bcrypt sign-in, the JWT/JWKS pair, and the
 * claim set. Needs the stack's Postgres (`bun run stack:up`, host port 5433).
 */
import { hash as bcryptHash } from "bcryptjs";
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from "jose";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthInstance } from "./auth.ts";
import { isBcryptHash } from "./password.ts";
import { makeTestAuth, resetScratchDatabase } from "./testing.ts";

const DB = "auth_test_signin";
const BASE = "http://localhost:3002";
const PASSWORD = "123456789";

/** The shape `scripts/migrate-users.ts` writes for a password user. */
const seedMigratedUser = async (
  url: string,
  args: {
    id: string;
    email: string;
    passwordHash: string;
    role?: string;
    disabled?: boolean;
    emailVerified?: boolean;
  },
): Promise<void> => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, role, locale, disabled)
       VALUES ($1, $2, $3, $4, now(), now(), $5, 'en', $6)`,
      [
        args.id,
        args.email,
        args.email,
        args.emailVerified ?? true,
        args.role ?? "user",
        args.disabled ?? false,
      ],
    );
    // `account_id` and `user_id` hold the same value here but not the same
    // type — `user_id` is `uuid`, `account_id` is `text` because a social
    // provider's own id is an opaque string. Separate placeholders, or
    // Postgres cannot deduce one type for the parameter.
    await client.query(
      `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'credential', $2, $3, now(), now())`,
      [args.id, args.id, args.passwordHash],
    );
  } finally {
    await client.end();
  }
};

const readPassword = async (url: string, userId: string): Promise<string> => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ password: string }>(
      `SELECT password FROM account WHERE user_id = $1 AND provider_id = 'credential'`,
      [userId],
    );
    const row = rows[0];
    if (row === undefined) throw new Error("no credential account");
    return row.password;
  } finally {
    await client.end();
  }
};

const signIn = (
  auth: AuthInstance,
  email: string,
  password: string,
): Promise<Response> =>
  auth.handler(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );

const sessionCookie = (response: Response): string => {
  const raw = response.headers.getSetCookie();
  return raw.map((c) => c.split(";")[0]).join("; ");
};

describe("better-auth: migrated bcrypt sign-in, JWT and JWKS", () => {
  let url: string;
  let auth: AuthInstance;
  let close: () => Promise<void>;

  const ALICE = "760a436d-a0d5-491c-a45f-f63204ae9bc0";
  const BOB = "eed52e56-6451-47c8-86b5-1f318f0d3a99";
  const ADMIN = "11111111-1111-4111-8111-111111111111";
  const IMPOSTOR = "22222222-2222-4222-8222-222222222222";

  beforeAll(async () => {
    url = await resetScratchDatabase(DB);
    // Cost 10, the same as hasura-auth's.
    const hash = await bcryptHash(PASSWORD, 10);
    expect(isBcryptHash(hash)).toBe(true);
    await seedMigratedUser(url, {
      id: ALICE,
      email: "test@test.com",
      passwordHash: hash,
    });
    await seedMigratedUser(url, {
      id: BOB,
      email: "disabled@test.com",
      passwordHash: hash,
      disabled: true,
    });
    await seedMigratedUser(url, {
      id: ADMIN,
      email: "admin@test.com",
      passwordHash: hash,
      role: "admin",
    });
    // A row whose role column somehow says "system" — see the assertion below.
    await seedMigratedUser(url, {
      id: IMPOSTOR,
      email: "impostor@test.com",
      passwordHash: hash,
      role: "system",
    });

    const created = makeTestAuth(url);
    auth = created.auth;
    close = () => created.pool.end();
  }, 60_000);

  afterAll(async () => {
    await close?.();
  });

  it("signs a migrated user in with their original bcrypt password", async () => {
    const response = await signIn(auth, "test@test.com", PASSWORD);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: { id: string } };
    expect(body.user.id).toBe(ALICE);
  });

  it("rejects the wrong password", async () => {
    const response = await signIn(auth, "test@test.com", "not-the-password");
    expect(response.status).toBe(401);
  });

  it("upgrades the stored hash to scrypt after that sign-in", async () => {
    // `verify` awaits the upgrade before returning, so it has landed by now.
    const stored = await readPassword(url, ALICE);
    expect(isBcryptHash(stored)).toBe(false);
    // …and the user signs in again, now through the scrypt path.
    const again = await signIn(auth, "test@test.com", PASSWORD);
    expect(again.status).toBe(200);
  });

  it("issues a 15-minute JWT that verifies against the JWKS endpoint", async () => {
    const signedIn = await signIn(auth, "admin@test.com", PASSWORD);
    expect(signedIn.status).toBe(200);

    const tokenResponse = await auth.handler(
      new Request(`${BASE}/api/auth/token`, {
        headers: { cookie: sessionCookie(signedIn) },
      }),
    );
    expect(tokenResponse.status).toBe(200);
    const { token } = (await tokenResponse.json()) as { token: string };

    const jwksResponse = await auth.handler(
      new Request(`${BASE}/api/auth/jwks`),
    );
    expect(jwksResponse.status).toBe(200);
    const jwks = (await jwksResponse.json()) as {
      keys: { kid: string; kty: string; alg?: string }[];
    };
    expect(jwks.keys.length).toBeGreaterThan(0);

    // The kid in the token header must resolve inside the published JWKS…
    const header = decodeProtectedHeader(token);
    expect(jwks.keys.some((k) => k.kid === header.kid)).toBe(true);
    // …and no private material may be served.
    for (const key of jwks.keys) {
      expect(key).not.toHaveProperty("d");
      expect(key).not.toHaveProperty("privateKey");
    }

    const { payload } = await jwtVerify(token, createLocalJWKSet(jwks), {
      issuer: BASE,
      audience: BASE,
    });
    expect(payload.sub).toBe(ADMIN);
    expect(payload.email).toBe("admin@test.com");
    expect(payload.role).toBe("admin");
    const lifetime = Number(payload.exp) - Number(payload.iat);
    expect(lifetime).toBe(15 * 60);
  });

  it("cannot express `ctx.kind === 'system'` in a token", async () => {
    const signedIn = await signIn(auth, "impostor@test.com", PASSWORD);
    expect(signedIn.status).toBe(200);
    const tokenResponse = await auth.handler(
      new Request(`${BASE}/api/auth/token`, {
        headers: { cookie: sessionCookie(signedIn) },
      }),
    );
    const { token } = (await tokenResponse.json()) as { token: string };
    const jwks = (await (
      await auth.handler(new Request(`${BASE}/api/auth/jwks`))
    ).json()) as Parameters<typeof createLocalJWKSet>[0];
    const { payload } = await jwtVerify(token, createLocalJWKSet(jwks));

    // The database row says role='system'; the claim collapses to 'user'.
    expect(payload.role).toBe("user");
    expect(payload).not.toHaveProperty("kind");
    // Nothing else leaked from the user row either.
    expect(Object.keys(payload).toSorted()).toEqual(
      [
        "aud",
        "email",
        "emailVerified",
        "exp",
        "iat",
        "iss",
        "role",
        "sub",
      ].toSorted(),
    );
  });

  it("refuses a sign-up body that tries to set its own role", async () => {
    const response = await auth.handler(
      new Request(`${BASE}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "escalate@test.com",
          password: PASSWORD,
          name: "escalate",
          role: "admin",
          disabled: false,
        }),
      }),
    );
    expect(response.status).toBe(200);
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const { rows } = await client.query<{ role: string }>(
        `SELECT role FROM "user" WHERE email = 'escalate@test.com'`,
      );
      expect(rows[0]?.role).toBe("user");
    } finally {
      await client.end();
    }
  });

  it("issues no session for a disabled user", async () => {
    const response = await signIn(auth, "disabled@test.com", PASSWORD);
    expect(response.status).not.toBe(200);
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const { rows } = await client.query(
        `SELECT 1 FROM session WHERE user_id = $1`,
        [BOB],
      );
      expect(rows).toHaveLength(0);
    } finally {
      await client.end();
    }
  });
});
