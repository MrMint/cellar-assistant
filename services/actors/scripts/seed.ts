/**
 * `bun run db:seed` — A9. Replaces `nhost up --apply-seeds` for the new stack.
 *
 *   DATABASE_URL=postgres://cellar:cellar@localhost:5433/cellar \
 *   BETTER_AUTH_URL=http://localhost:3002 \
 *   node scripts/seed.ts
 *
 * Two things, in order:
 *
 *   1. **Reference data** — inserts the ten §4 reference tables
 *      (`ReferenceDataActor`'s ten kinds) from `./reference-data.json`.
 *   2. **The two test accounts** — `test@test.com` / `test2@test.com`,
 *      password `123456789`, created through better-auth's `/api/auth/*`
 *      HTTP API on the running `actors` service, so their password hashes are
 *      native scrypt (`src/auth/auth.ts`) rather than a bcrypt string pasted
 *      into `account.password` by this script. This is why step 2 needs the
 *      `actors` container up (`bun run stack:up`) and step 1 does not — it talks
 *      to Postgres directly.
 *
 * Both steps are idempotent: reference rows insert `ON CONFLICT (value) DO
 * NOTHING`, and a sign-up for an email that already exists is treated as
 * "already seeded", not an error. Re-running this script is always safe.
 *
 * ## Why the reference data is not read from `nhost/seeds/default/*.sql`
 *
 * That is where the migration plan (§6 A9) says to read it from, and it is
 * wrong for this repository: `nhost/seeds/default/*.sql` holds sample
 * fixture data (a couple of test cellars and items) and has never held the
 * ten reference tables. Their rows were inserted by *migrations*
 * (`nhost/migrations/default/*_insert_into_public_*​/up.sql` and similar —
 * `country`, `wine_variety`, `beer_style`, … each got their rows from a
 * one-off `INSERT` migration, not a seed file), which is also why
 * `packages/db/transform/run.sh`'s **schema-only** dump of local Nhost
 * carries the ten tables' *shape* across but none of their *rows* — schema-only
 * dumps never include data, regardless of how the live database came to hold
 * it. `reference-data.json` is a point-in-time export of local Nhost's actual
 * `SELECT value, comment FROM <table> ORDER BY value` for all ten tables
 * (197 countries, 55 wine varieties, … — see the migration plan's own
 * "`country` (197 rows)" aside), captured once so this script — and every
 * later environment that runs it — has no runtime dependency on Nhost still
 * existing. Do not regenerate it from `nhost/seeds/`; there is nothing there
 * to regenerate it from.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  beerStyle,
  coffeeCultivar,
  country,
  createDb,
  sakeCategory,
  sakeRiceVariety,
  sakeType,
  spiritType,
  teaCategory,
  wineStyle,
  wineVariety,
} from "@cellar-assistant/db";
import { sql } from "@cellar-assistant/db/orm";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://cellar:cellar@localhost:5433/cellar";
const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3002";
const TEST_PASSWORD = "123456789";

/**
 * The two development accounts, with **fixed ids**.
 *
 * The ids are the ones these accounts have had since Nhost — `migrate-users.ts`
 * preserves a user's uuid, so a migrated environment and a seeded one now agree.
 * They are pinned because things outside this script name them: `packages/e2e/fixtures/
 * accounts.ts` asserts on `ACCOUNTS.secondary.id` in the friends flow, and D2's
 * hand-inserted `cellar.auth.users` rows (which X2 removed the need for) carried
 * exactly these values. A random id per `db:seed` would make every such fixture
 * a coin toss.
 *
 * better-auth mints its own id on sign-up and there is no hook to seed one, so
 * `pinId` below moves the row afterwards — see its comment.
 */
const TEST_ACCOUNTS = [
  {
    email: "test@test.com",
    name: "Test",
    id: "760a436d-a0d5-491c-a45f-f63204ae9bc0",
  },
  {
    email: "test2@test.com",
    name: "Test Two",
    id: "eed52e56-6451-47c8-86b5-1f318f0d3a99",
  },
] as const;

type ReferenceKind =
  | "beer_style"
  | "coffee_cultivar"
  | "country"
  | "sake_category"
  | "sake_rice_variety"
  | "sake_type"
  | "spirit_type"
  | "tea_category"
  | "wine_style"
  | "wine_variety";

type ReferenceRow = { value: string; comment: string | null };

const REFERENCE_DATA_FILE = fileURLToPath(
  new URL("./reference-data.json", import.meta.url),
);

const loadReferenceData = (): Record<ReferenceKind, ReferenceRow[]> =>
  JSON.parse(readFileSync(REFERENCE_DATA_FILE, "utf8"));

/* -------------------------------------------------------------------------- */
/* Step 1 — reference data                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One switch branch per table, matching `ReferenceDataActor`'s own
 * `selectRows` — see that file's comment for why this is a switch and not a
 * `Record<ReferenceKind, PgTable>` lookup (Drizzle's insert overloads cannot
 * resolve a single `.values()` call against a union table type).
 */
const insertReferenceRows = (
  db: ReturnType<typeof createDb>,
  kind: ReferenceKind,
  rows: ReferenceRow[],
): Promise<unknown> => {
  if (rows.length === 0) return Promise.resolve();
  switch (kind) {
    case "beer_style":
      return db.insert(beerStyle).values(rows).onConflictDoNothing();
    case "coffee_cultivar":
      return db.insert(coffeeCultivar).values(rows).onConflictDoNothing();
    case "country":
      return db.insert(country).values(rows).onConflictDoNothing();
    case "sake_category":
      return db.insert(sakeCategory).values(rows).onConflictDoNothing();
    case "sake_rice_variety":
      return db.insert(sakeRiceVariety).values(rows).onConflictDoNothing();
    case "sake_type":
      return db.insert(sakeType).values(rows).onConflictDoNothing();
    case "spirit_type":
      return db.insert(spiritType).values(rows).onConflictDoNothing();
    case "tea_category":
      return db.insert(teaCategory).values(rows).onConflictDoNothing();
    case "wine_style":
      return db.insert(wineStyle).values(rows).onConflictDoNothing();
    case "wine_variety":
      return db.insert(wineVariety).values(rows).onConflictDoNothing();
  }
};

const seedReferenceData = async (): Promise<void> => {
  const db = createDb(DATABASE_URL);
  try {
    const data = loadReferenceData();
    console.log("[seed] reference data:");
    for (const kind of Object.keys(data) as ReferenceKind[]) {
      const rows = data[kind];
      await insertReferenceRows(db, kind, rows);
      console.log(`  ${kind.padEnd(18)} ${rows.length} row(s)`);
    }
  } finally {
    await db.$client.end();
  }
};

/* -------------------------------------------------------------------------- */
/* Step 2 — test accounts, through better-auth's API                          */
/* -------------------------------------------------------------------------- */

/** Retries until the actors service answers, or gives up. A fresh
 * `docker compose up -d` can take a few seconds to become reachable. */
const waitForAuth = async (
  timeoutMs = 60_000,
  intervalMs = 1_000,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BETTER_AUTH_URL}/api/auth/jwks`);
      if (response.ok) return;
      lastError = new Error(`GET /api/auth/jwks -> ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(
    `[seed] ${BETTER_AUTH_URL} never became reachable: ${String(lastError)}\n` +
      "Is the actors service up? (`bun run stack:up`)",
  );
};

const looksLikeAlreadyExists = (body: string): boolean =>
  /already exists/i.test(body) || /ALREADY_EXISTS/.test(body);

/**
 * better-auth refuses a state-changing request with no `Origin` header
 * (`MISSING_OR_NULL_ORIGIN` — the CSRF check every browser request carries for
 * free) — a plain server-side `fetch` does not send one, so this script sends
 * the first configured trusted origin itself. Must match an entry in
 * `AUTH_TRUSTED_ORIGINS` (`src/auth/config.ts`); the compose default is
 * `http://localhost:3000`, the frontend's own origin.
 */
const TRUSTED_ORIGIN =
  process.env.AUTH_TRUSTED_ORIGIN ?? "http://localhost:3000";

const signUp = async (
  email: string,
  name: string,
): Promise<"created" | "already-exists"> => {
  const response = await fetch(`${BETTER_AUTH_URL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: TRUSTED_ORIGIN,
    },
    body: JSON.stringify({ email, password: TEST_PASSWORD, name }),
  });
  if (response.ok) return "created";

  const body = await response.text();
  if (looksLikeAlreadyExists(body)) return "already-exists";
  throw new Error(
    `[seed] sign-up for ${email} failed (${response.status}): ${body}`,
  );
};

/**
 * Move a freshly signed-up account onto its fixed id.
 *
 * better-auth generates the id (`advanced.database.generateId` in
 * `src/auth/auth.ts`) and offers no way to supply one, so the row is created and
 * then moved. Delete-and-reinsert rather than `UPDATE "user" SET id = …`,
 * because `account.user_id` and `session.user_id` have no `ON UPDATE CASCADE`
 * and the check fires at the end of the statement that moved the parent.
 *
 * Safe precisely because the account is seconds old: the only rows referencing
 * it are its own `account` and `session`, and the 31 domain foreign keys point
 * at nothing yet. The scrypt hash better-auth just computed is carried across
 * verbatim, so this changes the row's id and nothing else — sign-in still goes
 * through the same verifier with the same hash.
 *
 * A no-op when the id is already right, which is what makes re-running safe.
 */
const pinId = async (
  db: ReturnType<typeof createDb>,
  email: string,
  wanted: string,
): Promise<"pinned" | "already"> => {
  const current = await db.execute<{
    id: string;
    name: string;
    email_verified: boolean;
    role: string;
    locale: string | null;
    disabled: boolean;
    password: string | null;
  }>(sql`
    select u.id, u.name, u.email_verified, u.role, u.locale, u.disabled,
           a.password
      from "user" u
      left join account a
        on a.user_id = u.id and a.provider_id = 'credential'
     where u.email = ${email}
  `);
  const row = current.rows[0];
  if (row === undefined) throw new Error(`[seed] no user row for ${email}`);
  if (row.id === wanted) return "already";

  await db.transaction(async (tx) => {
    await tx.execute(sql`delete from "user" where id = ${row.id}::uuid`);
    await tx.execute(sql`
      insert into "user" (id, name, email, email_verified, role, locale, disabled)
      values (${wanted}::uuid, ${row.name}, ${email}, ${row.email_verified},
              ${row.role}, ${row.locale}, ${row.disabled})
    `);
    await tx.execute(sql`
      insert into account (id, account_id, provider_id, user_id, password, updated_at)
      values (gen_random_uuid(), ${wanted}, 'credential', ${wanted}::uuid,
              ${row.password}, now())
    `);
  });
  return "pinned";
};

/**
 * Give an existing account its fixture display name.
 *
 * `signUp` sets the name only when it *creates* the account; an account that
 * already existed keeps whatever it had. That used to be harmless, and it hid
 * a coincidence: the shared stack's two accounts came across from Nhost named
 * `test@test.com` / `test2@test.com`, and `packages/e2e`'s friends spec
 * searches for `ACCOUNTS.primary.displayName` ("Test"), which an email
 * happens to contain. The display-name backfill
 * (`packages/db/migrations/…_display_names_are_not_emails`) renames exactly
 * those rows to a neutral `member-…` handle, so a re-seed has to put the
 * fixture names back or the search finds nobody. `ACCOUNTS` in
 * `packages/e2e/fixtures/accounts.ts` is the other half of this contract.
 *
 * A no-op when the name is already right, which keeps re-running safe.
 */
const pinName = async (
  db: ReturnType<typeof createDb>,
  id: string,
  name: string,
): Promise<"renamed" | "already"> => {
  const result = await db.execute(sql`
    update "user" set name = ${name}, updated_at = now()
     where id = ${id}::uuid and name is distinct from ${name}
  `);
  return (result.rowCount ?? 0) > 0 ? "renamed" : "already";
};

const seedTestAccounts = async (): Promise<void> => {
  await waitForAuth();
  console.log("[seed] test accounts:");
  const db = createDb(DATABASE_URL);
  try {
    for (const account of TEST_ACCOUNTS) {
      const outcome = await signUp(account.email, account.name);
      const pinned = await pinId(db, account.email, account.id);
      const named = await pinName(db, account.id, account.name);
      console.log(
        `  ${account.email.padEnd(20)} ${outcome}, id ${pinned} (${account.id}), name ${named} (${account.name})`,
      );
    }
  } finally {
    await db.$client.end();
  }
};

/* -------------------------------------------------------------------------- */

/**
 * `--reference-only` runs step 1 and stops.
 *
 * X3's `packages/db/transform/test-db.sh` seeds the test template this way: the
 * ten reference tables are foreign-key targets and a schema-only dump carries
 * none of their rows, but step 2 signs its accounts up over HTTP against a
 * running `actors` service, which a test database has no business needing.
 * Reading the rows from here rather than from a second copy of
 * `reference-data.json` is the point — one source, one insert path.
 */
const main = async (): Promise<void> => {
  await seedReferenceData();
  if (process.argv.includes("--reference-only")) {
    console.log("[seed] done (reference data only)");
    return;
  }
  await seedTestAccounts();
  console.log("[seed] done");
};

await main();
