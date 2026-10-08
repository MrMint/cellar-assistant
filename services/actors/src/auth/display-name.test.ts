/**
 * F2 (W4 security review): no display name is stored that shows an email
 * address — not at sign-up, not through better-auth's `/update-user`, and not
 * in a row that existed before the rule (the backfill migration).
 *
 * The database halves need the stack's Postgres (`bun run stack:up`, 5433).
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthInstance } from "./auth.ts";
import {
  displayNameForExistingUser,
  displayNameForNewUser,
  displayNameUpdateRefusal,
  EMAIL_SHAPED_SQL,
  isEmailShaped,
} from "./display-name.ts";
import { adminUrl, makeTestAuth, resetScratchDatabase } from "./testing.ts";

const BASE = "http://localhost:3002";
const ORIGIN = "http://localhost:3000";
const PASSWORD = "123456789";
const HANDLE = /^member-[0-9a-f]{6}$/;

const MIGRATIONS = fileURLToPath(
  new URL("../../../../packages/db/migrations/", import.meta.url),
);
const backfillSql = async (): Promise<string> => {
  const name = (await readdir(MIGRATIONS)).find((dir) =>
    dir.endsWith("_display_names_are_not_emails"),
  );
  if (name === undefined) throw new Error("backfill migration not found");
  return readFile(`${MIGRATIONS}${name}/migration.sql`, "utf8");
};

const withClient = async <T>(
  url: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
};

/** Every case the JS rule and the migration's SQL pattern must agree on. */
const CASES: readonly (readonly [string, boolean])[] = [
  ["jane@example.com", true],
  ["JANE@EXAMPLE.COM", true],
  ["Jane <jane@example.com>", true],
  ["contact: jane.doe+cellar@mail.example.co.uk", true],
  ["Jane Doe", false],
  ["@jane", false],
  ["jane@home", false],
  ["a @ b.com", false],
  ["member-3f9a2c", false],
  ["", false],
];

describe("isEmailShaped", () => {
  it.each(CASES)("%j -> %s", (name, shaped) => {
    expect(isEmailShaped(name)).toBe(shaped);
  });
});

describe("displayNameForNewUser", () => {
  it("keeps a chosen name, trimmed", () => {
    expect(displayNameForNewUser("  Jane Doe ")).toBe("Jane Doe");
  });

  it.each([
    ["", "blank"],
    ["   ", "whitespace"],
    ["jane@example.com", "an address"],
    ["Jane <jane@example.com>", "a name with an address in it"],
    [undefined, "absent (an OAuth profile with no name)"],
  ])("gives a neutral handle for %j (%s)", (name, _why) => {
    expect(displayNameForNewUser(name)).toMatch(HANDLE);
  });
});

describe("displayNameUpdateRefusal", () => {
  it("passes an update that does not touch the name", () => {
    expect(displayNameUpdateRefusal(undefined)).toBeNull();
  });
  it("passes an ordinary name", () => {
    expect(displayNameUpdateRefusal("Jane")).toBeNull();
  });
  it.each(["", "  ", "jane@example.com", "Jane <jane@example.com>"])(
    "refuses %j",
    (name) => {
      expect(displayNameUpdateRefusal(name)).not.toBeNull();
    },
  );
});

describe("the backfill migration's pattern", () => {
  it("is EMAIL_SHAPED_SQL, verbatim", async () => {
    expect(await backfillSql()).toContain(EMAIL_SHAPED_SQL);
  });

  it("gives Postgres the same answer as isEmailShaped for every case", async () => {
    await withClient(adminUrl(), async (client) => {
      for (const [name, shaped] of CASES) {
        const { rows } = await client.query<{ m: boolean }>(
          "SELECT $1::text ~ $2::text AS m",
          [name, EMAIL_SHAPED_SQL],
        );
        expect({ name, shaped: rows[0]?.m }).toEqual({ name, shaped });
      }
    });
  });
});

describe("better-auth never stores an email-shaped display name", () => {
  let url: string;
  let auth: AuthInstance;
  let close: () => Promise<void>;

  beforeAll(async () => {
    url = await resetScratchDatabase("auth_test_display_name");
    const created = makeTestAuth(url);
    auth = created.auth;
    close = () => created.pool.end();
  }, 60_000);

  afterAll(async () => {
    await close?.();
  });

  const signUp = (email: string, name: string) =>
    auth.handler(
      new Request(`${BASE}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify({ email, password: PASSWORD, name }),
      }),
    );

  const storedName = (email: string): Promise<string | undefined> =>
    withClient(url, async (client) => {
      const { rows } = await client.query<{ name: string }>(
        `SELECT name FROM "user" WHERE email = $1`,
        [email],
      );
      return rows[0]?.name;
    });

  it.each([
    ["blank@test.com", ""],
    ["own@test.com", "own@test.com"],
    ["shouty@test.com", "SHOUTY@TEST.COM"],
    ["wrapped@test.com", "Wrapped <wrapped@test.com>"],
    ["other@test.com", "someone-else@example.com"],
  ])(
    "sign-up as %s with name %j stores a neutral handle",
    async (email, name) => {
      const response = await signUp(email, name);
      expect(response.status).toBe(200);
      expect(await storedName(email)).toMatch(HANDLE);
      // …and the sign-up response shows the stored name, not the submitted one.
      const body = (await response.json()) as { user: { name: string } };
      expect(body.user.name).toMatch(HANDLE);
    },
  );

  it("keeps a chosen name", async () => {
    expect((await signUp("chosen@test.com", "Chosen One")).status).toBe(200);
    expect(await storedName("chosen@test.com")).toBe("Chosen One");
  });

  it("refuses /update-user naming an address, and leaves the name alone", async () => {
    const signedUp = await signUp("updater@test.com", "Updater");
    const cookie = signedUp.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");

    const refused = await auth.handler(
      new Request(`${BASE}/api/auth/update-user`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN, cookie },
        body: JSON.stringify({ name: "updater@test.com" }),
      }),
    );
    expect(refused.status).toBe(400);
    expect(await storedName("updater@test.com")).toBe("Updater");

    const allowed = await auth.handler(
      new Request(`${BASE}/api/auth/update-user`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN, cookie },
        body: JSON.stringify({ name: "Renamed" }),
      }),
    );
    expect(allowed.status).toBe(200);
    expect(await storedName("updater@test.com")).toBe("Renamed");
  });
});

describe("the backfill migration", () => {
  let url: string;

  const ROWS = [
    // [id, name, email, expected: "handle" | "kept"]
    [
      "a1000000-0000-4000-8000-000000000001",
      "own@test.com",
      "own@test.com",
      "handle",
    ],
    [
      "a1000000-0000-4000-8000-000000000002",
      " OWN2@Test.com ",
      "own2@test.com",
      "handle",
    ],
    ["a1000000-0000-4000-8000-000000000003", "", "blank@test.com", "handle"],
    [
      "a1000000-0000-4000-8000-000000000004",
      "x <other@example.com>",
      "four@test.com",
      "handle",
    ],
    [
      "a1000000-0000-4000-8000-000000000005",
      "Jane Doe",
      "jane@test.com",
      "kept",
    ],
    ["a1000000-0000-4000-8000-000000000006", "@jane", "at@test.com", "kept"],
  ] as const;

  beforeAll(async () => {
    url = await resetScratchDatabase("auth_test_display_backfill");
    await withClient(url, async (client) => {
      for (const [id, name, email] of ROWS) {
        await client.query(
          `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, role, disabled)
           VALUES ($1, $2, $3, true, now(), now(), 'user', false)`,
          [id, name, email],
        );
      }
    });
  }, 60_000);

  const names = (): Promise<Map<string, string>> =>
    withClient(url, async (client) => {
      const { rows } = await client.query<{ id: string; name: string }>(
        `SELECT id, name FROM "user"`,
      );
      return new Map(rows.map((row) => [row.id, row.name]));
    });

  it("rewrites every email-shaped or empty name to the id's handle, and nothing else", async () => {
    const sql = await backfillSql();
    await withClient(url, (client) => client.query(sql));
    const after = await names();
    for (const [id, name, email, expected] of ROWS) {
      const stored = after.get(id);
      if (expected === "kept") expect(stored).toBe(name);
      else expect(stored).toBe(`member-${id.replaceAll("-", "").slice(0, 6)}`);
      // migrate-users.ts applies the same rule in TypeScript; the two agree.
      expect(displayNameForExistingUser({ id, name, email })).toBe(stored);
    }
  });

  it("is a no-op when run again", async () => {
    const before = await names();
    const sql = await backfillSql();
    const touched = await withClient(url, async (client) => {
      const result = await client.query(sql);
      return result.rowCount;
    });
    expect(touched).toBe(0);
    expect(await names()).toEqual(before);
  });
});
