-- 01 · Drop Hasura's own artifacts.
--
-- Hasura keeps its bookkeeping in `hdb_catalog` and implements every event
-- trigger as a row trigger on an application table whose function lives in
-- `hdb_catalog`. None of it survives the cutover: event triggers become outbox
-- rows written by the owning actor (migration-plan §1.4, §5).
--
-- Re-runnable. Destroys: the whole `hdb_catalog` schema and every trigger on an
-- application table that fires an `hdb_catalog` function.

-- Drop the event-trigger triggers first, by shape rather than by name, so that a
-- production database carrying event triggers this worktree has never seen is
-- still handled. Doing it before the schema drop keeps `DROP SCHEMA` from having
-- to CASCADE through application tables.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT n.nspname AS schema_name, c.relname AS table_name, tg.tgname AS trigger_name
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = tg.tgfoid
    JOIN pg_namespace fn ON fn.oid = p.pronamespace
    WHERE NOT tg.tgisinternal
      -- Matched by name, not `'hdb_catalog'::regnamespace`: that cast throws
      -- once the schema is gone, which would make this file non-re-runnable.
      AND fn.nspname = 'hdb_catalog'
  LOOP
    RAISE NOTICE 'dropping event trigger %.%.%', t.schema_name, t.table_name, t.trigger_name;
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON %I.%I',
      t.trigger_name, t.schema_name, t.table_name
    );
  END LOOP;
END $$;

DROP SCHEMA IF EXISTS hdb_catalog CASCADE;

-- `admin.credentials` is deliberately NOT dropped here: migration-plan §3 and §9
-- both say its purpose is unknown and it must be confirmed before removal. E1
-- owns that decision.
