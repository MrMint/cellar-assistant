-- 15 · Drop the `auth` schema.
--
-- migration-plan §3 lists `auth.*` under "Removed at cutover"; A3 deliberately
-- left it standing because 31 application foreign keys still pointed into it
-- and the Drizzle baseline still needed it. `13` created the tables that
-- replace it and `14` moved those 31 foreign keys, so the schema is now
-- unreferenced and this is the step that finishes A6.
--
-- With it go, in one `CASCADE`: `auth.users` and its 8 internal foreign keys,
-- `auth.user_providers` (already migrated into `account` by
-- `scripts/migrate-users.ts`), `auth.refresh_tokens` and the oauth2 tables
-- (Nhost's own session state — better-auth issues its own and A6's decision
-- note explains why the old OAuth tokens are worthless under new client ids),
-- `auth.roles` / `auth.user_roles` (collapsed into `"user".role`), and
-- hasura-auth's `auth.schema_migrations`.
--
-- After this the database has one identity table. `AUTH_DATABASE_URL` points at
-- this database, `"user"` is what existence is checked against and what
-- profiles are read from, and `services/actors/src/lib/profile-store.ts`'s
-- two-tables-in-two-databases caveat — and `UserActor`'s `missingProfile`
-- fallback for an id present in one and absent from the other — stop describing
-- anything real.
--
-- ORDERING FOR E1. `scripts/migrate-users.ts` reads `auth.users` and
-- `auth.user_providers`. Against production data it must have run before this
-- file, and the guard below refuses to drop a schema whose users have not all
-- arrived in `"user"` — losing the source of a half-finished migration is not
-- something a re-run can fix.
--
-- Re-runnable: `IF EXISTS`, and the guard is skipped when the schema is gone.

DO $$
DECLARE
  unmigrated bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    RAISE NOTICE '15: auth schema already gone';
    RETURN;
  END IF;

  IF to_regclass('auth.users') IS NOT NULL THEN
    SELECT count(*) INTO unmigrated
      FROM auth.users a
     WHERE NOT EXISTS (SELECT 1 FROM public."user" u WHERE u.id = a.id);
    IF unmigrated > 0 THEN
      RAISE EXCEPTION
        '% auth.users row(s) have no public."user" row. Run '
        '`services/actors/scripts/migrate-users.ts` before this transform; '
        'dropping the auth schema now would destroy the only copy.',
        unmigrated;
    END IF;
  END IF;

  RAISE NOTICE '15: dropping schema auth';
END $$;

DROP SCHEMA IF EXISTS auth CASCADE;

-- `storage` is deliberately left standing. A8 copied `storage.files` into
-- `public.files` and steps `09`, `10` and `12` moved all six application
-- foreign keys off it, so nothing in `public` depends on it any more and
-- `schemaFilter: ["public"]` is now correct for the Drizzle baseline — but the
-- rows are still the only copy of Nhost's file metadata until E1 has verified
-- the migration against production, and `admin.credentials` is still §9's
-- open question. Both are E1's to drop, deliberately, not this file's to take
-- with `auth`.
