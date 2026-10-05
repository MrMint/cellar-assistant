-- Drop Nhost's `admin.credentials`, and the `admin` schema once it is empty.
--
-- In production this table is NOT empty. The 2026-09-28 rehearsal from the
-- real production backup found one row, id `google_gcp_service_account`: a
-- whole GCP service-account JSON, `private_key` included — the fallback the
-- Nhost functions read through `admin_credentials_by_pk` when
-- `GOOGLE_APPLICATION_CREDENTIALS` was unset (e4-decisions.md decision 4,
-- whose "the table is empty" was measured on the LOCAL database only).
-- `01_drop_hasura_artifacts.sql` keeps `admin` on purpose, so the cutover
-- carried a live private key into the new database, and from there into every
-- backup of it.
--
-- Nothing in the new stack reads it: X1 moved GCP credentials into the
-- environment, and the only mentions under `services/` and `packages/` are
-- comments saying the table is not ported (`services/actors/src/lib/ai/config.ts`,
-- `services/actors/src/lib/overture.ts`). `drizzle.config.ts` never pulled
-- `admin` either. Dropping it loses nothing; the key itself must be ROTATED in
-- GCP regardless, because it is also in the Nhost backups and in the cutover's
-- own dump file.
--
-- A migration, not a transform edit: the transform is frozen at
-- `TRANSFORM_HORIZON` and a schema change after it is only a migration
-- (e4-decisions.md decision 16). At cutover it runs in the `migrate` phase,
-- inside the freeze and before the flip, so the key never reaches a database
-- that serves traffic. `IF EXISTS` because not every database has it: a
-- transform-built one (production, `cellar-stack`, every test template) does,
-- empty except in production; a migrations-only build never creates it.
--
-- The schema goes only if nothing else is left in it — no `CASCADE`, so an
-- object this migration does not know about stops nothing and is not taken
-- along silently; `scripts/cutover/smoke.sql` §12 then reports what is left.
DROP TABLE IF EXISTS admin.credentials;--> statement-breakpoint
-- `to_regnamespace`, never `'admin'::regnamespace`: the cast is folded when the
-- statement is planned and throws on a database with no `admin` at all.
DO $$
DECLARE ns oid := to_regnamespace('admin');
BEGIN
  IF ns IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relnamespace = ns)
     AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = ns)
     AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = ns)
  THEN
    DROP SCHEMA admin;
  END IF;
END $$;
