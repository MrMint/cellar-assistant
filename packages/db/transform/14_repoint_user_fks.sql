-- 14 · Repoint every `public.*` foreign key from `auth.users(id)` to `"user"(id)`.
--
-- THE COUNT IS 31, NOT 188. A6's merge checklist, `src/auth/schema.ts` and
-- `src/auth/auth.ts` all say "188 `public.*` foreign keys point at
-- `auth.users(id)`". 188 is the number of foreign keys in the *whole* Nhost
-- database (`SELECT count(*) FROM pg_constraint WHERE contype = 'f'` against
-- `local` = 188). The number that actually reference `auth.users` is 31 from
-- `public` across 27 tables, plus 8 from inside `auth` itself which go with the
-- schema in `15`. A3 had it right in `transform/README.md` ("31 application
-- tables have a foreign key to `auth.users`"). Nothing else changes — the
-- figure was wrong, the work it described was not.
--
-- TYPE-CLEAN, WHICH IS THE POINT. A6b converted better-auth's seven id and
-- id-FK columns from `text` to real `uuid`, so `"user".id` and `auth.users.id`
-- are the same type and no referencing column changes type. Every swap below is
-- `DROP CONSTRAINT` / `ADD CONSTRAINT`: a catalog change plus one validating
-- scan of the referencing table. No `USING`, no cast, no rewrite.
--
-- Driven from the catalog rather than a transcribed list of 31 statements. The
-- new definition is `pg_get_constraintdef()` with the referenced table
-- substituted, so `MATCH`, `ON UPDATE`, `ON DELETE` and deferrability are
-- carried across exactly as Postgres itself renders them — there is no list to
-- get wrong, and a 32nd foreign key added by a later Nhost migration is handled
-- rather than missed. Each swap is announced with `RAISE NOTICE`, so a run
-- prints what it did.
--
-- Constraint names are rewritten to Drizzle's convention at the same time:
-- `beers_created_by_id_users_id_fkey` -> `beers_created_by_id_user_id_fkey`,
-- because the referenced table is now `user`, not `users`. That has to happen
-- here and not in `07_align_constraint_names.sql`, which runs six steps
-- earlier; without it `drizzle-kit generate` asks whether 31 foreign keys are
-- renames or new objects (see `../README.md`, "Known rc.4 rough edges"). The
-- longest derived name is `place_menu_items_match_verified_by_user_id_fkey` at
-- 47 bytes, so none of them reach Postgres's 63-byte limit and none needs an
-- entry in `07`'s `long_names` table.
--
-- ORDERING FOR E1. Locally this runs against empty tables and the guard is
-- trivially satisfied. Against production data it must run AFTER
-- `services/actors/scripts/migrate-users.ts` has copied `auth.users` into `"user"`
-- (ids preserved — that is what makes this a metadata change rather than a data
-- migration), exactly like `09_item_file_fk_repoint.sql` and
-- `migrate-files.ts`. The guard below aborts with the offending count rather
-- than letting `ADD CONSTRAINT` fail halfway through with 30 of 31 swapped.
--
-- Re-runnable: once a constraint already points at `"user"`, the driving query
-- does not select it and the block does nothing.

-- Guard: every id any `public.*` row still references must exist in `"user"`.
-- Checked generically, from the same catalog query that drives the swap, so it
-- cannot fall out of step with the list of columns being repointed.
DO $$
DECLARE
  c record;
  orphans bigint;
  total bigint := 0;
  detail text := '';
BEGIN
  FOR c IN
    SELECT src.relname AS table_name, att.attname AS column_name
      FROM pg_constraint con
      JOIN pg_class src ON src.oid = con.conrelid
      JOIN pg_namespace sn ON sn.oid = src.relnamespace
      JOIN pg_class tgt ON tgt.oid = con.confrelid
      JOIN pg_namespace tn ON tn.oid = tgt.relnamespace
      JOIN pg_attribute att
        ON att.attrelid = src.oid AND att.attnum = con.conkey[1]
     WHERE con.contype = 'f'
       AND sn.nspname = 'public'
       AND tn.nspname = 'auth'
       AND tgt.relname = 'users'
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I t WHERE t.%I IS NOT NULL '
      'AND NOT EXISTS (SELECT 1 FROM public."user" u WHERE u.id = t.%I)',
      c.table_name, c.column_name, c.column_name
    ) INTO orphans;
    IF orphans > 0 THEN
      total := total + orphans;
      detail := detail || format('%s  %s.%s: %s row(s)', chr(10),
                                 c.table_name, c.column_name, orphans);
    END IF;
  END LOOP;

  IF total > 0 THEN
    -- One placeholder, one argument: `%%` in a RAISE format string is an
    -- escaped literal percent, so two adjacent `%`s across a line break would
    -- silently swallow a placeholder.
    RAISE EXCEPTION '%', format(
      '%s row(s) reference a user id that is missing from public."user".%s%s'
      'Run `services/actors/scripts/migrate-users.ts` before this transform.',
      total, detail, chr(10));
  END IF;
END $$;

DO $$
DECLARE
  c record;
  swapped int := 0;
  new_name text;
BEGIN
  FOR c IN
    SELECT src.relname  AS table_name,
           con.conname  AS old_name,
           pg_get_constraintdef(con.oid) AS def,
           (SELECT string_agg(a.attname, '_' ORDER BY k.ord)
              FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = src.oid AND a.attnum = k.attnum)
                        AS cols
      FROM pg_constraint con
      JOIN pg_class src ON src.oid = con.conrelid
      JOIN pg_namespace sn ON sn.oid = src.relnamespace
      JOIN pg_class tgt ON tgt.oid = con.confrelid
      JOIN pg_namespace tn ON tn.oid = tgt.relnamespace
     WHERE con.contype = 'f'
       AND sn.nspname = 'public'
       AND tn.nspname = 'auth'
       AND tgt.relname = 'users'
     ORDER BY src.relname, con.conname
  LOOP
    new_name := c.table_name || '_' || c.cols || '_user_id_fkey';
    IF length(new_name) > 63 THEN
      RAISE EXCEPTION
        'derived constraint name % is % bytes; add it to the long_names table '
        'in 07_align_constraint_names.sql', new_name, length(new_name);
    END IF;

    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I',
                   c.table_name, c.old_name);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s',
                   c.table_name, new_name,
                   replace(c.def, 'REFERENCES auth.users(id)',
                                  'REFERENCES public."user"(id)'));
    RAISE NOTICE '  % -> % (%)', c.old_name, new_name, c.table_name;
    swapped := swapped + 1;
  END LOOP;

  RAISE NOTICE '14: repointed % foreign key(s) onto public."user"(id)', swapped;
END $$;

-- Nothing in `public` may still reference `auth.users` — `15` drops the schema
-- next and a surviving dependency would take an application table with it.
DO $$
DECLARE
  remaining int;
BEGIN
  SELECT count(*) INTO remaining
    FROM pg_constraint con
    JOIN pg_class src ON src.oid = con.conrelid
    JOIN pg_namespace sn ON sn.oid = src.relnamespace
    JOIN pg_class tgt ON tgt.oid = con.confrelid
    JOIN pg_namespace tn ON tn.oid = tgt.relnamespace
   WHERE con.contype = 'f' AND sn.nspname = 'public' AND tn.nspname = 'auth';
  IF remaining > 0 THEN
    RAISE EXCEPTION
      '% public foreign key(s) still reference the auth schema', remaining;
  END IF;
END $$;
