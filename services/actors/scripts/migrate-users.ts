/**
 * A6 · Nhost `auth.users` + `auth.user_providers` → better-auth `user` + `account`.
 *
 *   AUTH_DATABASE_URL=postgres://cellar:cellar@localhost:5433/cellar \
 *   SOURCE_DATABASE_URL=postgres://postgres:postgres@localhost:5432/local \
 *   node scripts/migrate-users.ts [--dry-run] [--update-existing]
 *
 * Idempotent, and idempotent *whatever the new stack has done since*. By
 * default a row that already exists is left completely alone:
 *
 *   - `user` inserts on `id`; `account` on `(provider_id, account_id)` — the
 *     same natural key Nhost enforces as
 *     `user_providers_provider_id_provider_user_id_key`.
 *   - Ids are UUIDv5 of the natural key, so a second run derives the same id
 *     rather than inserting a duplicate under a fresh random one.
 *   - A second run therefore reports `changed: 0` and writes nothing at all —
 *     no dead tuples, no bumped `xmin`.
 *
 * `--update-existing` re-applies source values to rows that already exist, for
 * a cutover rehearsal that wants to refresh an earlier import. It is off by
 * default because the naive version quietly reverts the new stack: a user who
 * signs in has their bcrypt hash upgraded to scrypt and `account.updated_at`
 * moved, and re-importing over that would undo it. Even with the flag:
 *
 *   - `account.password` is only ever filled when NULL, never overwritten. By
 *     the time this is re-run the migrated bcrypt hash may already have been
 *     replaced by a scrypt one (`src/auth/password.ts`) or by the user changing
 *     their password.
 *   - `account` timestamps are never rewritten, for the same reason. Only the
 *     binding (`user_id`) is re-pointed, so a provider identity that moved to a
 *     different user in the source is still corrected.
 *
 * One deliberate non-copy in every mode: OAuth `access_token` /
 * `refresh_token` are **not** migrated. They were issued to Nhost's OAuth
 * client ids; A6 registers new applications, so the old tokens are useless
 * under the new client. Only the identity binding is carried over; better-auth
 * mints fresh tokens on the next sign-in.
 *
 * The source connection is opened `default_transaction_read_only = on`. This
 * script must never write to the Nhost database.
 */
import { createHash } from "node:crypto";
import { Client, Pool } from "pg";
import { displayNameForExistingUser } from "../src/auth/display-name.ts";

// ---------------------------------------------------------------- ids

/** Fixed namespace for A6. Changing it changes every derived id. */
const NAMESPACE = "b4b6e5a2-2f1c-4d7a-9a3e-0d1f6c8a7e40";

/** RFC 4122 UUIDv5 (SHA-1). Deterministic ids keep re-runs from duplicating. */
const uuidV5 = (namespace: string, name: string): string => {
  const hex = namespace.replace(/-/g, "");
  const nsBytes = Buffer.from(hex, "hex");
  const hash = createHash("sha1")
    .update(nsBytes)
    .update(Buffer.from(name, "utf8"))
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  // version 5
  const b6 = bytes[6];
  const b8 = bytes[8];
  if (b6 === undefined || b8 === undefined) {
    throw new Error("unreachable: 16-byte digest");
  }
  bytes[6] = (b6 & 0x0f) | 0x50;
  bytes[8] = (b8 & 0x3f) | 0x80;
  const s = bytes.toString("hex");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
};

// ---------------------------------------------------------------- source

type SourceUser = {
  id: string;
  email: string | null;
  display_name: string;
  avatar_url: string;
  email_verified: boolean;
  disabled: boolean;
  default_role: string;
  locale: string | null;
  is_anonymous: boolean;
  password_hash: string | null;
  created_at: Date;
  updated_at: Date;
};

type SourceProvider = {
  user_id: string;
  provider_id: string;
  provider_user_id: string;
  created_at: Date;
  updated_at: Date;
};

const SOURCE_USERS = `
  SELECT id::text,
         email::text            AS email,
         display_name,
         avatar_url,
         email_verified,
         disabled,
         default_role,
         locale::text           AS locale,
         is_anonymous,
         password_hash,
         created_at,
         updated_at
    FROM auth.users
   ORDER BY created_at, id
`;

const SOURCE_PROVIDERS = `
  SELECT user_id::text,
         provider_id,
         provider_user_id,
         created_at,
         updated_at
    FROM auth.user_providers
   ORDER BY created_at, id
`;

// ---------------------------------------------------------------- target

/**
 * `xmax = 0` is true only for a row this statement inserted, so the RETURNING
 * set separates inserts from updates. A row that is neither — left untouched by
 * `DO NOTHING`, or suppressed by the `IS DISTINCT FROM` guard — comes back in
 * neither bucket and is counted as unchanged.
 */
const INSERT_USER = `
  INSERT INTO "user" (
    id, name, email, email_verified, image,
    created_at, updated_at, role, locale, disabled
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  ON CONFLICT (id) DO NOTHING
  RETURNING (xmax = 0) AS inserted
`;

const UPSERT_USER = `
  INSERT INTO "user" (
    id, name, email, email_verified, image,
    created_at, updated_at, role, locale, disabled
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  ON CONFLICT (id) DO UPDATE SET
    name           = EXCLUDED.name,
    email          = EXCLUDED.email,
    email_verified = EXCLUDED.email_verified,
    image          = EXCLUDED.image,
    created_at     = EXCLUDED.created_at,
    updated_at     = EXCLUDED.updated_at,
    role           = EXCLUDED.role,
    locale         = EXCLUDED.locale,
    disabled       = EXCLUDED.disabled
  WHERE (
    "user".name, "user".email, "user".email_verified, "user".image,
    "user".created_at, "user".updated_at, "user".role, "user".locale,
    "user".disabled
  ) IS DISTINCT FROM (
    EXCLUDED.name, EXCLUDED.email, EXCLUDED.email_verified, EXCLUDED.image,
    EXCLUDED.created_at, EXCLUDED.updated_at, EXCLUDED.role, EXCLUDED.locale,
    EXCLUDED.disabled
  )
  RETURNING (xmax = 0) AS inserted
`;

const INSERT_ACCOUNT = `
  INSERT INTO account (
    id, account_id, provider_id, user_id, password, created_at, updated_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  ON CONFLICT (provider_id, account_id) DO NOTHING
  RETURNING (xmax = 0) AS inserted
`;

/**
 * `--update-existing` only ever re-points the binding. `password` is filled,
 * never replaced, and the timestamps are left as the new stack wrote them —
 * rewriting either is how a re-import silently undoes a bcrypt→scrypt upgrade
 * or a password change.
 */
const UPSERT_ACCOUNT = `
  INSERT INTO account (
    id, account_id, provider_id, user_id, password, created_at, updated_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  ON CONFLICT (provider_id, account_id) DO UPDATE SET
    user_id  = EXCLUDED.user_id,
    password = COALESCE(account.password, EXCLUDED.password)
  WHERE (account.user_id, account.password)
     IS DISTINCT FROM (EXCLUDED.user_id, COALESCE(account.password, EXCLUDED.password))
  RETURNING (xmax = 0) AS inserted
`;

// ---------------------------------------------------------------- run

type Counts = { inserted: number; updated: number; unchanged: number };

const tally = (
  counts: Counts,
  rows: { inserted: boolean }[],
  attempted: number,
): void => {
  for (const row of rows) {
    if (row.inserted) counts.inserted += 1;
    else counts.updated += 1;
  }
  counts.unchanged += attempted - rows.length;
};

const env = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
};

const main = async (): Promise<void> => {
  const dryRun = process.argv.includes("--dry-run");
  const updateExisting = process.argv.includes("--update-existing");
  const userSql = updateExisting ? UPSERT_USER : INSERT_USER;
  const accountSql = updateExisting ? UPSERT_ACCOUNT : INSERT_ACCOUNT;
  const sourceUrl = env(
    "SOURCE_DATABASE_URL",
    "postgres://postgres:postgres@localhost:5432/local",
  );
  const targetUrl = env("AUTH_DATABASE_URL");

  const source = new Client({ connectionString: sourceUrl });
  await source.connect();
  // Belt and braces: the Nhost database is read-only to this script.
  await source.query("SET default_transaction_read_only = on");

  let users: SourceUser[];
  let providers: SourceProvider[];
  try {
    users = (await source.query<SourceUser>(SOURCE_USERS)).rows;
    providers = (await source.query<SourceProvider>(SOURCE_PROVIDERS)).rows;
  } finally {
    await source.end();
  }

  // --- rows better-auth cannot represent -------------------------------
  const skipped: { id: string; reason: string }[] = [];
  const migratable = users.filter((u) => {
    if (u.email === null || u.email === "") {
      skipped.push({ id: u.id, reason: "no email (better-auth requires one)" });
      return false;
    }
    if (u.is_anonymous) {
      skipped.push({ id: u.id, reason: "is_anonymous" });
      return false;
    }
    return true;
  });

  // better-auth looks users up by `email.toLowerCase()`. Nhost's `auth.email`
  // is citext, so two rows can differ only by case and still be unique there
  // while colliding here. Fail loudly rather than half-migrating.
  const byEmail = new Map<string, string[]>();
  for (const u of migratable) {
    const key = (u.email ?? "").toLowerCase();
    byEmail.set(key, [...(byEmail.get(key) ?? []), u.id]);
  }
  const collisions = [...byEmail].filter(([, ids]) => ids.length > 1);
  if (collisions.length > 0) {
    for (const [email, ids] of collisions) {
      console.error(
        `  email collision after lowercasing: ${email} → ${ids.join(", ")}`,
      );
    }
    throw new Error(
      `${collisions.length} email collision(s); resolve in the source before migrating`,
    );
  }

  const userIds = new Set(migratable.map((u) => u.id));
  const providerRows = providers.filter((p) => {
    if (!userIds.has(p.user_id)) {
      skipped.push({
        id: `${p.provider_id}:${p.provider_user_id}`,
        reason: "provider row for a user that was not migrated",
      });
      return false;
    }
    return true;
  });

  const userCounts: Counts = { inserted: 0, updated: 0, unchanged: 0 };
  const accountCounts: Counts = { inserted: 0, updated: 0, unchanged: 0 };
  const byProvider = new Map<string, number>();
  for (const p of providerRows) {
    byProvider.set(p.provider_id, (byProvider.get(p.provider_id) ?? 0) + 1);
  }

  if (dryRun) {
    console.log(
      `[dry-run] would migrate ${migratable.length} user(s), ` +
        `${migratable.filter((u) => u.password_hash !== null).length} credential account(s), ` +
        `${providerRows.length} social account(s)`,
    );
  } else {
    const pool = new Pool({ connectionString: targetUrl, max: 1 });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const u of migratable) {
        const result = await client.query<{ inserted: boolean }>(userSql, [
          u.id,
          // hasura-auth defaulted display_name to the email, and a display
          // name is shown to every signed-in user (W4 security F2). Same rule
          // as the backfill migration, so an import after it cannot undo it.
          displayNameForExistingUser({
            id: u.id,
            name: u.display_name,
            email: u.email ?? "",
          }),
          (u.email ?? "").toLowerCase(),
          u.email_verified,
          u.avatar_url === "" ? null : u.avatar_url,
          u.created_at,
          u.updated_at,
          u.default_role,
          u.locale === "" ? null : u.locale,
          u.disabled,
        ]);
        tally(userCounts, result.rows, 1);

        if (u.password_hash !== null && u.password_hash !== "") {
          // better-auth's email sign-in requires providerId 'credential' with
          // accountId === user.id (see api/routes/sign-in.mjs).
          const accountResult = await client.query<{ inserted: boolean }>(
            accountSql,
            [
              uuidV5(NAMESPACE, `credential:${u.id}`),
              u.id,
              "credential",
              u.id,
              u.password_hash,
              u.created_at,
              u.updated_at,
            ],
          );
          tally(accountCounts, accountResult.rows, 1);
        }
      }

      for (const p of providerRows) {
        const result = await client.query<{ inserted: boolean }>(accountSql, [
          uuidV5(NAMESPACE, `${p.provider_id}:${p.provider_user_id}`),
          p.provider_user_id,
          p.provider_id,
          p.user_id,
          null,
          p.created_at,
          p.updated_at,
        ]);
        tally(accountCounts, result.rows, 1);
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  }

  const changed =
    userCounts.inserted +
    userCounts.updated +
    accountCounts.inserted +
    accountCounts.updated;

  console.log(`users     ${JSON.stringify(userCounts)}`);
  console.log(`accounts  ${JSON.stringify(accountCounts)}`);
  console.log(
    `providers ${JSON.stringify(Object.fromEntries(byProvider))}` +
      (byProvider.size === 0 ? "  (none in source)" : ""),
  );
  console.log(`changed   ${changed}`);
  if (skipped.length > 0) {
    console.log(`skipped   ${skipped.length}`);
    for (const s of skipped) console.log(`  ${s.id}: ${s.reason}`);
  }
};

await main();
