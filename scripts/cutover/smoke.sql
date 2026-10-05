-- E1 · Post-transform smoke assertions, run against the TRANSFORMED database.
--
--   scripts/cutover/cutover.sh smoke
--
-- Every check here RAISEs on failure, so the script's exit status is the answer.
-- These are structural: "did the transform end where it claims to end". The
-- behavioural pass is E2's Playwright suite against the same database.

\set ON_ERROR_STOP on
\pset footer off

\echo ''
\echo '== 1. schemas: auth is gone, hdb_catalog is gone -----------------'
DO $$
DECLARE leftover text;
BEGIN
  SELECT string_agg(nspname, ', ' ORDER BY nspname) INTO leftover
    FROM pg_namespace
   WHERE nspname IN ('auth', 'hdb_catalog');
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION 'schema(s) still present after the transform: %', leftover;
  END IF;
  RAISE NOTICE 'ok: auth and hdb_catalog are gone';
END $$;
SELECT string_agg(nspname, ', ' ORDER BY nspname) AS schemas_present
  FROM pg_namespace
 WHERE nspname NOT LIKE 'pg\_%' AND nspname <> 'information_schema';

\echo ''
\echo '== 2. better-auth tables exist and hold the migrated users -------'
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(t, ', ') INTO missing
    FROM unnest(ARRAY['user', 'session', 'account', 'verification', 'jwks']) t
   WHERE to_regclass('public.' || quote_ident(t)) IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'better-auth table(s) missing: %', missing;
  END IF;
END $$;
SELECT (SELECT count(*) FROM "user")    AS users,
       (SELECT count(*) FROM account)   AS accounts,
       (SELECT count(*) FROM account WHERE provider_id = 'credential') AS credential_accounts,
       (SELECT count(*) FROM account WHERE provider_id <> 'credential') AS social_accounts,
       (SELECT count(*) FROM "user" WHERE NOT email_verified) AS email_unverified;

\echo ''
\echo '== 3. no foreign key leaves `public` ------------------------------'
-- `drizzle.config.ts` sets `schemaFilter: ["public"]`. A surviving cross-schema
-- FK makes `pull` emit a reference to a table it did not pull, and the generated
-- relations file then throws at import (A3's finding).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM pg_constraint con
    JOIN pg_class src ON src.oid = con.conrelid
    JOIN pg_namespace sn ON sn.oid = src.relnamespace
    JOIN pg_class tgt ON tgt.oid = con.confrelid
    JOIN pg_namespace tn ON tn.oid = tgt.relnamespace
   WHERE con.contype = 'f' AND sn.nspname = 'public' AND tn.nspname <> 'public';
  IF n > 0 THEN
    RAISE EXCEPTION '% foreign key(s) still leave the public schema', n;
  END IF;
  RAISE NOTICE 'ok: every public foreign key stays inside public';
END $$;
SELECT count(*) AS fks_into_user
  FROM pg_constraint con
  JOIN pg_class tgt ON tgt.oid = con.confrelid
 WHERE con.contype = 'f' AND tgt.relname = 'user';

\echo ''
\echo '== 4. every file reference resolves to a `files` row --------------'
DO $$
DECLARE
  c record;
  orphans bigint;
  total bigint := 0;
BEGIN
  FOR c IN
    SELECT src.relname AS t, att.attname AS col
      FROM pg_constraint con
      JOIN pg_class src ON src.oid = con.conrelid
      JOIN pg_namespace sn ON sn.oid = src.relnamespace
      JOIN pg_class tgt ON tgt.oid = con.confrelid
      JOIN pg_attribute att ON att.attrelid = src.oid AND att.attnum = con.conkey[1]
     WHERE con.contype = 'f' AND sn.nspname = 'public' AND tgt.relname = 'files'
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I t WHERE t.%I IS NOT NULL '
      'AND NOT EXISTS (SELECT 1 FROM files f WHERE f.id = t.%I)',
      c.t, c.col, c.col) INTO orphans;
    total := total + orphans;
    IF orphans > 0 THEN
      RAISE WARNING '%.% has % unresolved file id(s)', c.t, c.col, orphans;
    END IF;
  END LOOP;
  IF total > 0 THEN
    RAISE EXCEPTION '% file reference(s) do not resolve', total;
  END IF;
  RAISE NOTICE 'ok: all six file foreign keys resolve into public.files';
END $$;
SELECT count(*) AS files_rows,
       count(*) FILTER (WHERE verified_at IS NULL) AS unverified_would_be_reaped,
       count(DISTINCT bucket) AS buckets
  FROM files;
\echo '   key = id for every migrated row (A8): mismatches below must be 0'
SELECT count(*) AS key_not_equal_id FROM files WHERE key <> id::text;

\echo ''
\echo '== 5. enums: 12 native types, 13 columns retyped ------------------'
-- Thirteen, not fourteen: `permission_type` covers two columns
-- (`cellars.privacy`, `tier_lists.privacy`). The list below is `04`'s, and it
-- is asserted rather than only printed — the label said "14" for as long as
-- nothing counted.
DO $$
DECLARE wrong text;
BEGIN
  SELECT string_agg(format('%s.%s (%s)', e.t, e.c, coalesce(format_type(a.atttypid, NULL), 'missing')), ', ')
    INTO wrong
    FROM (VALUES ('item_favorites', 'type', 'item_type'),
                 ('cellars', 'privacy', 'permission_type'),
                 ('tier_lists', 'privacy', 'permission_type'),
                 ('friend_requests', 'status', 'friend_request_status'),
                 ('recipe_instructions', 'instruction_type', 'instruction_types'),
                 ('brands', 'brand_type', 'brand_types'),
                 ('recipe_groups', 'category', 'recipe_category'),
                 ('coffees', 'roast_level', 'coffee_roast_level'),
                 ('coffees', 'process', 'coffee_process'),
                 ('coffees', 'species', 'coffee_species'),
                 ('teas', 'caffeine_level', 'tea_caffeine_level'),
                 ('teas', 'form', 'tea_form'),
                 ('sakes', 'serving_temperature', 'sake_serving_temperature'))
         AS e(t, c, typ)
    LEFT JOIN pg_attribute a
      ON a.attrelid = to_regclass('public.' || quote_ident(e.t))
     AND a.attname = e.c AND NOT a.attisdropped
   WHERE a.atttypid IS DISTINCT FROM to_regtype('public.' || quote_ident(e.typ));
  IF wrong IS NOT NULL THEN
    RAISE EXCEPTION 'column(s) 04 retypes are not their enum: %', wrong;
  END IF;
  RAISE NOTICE 'ok: all 13 columns 04 retypes carry their enum type';
END $$;
SELECT count(DISTINCT t.typname) AS enum_types
  FROM pg_type t WHERE t.typnamespace = 'public'::regnamespace AND t.typtype = 'e';
SELECT c.relname || '.' || a.attname AS col, t.typname AS enum_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_type t ON t.oid = a.atttypid
 WHERE n.nspname = 'public' AND t.typtype = 'e' AND NOT a.attisdropped
   -- `relkind = 'r'` only: pg_attribute also carries an entry per index column,
   -- which would list `idx_brands_type.brand_type` beside `brands.brand_type`.
   AND c.relkind = 'r'
 ORDER BY 1;
DO $$
DECLARE gone text;
BEGIN
  SELECT string_agg(t, ', ') INTO gone
    FROM unnest(ARRAY['item_type', 'permission_type', 'friend_request_status',
                      'instruction_types', 'brand_types', 'recipe_category',
                      'coffee_roast_level', 'coffee_process', 'coffee_species',
                      'tea_caffeine_level', 'tea_form', 'sake_serving_temperature']) t
   WHERE to_regclass('public.' || quote_ident(t)) IS NOT NULL;
  IF gone IS NOT NULL THEN
    RAISE EXCEPTION 'reference table(s) not dropped by 04: %', gone;
  END IF;
  RAISE NOTICE 'ok: the 12 converted reference tables are gone';
END $$;

\echo ''
\echo '== 6. new tables -------------------------------------------------'
SELECT (SELECT count(*) FROM files)  AS files,
       (SELECT count(*) FROM jobs)   AS jobs,
       (SELECT count(*) FROM outbox) AS outbox;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = 'public.outbox'::regclass AND attname = 'seq') THEN
    RAISE EXCEPTION 'outbox.seq missing (A7b)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
                  WHERE c.relname = 'outbox_due_idx' AND i.indnatts = 2) THEN
    RAISE EXCEPTION 'outbox_due_idx is not the two-column (run_after, seq) index';
  END IF;
  RAISE NOTICE 'ok: outbox.seq and the widened outbox_due_idx are present';
END $$;

\echo ''
\echo '== 7. Hasura is gone ----------------------------------------------'
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_trigger tg
    JOIN pg_proc p ON p.oid = tg.tgfoid
    JOIN pg_namespace fn ON fn.oid = p.pronamespace
   WHERE NOT tg.tgisinternal AND fn.nspname = 'hdb_catalog';
  IF n > 0 THEN RAISE EXCEPTION '% Hasura event trigger(s) survive', n; END IF;
  SELECT count(*) INTO n FROM pg_proc p
    JOIN pg_namespace nn ON nn.oid = p.pronamespace
   WHERE nn.nspname = 'public' AND p.proname LIKE 'notify_hasura%';
  IF n > 0 THEN RAISE EXCEPTION '% notify_hasura function(s) survive', n; END IF;
  RAISE NOTICE 'ok: no Hasura triggers or notify_hasura functions remain';
END $$;

\echo ''
\echo '== 8. the hand-written SQL lane is present ------------------------'
-- `02` drops the four search functions; only the lane puts them back. If a
-- build path skips the lane the actors fail at runtime, not at startup.
DO $$
DECLARE missing text; survivors text;
BEGIN
  SELECT string_agg(f, ', ') INTO missing
    FROM unnest(ARRAY['find_duplicate_places', 'search_category_vectors',
                      'search_places_adaptive_cluster', 'search_places_hybrid']) f
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = f);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'hand-written lane function(s) absent: %', missing;
  END IF;
  -- The five computed-field distance helpers the lane used to re-create, and
  -- the Hasura-surface functions the transform left standing, are dropped by
  -- `20260928181327_drop_hasura_surface_functions`. A survivor means `migrate`
  -- did not run to the end.
  SELECT string_agg(p.proname, ', ') INTO survivors
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('calculate_distance', 'calculate_vector_distance',
                       'calculate_place_vector_distance',
                       'calculate_recipe_vector_distance',
                       'calculate_category_vector_distance',
                       'get_user_vote_for_recipe', 'hasura_session_user_id',
                       'update_place_access', 'get_user_favorite_places');
  IF survivors IS NOT NULL THEN
    RAISE EXCEPTION 'dropped Hasura-surface function(s) still present: %', survivors;
  END IF;
  RAISE NOTICE 'ok: the four search functions are present, the Hasura-surface ones are gone';
END $$;
SELECT p.proname, pg_get_function_result(p.oid) AS returns
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('find_duplicate_places', 'search_category_vectors',
                     'search_places_adaptive_cluster', 'search_places_hybrid')
 ORDER BY 1;
\echo '   phantom RETURNS SETOF result tables must be gone:'
SELECT count(*) AS phantom_tables_remaining
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
   AND c.relname IN ('place_search_results', 'hybrid_search_results',
                     'search_category_vectors_results', 'duplicate_place_results');

\echo ''
\echo '== 9. money is numeric, prices survived the cast -------------------'
SELECT format_type(a.atttypid, a.atttypmod) AS menu_item_price_type
  FROM pg_attribute a
 WHERE a.attrelid = 'public.place_menu_items'::regclass
   AND a.attname = 'menu_item_price';
SELECT count(*) AS priced_rows, min(menu_item_price), max(menu_item_price)
  FROM place_menu_items WHERE menu_item_price IS NOT NULL;

\echo ''
\echo '== 10. reference data survives (A9 reads these) --------------------'
SELECT (SELECT count(*) FROM country)        AS countries,
       (SELECT count(*) FROM wine_variety)   AS wine_varieties,
       (SELECT count(*) FROM beer_style)     AS beer_styles,
       (SELECT count(*) FROM spirit_type)    AS spirit_types;

\echo ''
\echo '== 11. a read the new stack actually performs ----------------------'
-- CellarActor''s activate shape: a cellar, its owners, its items. Exercises the
-- renamed foreign keys, the `permission_type` enum and the repointed user FK in
-- one statement.
--
-- Nothing here prints who a user is. This output is the operator's terminal
-- and `$WORK/smoke.txt`, on production data: it used to show five real users'
-- email addresses. A cellar is shown by id and privacy; its name by an md5
-- prefix; its creator only as "resolves to a user row", which is the fact the
-- check is about. Every cellar's creator must resolve (`14` repointed the FK).
DO $$
DECLARE dangling bigint;
BEGIN
  SELECT count(*) INTO dangling
    FROM cellars c LEFT JOIN "user" u ON u.id = c.created_by_id
   WHERE u.id IS NULL;
  IF dangling > 0 THEN
    RAISE EXCEPTION '% cellar(s) whose created_by_id resolves to no user', dangling;
  END IF;
  RAISE NOTICE 'ok: every cellar''s creator resolves to a "user" row';
END $$;
SELECT c.id, left(md5(c.name), 8) AS name_md5, c.privacy,
       (SELECT count(*) FROM cellar_owners o WHERE o.cellar_id = c.id) AS owners,
       (SELECT count(*) FROM cellar_items i WHERE i.cellar_id = c.id)  AS items,
       u.id IS NOT NULL AS creator_resolves
  FROM cellars c
  LEFT JOIN "user" u ON u.id = c.created_by_id
 ORDER BY c.created_at
 LIMIT 5;

\echo ''
\echo '== 12. no stored secret survives: admin.credentials is gone --------'
-- Production's held a live GCP service-account private key (migration
-- `20260928194604_drop_admin_credentials`). `migrate` drops it; this fails the
-- run if it did not, and names anything else left in `admin`.
DO $$
DECLARE leftover text;
BEGIN
  IF to_regclass('admin.credentials') IS NOT NULL THEN
    RAISE EXCEPTION 'admin.credentials still exists: migrate did not drop it';
  END IF;
  IF to_regnamespace('admin') IS NOT NULL THEN
    SELECT string_agg(relname, ', ') INTO leftover
      FROM pg_class WHERE relnamespace = to_regnamespace('admin');
    RAISE EXCEPTION 'schema admin survives%', coalesce(', holding: ' || leftover, ' (no relations)');
  END IF;
  RAISE NOTICE 'ok: admin.credentials and the admin schema are gone';
END $$;

\echo ''
\echo '== smoke complete ------------------------------------------------'
