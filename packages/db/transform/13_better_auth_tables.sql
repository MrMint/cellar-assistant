-- 13 · better-auth's five tables, in `public`, in the main database (X2).
--
-- A6 built better-auth against its own `auth_dev` database so it could land
-- while A3 was still rebuilding `packages/db`. That was a scheduling
-- convenience with two costs: `public.*` rows foreign-keyed to `auth.users`
-- while profiles lived in another database's `user` table, and no fixture could
-- create a user without hand-inserting an `auth.users` row. X2 merges them.
--
-- WHY THE DDL IS HERE AND NOT IN `../migrations`. A6's checklist
-- (`services/actors/src/auth/README.md`) said to fold
-- `services/actors/src/auth/migrations/0000_better_auth_tables/migration.sql` into
-- `packages/db/migrations`. It is folded in — but by the *baseline*, not by
-- hand: `pull --init` is taken against a database this file has already built,
-- so the five tables land in `src/schema/tables.ts` and in the baseline
-- migration like every other table. This file is the database-side source, and
-- it is exactly the precedent `06_new_tables.sql` set for `files`, `jobs` and
-- `outbox` — tables the new stack adds rather than inherits.
--
-- The DDL below is A6's generated migration verbatim, with three changes and
-- nothing else:
--
--   1. `IF NOT EXISTS` throughout, so the file is re-runnable like every other
--      numbered step (and so `services/actors/src/auth/testing.ts` can apply it to
--      a scratch database);
--   2. the two foreign keys are added through a guard rather than a bare
--      `ALTER TABLE ... ADD CONSTRAINT`, which has no `IF NOT EXISTS` form;
--   3. `CREATE SCHEMA`-level noise removed — these are ordinary `public` tables
--      now.
--
-- COLUMN NAMES ARE A CONTRACT. better-auth's Drizzle adapter addresses a column
-- by the JS property name Drizzle derives from the column name, so renaming a
-- column here silently breaks sign-in rather than failing to compile.
-- `services/actors/src/auth/auth-schema.test.ts` asserts the generated table
-- definitions against better-auth's own `getAuthTables()` for exactly that
-- reason — it is the test that makes a re-pull safe.
--
-- IDS ARE `uuid`, WHICH IS THE WHOLE POINT. `auth.users.id` is `uuid` and so is
-- every id and id-foreign-key column below, which is what makes `14`'s repoint
-- of the 31 `public.*` foreign keys a constraint swap with no cast and no
-- column-type change. `session.token`, `account.account_id`,
-- `account.provider_id` and `verification.identifier`/`value` are free-form
-- provider strings and stay `text` on purpose.
--
-- No `DEFAULT gen_random_uuid()` anywhere, also on purpose: `advanced.database
-- .generateId` in `services/actors/src/auth/auth.ts` supplies `crypto.randomUUID()`
-- explicitly for every new row, so id policy stays in the application.

CREATE TABLE IF NOT EXISTS "user" (
	"id" uuid PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	-- Carried over from Nhost `auth.users`; there is no `public.users` and there
	-- never was one. `role` is collapsed to 'admin' | 'user' in the JWT claim
	-- (`tokenRole`), `locale` was `varchar(3)`, `disabled` was enforced by
	-- hasura-auth and is enforced now by a session-create hook.
	"role" text DEFAULT 'user' NOT NULL,
	"locale" text,
	"disabled" boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
	"id" uuid PRIMARY KEY,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS "account" (
	"id" uuid PRIMARY KEY,
	-- The provider's own id for the user. For `provider_id = 'credential'` this
	-- happens to equal `user.id`; for a social provider it is Nhost's
	-- `auth.user_providers.provider_user_id`.
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	-- bcrypt (migrated, `$2a$`/`$2b$`/`$2y$`) or better-auth scrypt.
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
	"id" uuid PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Signing keys for the `jwt` plugin; the public half is served at
-- `/api/auth/jwks`, which is the only thing `services/api` ever fetches from the
-- actor host.
CREATE TABLE IF NOT EXISTS "jwks" (
	"id" uuid PRIMARY KEY,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"alg" text,
	"crv" text
);

-- `account_provider_account_key` mirrors Nhost's
-- `user_providers_provider_id_provider_user_id_key` and is what makes
-- `services/actors/scripts/migrate-users.ts` idempotent for social accounts.
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_key" ON "user" ("email");
CREATE UNIQUE INDEX IF NOT EXISTS "session_token_key" ON "session" ("token");
CREATE INDEX IF NOT EXISTS "session_user_id_idx" ON "session" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "account_provider_account_key"
  ON "account" ("provider_id", "account_id");
CREATE INDEX IF NOT EXISTS "account_user_id_idx" ON "account" ("user_id");
CREATE INDEX IF NOT EXISTS "verification_identifier_idx"
  ON "verification" ("identifier");

-- `ADD CONSTRAINT` has no `IF NOT EXISTS`. The names are Drizzle's derived
-- convention already (`<table>_<cols>_<foreign table>_<foreign cols>_fkey`), so
-- `07_align_constraint_names.sql` — which runs before this file — has nothing
-- to do to them.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'session_user_id_user_id_fkey'
       AND conrelid = 'public.session'::regclass
  ) THEN
    ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'account_user_id_user_id_fkey'
       AND conrelid = 'public.account'::regclass
  ) THEN
    ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
  END IF;
END $$;
