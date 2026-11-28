-- better-auth's five tables, in `public`, in the main database.
--
-- A test fixture: `services/actors/src/auth/testing.ts` applies this file to a
-- scratch database. The same DDL is in `packages/db/baseline/schema.sql`, which
-- every real database is built from, and `drizzle-kit pull` keeps the
-- definitions in `packages/db/src/schema/tables.ts`.
--
-- `IF NOT EXISTS` throughout so the file is re-runnable, and the two foreign
-- keys are added through a guard rather than a bare `ALTER TABLE ... ADD
-- CONSTRAINT`, which has no `IF NOT EXISTS` form.
--
-- COLUMN NAMES ARE A CONTRACT. better-auth's Drizzle adapter addresses a column
-- by the JS property name Drizzle derives from the column name, so renaming a
-- column here silently breaks sign-in rather than failing to compile.
-- `services/actors/src/auth/auth-schema.test.ts` asserts the generated table
-- definitions against better-auth's own `getAuthTables()` for exactly that
-- reason — it is the test that makes a re-pull safe.
--
-- IDS ARE `uuid`. Every id and id-foreign-key column below is `uuid`, matching
-- the `user_id` columns of the 31 `public.*` foreign keys that reference
-- `"user"`. `session.token`, `account.account_id`,
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
	-- There is no `public.users`. `role` is collapsed to 'admin' | 'user' in the
	-- JWT claim (`tokenRole`), and `disabled` is enforced by a session-create
	-- hook.
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
	-- happens to equal `user.id`; for a social provider it is the
	-- provider's user id.
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

-- `account_provider_account_key`: one account row per provider identity.
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
