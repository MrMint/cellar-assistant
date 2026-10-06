-- 07 · Rename foreign-key and primary-key constraints to Drizzle's convention.
--
-- WHY THIS EXISTS. `drizzle-kit@1.0.0-rc.4`'s `pull` writes single-column
-- foreign keys as inline `.references(() => other.col)`, a form that has nowhere
-- to put the constraint's actual name. `pull --init` meanwhile writes a snapshot
-- straight from the catalog, names and all. The two therefore disagree the
-- moment a database's constraint names are not what Drizzle would have chosen,
-- and `drizzle-kit generate` immediately asks whether 171 foreign keys are
-- renames or new objects. It is a round-trip bug in the RC, and this is the fix
-- that keeps the schema regenerable: bring the *database* to Drizzle's naming so
-- the generated `tables.ts` stays untouched generator output.
--
-- Drizzle's names:
--   foreign key   <table>_<cols>_<foreign table>_<foreign cols>_fkey
--   primary key   <table>_pkey
-- Unique constraints, check constraints and indexes already round-trip (the
-- generator writes those names out explicitly), so they are left alone.
--
-- This is cosmetic: `ALTER TABLE ... RENAME CONSTRAINT` is a catalog-only
-- change, instant on any table size, and nothing in the new stack reads
-- constraint names. Nothing in the old stack does either now that Hasura is
-- gone (01 dropped it).
--
-- Re-runnable: renames only where the name already differs.

DO $$
DECLARE
  c record;
  target text;
  -- Drizzle does not truncate a derived name that exceeds Postgres's 63-byte
  -- identifier limit; it substitutes `<table>_<12-char hash>_fkey`. The hash is
  -- deterministic (same input, same output, verified across runs) but not
  -- reproducible in SQL, so the three affected constraints are listed here
  -- verbatim. To recompute one: run `drizzle-kit generate`, and the name it
  -- proposes creating is the name to put here.
  long_names CONSTANT jsonb := '{
    "item_match_suggestions_place_menu_item_id_place_menu_items_id_fkey":
      "item_match_suggestions_iENvq4dzHuvQ_fkey",
    "oauth2_authorization_codes_auth_request_id_oauth2_auth_requests_id_fkey":
      "oauth2_authorization_codes_LbWFlOC0MSN7_fkey",
    "oauth2_refresh_tokens_auth_request_id_oauth2_auth_requests_id_fkey":
      "oauth2_refresh_tokens_vFX62KGfVOnD_fkey"
  }'::jsonb;
BEGIN
  -- Foreign keys.
  FOR c IN
    SELECT
      n.nspname AS schema_name,
      t.relname AS table_name,
      con.conname AS current_name,
      t.relname
        || '_' || (SELECT string_agg(a.attname, '_' ORDER BY k.ord)
                     FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
                     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum)
        || '_' || tt.relname
        || '_' || (SELECT string_agg(a.attname, '_' ORDER BY k.ord)
                     FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ord)
                     JOIN pg_attribute a ON a.attrelid = tt.oid AND a.attnum = k.attnum)
        || '_fkey' AS drizzle_name
    FROM pg_constraint con
    JOIN pg_class t ON t.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_class tt ON tt.oid = con.confrelid
    WHERE con.contype = 'f'
      AND n.nspname IN ('public', 'auth', 'storage')
  LOOP
    IF length(c.drizzle_name) > 63 THEN
      target := long_names ->> c.drizzle_name;
      IF target IS NULL THEN
        RAISE EXCEPTION
          'foreign key %.% derives the over-long Drizzle name % (% bytes) and has no entry in 07_align_constraint_names.sql. Run `drizzle-kit generate` and copy the name it proposes.',
          c.schema_name, c.table_name, c.drizzle_name, length(c.drizzle_name);
      END IF;
    ELSE
      target := c.drizzle_name;
    END IF;
    CONTINUE WHEN target = c.current_name;
    EXECUTE format('ALTER TABLE %I.%I RENAME CONSTRAINT %I TO %I',
                   c.schema_name, c.table_name, c.current_name, target);
  END LOOP;

  -- Primary keys.
  FOR c IN
    SELECT n.nspname AS schema_name, t.relname AS table_name,
           con.conname AS current_name, left(t.relname || '_pkey', 63) AS drizzle_name
    FROM pg_constraint con
    JOIN pg_class t ON t.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE con.contype = 'p'
      AND n.nspname IN ('public', 'auth', 'storage')
      AND con.conname <> left(t.relname || '_pkey', 63)
  LOOP
    EXECUTE format('ALTER TABLE %I.%I RENAME CONSTRAINT %I TO %I',
                   c.schema_name, c.table_name, c.current_name, c.drizzle_name);
  END LOOP;
END $$;
