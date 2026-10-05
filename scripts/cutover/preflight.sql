-- E1 · Pre-cutover checks, run READ-ONLY against the Nhost source database.
--
-- Every question in this file is one that local data cannot answer, or one that
-- would abort the transform halfway through if it were first asked while the
-- site was down. Run it days before the cutover, not during it:
--
--   scripts/cutover/cutover.sh preflight
--
-- It writes nothing. `cutover.sh` opens every source connection with
-- `default_transaction_read_only = on`, so a stray write here fails loudly
-- rather than touching Nhost.
--
-- The reference tables `04_enum_split.sql` converts are dropped by the
-- transform, so the drift check below has to run against the source, before it.

\pset footer off
\echo ''
\echo '=============================================================='
\echo ' E1 preflight  ·  source database, read-only'
\echo '=============================================================='

\echo ''
\echo '-- 0. server settings ------------------------------------------'
-- `05_money_to_numeric.sql` reads `place_menu_items.menu_item_price` under the
-- server's *current* `lc_monetary`. Anything that renders two decimals and a
-- `.` separator ("C", "en_US.UTF-8") is exact; a comma-separator locale is not.
SELECT name, setting
  FROM pg_settings
 WHERE name IN ('lc_monetary', 'lc_numeric', 'lc_collate', 'server_version', 'TimeZone')
 ORDER BY name;

\echo ''
\echo '-- 1. users ----------------------------------------------------'
SELECT count(*)                                        AS users_total,
       count(*) FILTER (WHERE NOT email_verified)      AS email_unverified,
       count(*) FILTER (WHERE is_anonymous)            AS anonymous,
       count(*) FILTER (WHERE email IS NULL OR email::text = '') AS no_email,
       count(*) FILTER (WHERE disabled)                AS disabled
  FROM auth.users;

\echo ''
\echo '   email_verified = false is the A6 policy question. Those users keep'
\echo '   password sign-in but cannot OAuth-link after cutover, because'
\echo '   requireLocalEmailVerified stays true and no provider is trusted.'
\echo ''
\echo '-- 1b. users better-auth cannot represent (migrate-users.ts skips these)'
SELECT id, CASE
         WHEN email IS NULL OR email::text = '' THEN 'no email'
         WHEN is_anonymous THEN 'is_anonymous'
       END AS reason
  FROM auth.users
 WHERE email IS NULL OR email::text = '' OR is_anonymous
 ORDER BY created_at
 LIMIT 50;

\echo ''
\echo '-- 1c. email collisions after lowercasing (migrate-users.ts ABORTS on these)'
-- Nhost's `auth.email` is citext, so two rows can differ only by case and be
-- unique there while colliding in better-auth, which looks up by
-- `email.toLowerCase()`.
SELECT lower(email::text) AS email, count(*) AS rows, string_agg(id::text, ', ') AS ids
  FROM auth.users
 WHERE email IS NOT NULL AND email::text <> '' AND NOT is_anonymous
 GROUP BY 1
HAVING count(*) > 1
 ORDER BY 2 DESC;

\echo ''
\echo '-- 2. social providers -----------------------------------------'
-- better-auth ships google / facebook / discord in this build
-- (services/actors/src/auth/auth.ts). Anything else migrates as an `account` row
-- and counts, but that user cannot OAuth in until a provider is configured.
SELECT provider_id,
       count(*) AS accounts,
       (provider_id IN ('google', 'facebook', 'discord')) AS configured_in_better_auth
  FROM auth.user_providers
 GROUP BY provider_id
 ORDER BY 2 DESC;

\echo ''
\echo '-- 2b. rows whose (provider_id, provider_user_id) collide -------'
-- `account_provider_account_key` is UNIQUE (provider_id, account_id) and
-- migrate-users.ts inserts ON CONFLICT on exactly that pair. Nhost enforces the
-- same pair as `user_providers_provider_id_provider_user_id_key`, so this
-- should return nothing; if it does not, the second row of each group is
-- silently dropped by DO NOTHING.
SELECT provider_id, provider_user_id, count(*) AS rows,
       string_agg(user_id::text, ', ') AS user_ids
  FROM auth.user_providers
 GROUP BY 1, 2
HAVING count(*) > 1
 ORDER BY 3 DESC;

\echo ''
\echo '-- 2c. the credential-account collision surface -----------------'
-- migrate-users.ts writes (provider_id = ''credential'', account_id = user.id)
-- for every user with a password hash. Those cannot collide with each other
-- (user.id is a primary key). They *could* collide with a social row only if a
-- provider literally named "credential" existed.
SELECT count(*) AS credential_accounts_to_create
  FROM auth.users
 WHERE password_hash IS NOT NULL AND password_hash <> ''
   AND email IS NOT NULL AND email::text <> '' AND NOT is_anonymous;
SELECT count(*) AS provider_rows_named_credential
  FROM auth.user_providers WHERE provider_id = 'credential';

\echo ''
\echo '-- 3. enum drift (04_enum_split.sql aborts on any value below) --'
-- Hard-coded values, copied verbatim from `04_enum_split.sql`. If this reports
-- anything, add the value there AND to the Pothos enum before the cutover; do
-- not make `04` read the values dynamically.
DO $$
DECLARE
  spec CONSTANT jsonb := $spec$[
    {"type": "item_type", "table": "item_type", "key": "value",
     "values": ["BEER", "COFFEE", "SAKE", "SPIRIT", "TEA", "WINE"],
     "columns": [["item_favorites", "type"]]},
    {"type": "permission_type", "table": "permission_type", "key": "value",
     "values": ["FRIENDS", "PRIVATE", "PUBLIC"],
     "columns": [["cellars", "privacy"], ["tier_lists", "privacy"]]},
    {"type": "friend_request_status", "table": "friend_request_status", "key": "value",
     "values": ["ACCEPTED", "PENDING"],
     "columns": [["friend_requests", "status"]]},
    {"type": "instruction_types", "table": "instruction_types", "key": "id",
     "values": ["chill", "cook", "garnish", "mix", "prep", "serve"],
     "columns": [["recipe_instructions", "instruction_type"]]},
    {"type": "brand_types", "table": "brand_types", "key": "id",
     "values": ["brewery", "distillery", "kura", "manufacturer", "other",
                "restaurant_chain", "roastery", "tea_house", "winery"],
     "columns": [["brands", "brand_type"]]},
    {"type": "recipe_category", "table": "recipe_category", "key": "value",
     "values": ["cocktail", "mocktail", "other", "punch", "shot"],
     "columns": [["recipe_groups", "category"]]},
    {"type": "coffee_roast_level", "table": "coffee_roast_level", "key": "value",
     "values": ["DARK", "EXTRA_DARK", "LIGHT", "LIGHT_MEDIUM", "MEDIUM", "MEDIUM_DARK"],
     "columns": [["coffees", "roast_level"]]},
    {"type": "coffee_process", "table": "coffee_process", "key": "value",
     "values": ["HONEY", "NATURAL_DRY", "PULPED_NATURAL", "PULPED_NATURAL_HONEY",
                "WASHED", "WET_HULLED"],
     "columns": [["coffees", "process"]]},
    {"type": "coffee_species", "table": "coffee_species", "key": "value",
     "values": ["ARABICA", "CHARRIERIANA", "LIBERICA", "ROBUSTA", "STENOPHYLLA"],
     "columns": [["coffees", "species"]]},
    {"type": "tea_caffeine_level", "table": "tea_caffeine_level", "key": "value",
     "values": ["decaf", "high", "low", "medium", "none"],
     "columns": [["teas", "caffeine_level"]]},
    {"type": "tea_form", "table": "tea_form", "key": "value",
     "values": ["brick", "instant", "loose_leaf", "matcha_powder", "sachet", "tea_bag"],
     "columns": [["teas", "form"]]},
    {"type": "sake_serving_temperature", "table": "sake_serving_temperature", "key": "value",
     "values": ["atsu_kan", "hitohada_kan", "hiya", "jo_kan", "nuru_kan", "rei_shu",
                "room_temperature", "tobikiri_kan", "yuki_hie"],
     "columns": [["sakes", "serving_temperature"]]}
  ]$spec$::jsonb;
  entry jsonb;
  col jsonb;
  values_list text[];
  stray text;
  found int := 0;
BEGIN
  FOR entry IN SELECT * FROM jsonb_array_elements(spec) LOOP
    SELECT array_agg(v) INTO values_list
      FROM jsonb_array_elements_text(entry -> 'values') AS v;

    -- The lookup table itself.
    EXECUTE format(
      'SELECT string_agg(DISTINCT t.%I::text, '', '') FROM public.%I t '
      'WHERE t.%I::text <> ALL ($1)',
      entry ->> 'key', entry ->> 'table', entry ->> 'key')
      INTO stray USING values_list;
    IF stray IS NOT NULL THEN
      found := found + 1;
      RAISE WARNING 'DRIFT  table %.% holds unknown value(s): %',
        entry ->> 'table', entry ->> 'key', stray;
    END IF;

    -- And every column that will be retyped, in case a column carries a value
    -- the FK never covered (nullable text columns with no constraint do exist).
    FOR col IN SELECT * FROM jsonb_array_elements(entry -> 'columns') LOOP
      EXECUTE format(
        'SELECT string_agg(DISTINCT t.%I::text, '', '') FROM public.%I t '
        'WHERE t.%I IS NOT NULL AND t.%I::text <> ALL ($1)',
        col ->> 1, col ->> 0, col ->> 1, col ->> 1)
        INTO stray USING values_list;
      IF stray IS NOT NULL THEN
        found := found + 1;
        RAISE WARNING 'DRIFT  column %.% holds unknown value(s): %',
          col ->> 0, col ->> 1, stray;
      END IF;
    END LOOP;
  END LOOP;

  IF found = 0 THEN
    -- Counted from `spec`, not written down: this said "14 columns" while the
    -- spec had 13 (`permission_type` covers two).
    RAISE NOTICE 'enum drift: none — all % types and % columns cast cleanly',
      jsonb_array_length(spec),
      (SELECT sum(jsonb_array_length(e -> 'columns')) FROM jsonb_array_elements(spec) e);
  ELSE
    RAISE NOTICE 'enum drift: % problem(s) above; 04_enum_split.sql WILL abort', found;
  END IF;
END $$;

\echo ''
\echo '-- 3b. friend_request_status = ACCEPTED (the enum-value question) '
-- B6 deletes the request on acceptance, so nothing writes ACCEPTED any more.
-- If this is 0 the label is unreachable; if it is not, historical rows hold it
-- and the label must stay. Either way, keeping it costs one unused label and
-- removing it would abort the transform on any surviving row.
SELECT status, count(*) FROM friend_requests GROUP BY 1 ORDER BY 2 DESC;

\echo ''
\echo '-- 3c. item_onboardings.status — the values a CHECK would have to allow'
-- B2 flagged this column as bare `text` with no check constraint.
-- `ONBOARDING_STATUSES` in `packages/contracts/src/onboarding.ts` is
-- START / COMPLETED / CONFIRMED / FAILED. Anything else below is a historical
-- value a constraint would reject, and is the evidence B2 needs before adding
-- one. E1 does not add it: a CHECK is introspected into `tables.ts`, and §7
-- reserves baseline changes to the B/C/A7 workstreams.
SELECT status, count(*) FROM item_onboardings GROUP BY 1 ORDER BY 2 DESC;

\echo ''
\echo '-- 3d. item_reviews.text — `json`, not `jsonb` -------------------'
-- The other B2 finding. `jsonb` would normalise whitespace, drop duplicate
-- keys and lose key order. This reports whether any stored value would change
-- under that normalisation, so the conversion can be judged rather than
-- guessed. `json_typeof` also shows whether the column is really an object.
SELECT count(*) AS rows,
       count(*) FILTER (WHERE text IS NOT NULL) AS non_null,
       count(*) FILTER (WHERE text IS NOT NULL
                          AND text::text IS DISTINCT FROM text::jsonb::text)
         AS would_change_under_jsonb
  FROM item_reviews;
SELECT json_typeof(text) AS shape, count(*)
  FROM item_reviews WHERE text IS NOT NULL GROUP BY 1 ORDER BY 2 DESC;

\echo ''
\echo '-- 4. duplicate sake/tea favourites (08 ABORTS on these) --------'
SELECT 'sake' AS kind, user_id, sake_id AS item_id, count(*)
  FROM item_favorites WHERE sake_id IS NOT NULL
 GROUP BY 1, 2, 3 HAVING count(*) > 1
UNION ALL
SELECT 'tea', user_id, tea_id, count(*)
  FROM item_favorites WHERE tea_id IS NOT NULL
 GROUP BY 1, 2, 3 HAVING count(*) > 1
 ORDER BY 4 DESC;

\echo ''
\echo '-- 4b. tea countries with no country row (18 ABORTS on these) ----'
-- `teas.country` was free text on Nhost; the other five item types always had
-- `country -> country(value)`. `18_teas_country_fk.sql` adds the same foreign
-- key, and `cutover.sh` runs it in `transform-c` -- against production rows,
-- with the site already frozen -- where `ADD CONSTRAINT` validates every row
-- and aborts the phase on the first value `country` does not hold. Nothing
-- earlier in the transform touches `teas.country` or the `country` table, so
-- asking the source now is asking the question `18` will ask.
--
-- Empty is the only passing answer. A row below is a data decision to make in
-- daylight: map the value to the `country` row it means (`upper()` below shows
-- the likely one -- `country.value` is uppercase, and `11`'s sake default
-- failed on exactly this), or null it. Not a schema change.
SELECT t.country,
       count(*) AS teas,
       (SELECT string_agg(c.value, ' | ') FROM country c
         WHERE upper(c.value) = upper(t.country)) AS case_insensitive_match,
       array_to_string((array_agg(t.id::text ORDER BY t.id))[1:10], ', ')
         AS first_tea_ids
  FROM teas t
 WHERE t.country IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM country c WHERE c.value = t.country)
 GROUP BY t.country
 ORDER BY 2 DESC, 1;

\echo ''
\echo '-- 5. money -> numeric spot check (05) --------------------------'
SELECT count(*) AS priced_rows,
       min(menu_item_price) AS min_price,
       max(menu_item_price) AS max_price
  FROM place_menu_items WHERE menu_item_price IS NOT NULL;
SELECT id, menu_item_price AS as_money, menu_item_price::numeric AS as_numeric
  FROM place_menu_items WHERE menu_item_price IS NOT NULL
 ORDER BY menu_item_price DESC LIMIT 10;
-- Any value that loses precision through the cast. `money` is an integer number
-- of hundredths internally, so this must be empty on every locale that renders
-- two decimals.
SELECT count(*) AS lossy_casts
  FROM place_menu_items
 WHERE menu_item_price IS NOT NULL
   AND menu_item_price::numeric::money IS DISTINCT FROM menu_item_price;

\echo ''
\echo '-- 6. files (A8) -----------------------------------------------'
SELECT count(*) AS files_total,
       count(*) FILTER (WHERE is_uploaded)      AS uploaded,
       count(*) FILTER (WHERE NOT is_uploaded)  AS not_uploaded_skipped,
       pg_size_pretty(coalesce(sum(size), 0))   AS bytes_to_copy,
       count(DISTINCT bucket_id)                AS logical_buckets
  FROM storage.files;
\echo '   (bytes_to_copy is the object-copy phase; it dominates the run.)'
SELECT bucket_id, count(*) AS files, pg_size_pretty(coalesce(sum(size), 0)) AS bytes
  FROM storage.files GROUP BY 1 ORDER BY 2 DESC;
\echo '-- 6b. application rows that reference a file (09/10/12 guard these)'
SELECT 'item_image.file_id' AS ref, count(*) FROM item_image WHERE file_id IS NOT NULL
UNION ALL SELECT 'item_onboardings.front_label_image_id', count(*) FROM item_onboardings WHERE front_label_image_id IS NOT NULL
UNION ALL SELECT 'item_onboardings.back_label_image_id', count(*) FROM item_onboardings WHERE back_label_image_id IS NOT NULL
UNION ALL SELECT 'place_google_photos.storage_file_id', count(*) FROM place_google_photos WHERE storage_file_id IS NOT NULL
UNION ALL SELECT 'menu_scans.original_image_id', count(*) FROM menu_scans WHERE original_image_id IS NOT NULL
UNION ALL SELECT 'menu_scans.processed_image_id', count(*) FROM menu_scans WHERE processed_image_id IS NOT NULL;
\echo '-- 6c. references to a file row that is NOT is_uploaded ---------'
-- migrate-files.ts skips `is_uploaded = false`, so a row referencing one would
-- make 09/10/12 abort. This is the check that turns that into a decision made
-- now rather than an abort during the outage window.
SELECT 'item_image' AS tbl, count(*) FROM item_image i
  JOIN storage.files f ON f.id = i.file_id WHERE NOT f.is_uploaded
UNION ALL SELECT 'item_onboardings.front', count(*) FROM item_onboardings o
  JOIN storage.files f ON f.id = o.front_label_image_id WHERE NOT f.is_uploaded
UNION ALL SELECT 'item_onboardings.back', count(*) FROM item_onboardings o
  JOIN storage.files f ON f.id = o.back_label_image_id WHERE NOT f.is_uploaded
UNION ALL SELECT 'place_google_photos', count(*) FROM place_google_photos p
  JOIN storage.files f ON f.id = p.storage_file_id WHERE NOT f.is_uploaded
UNION ALL SELECT 'menu_scans.original', count(*) FROM menu_scans m
  JOIN storage.files f ON f.id = m.original_image_id WHERE NOT f.is_uploaded
UNION ALL SELECT 'menu_scans.processed', count(*) FROM menu_scans m
  JOIN storage.files f ON f.id = m.processed_image_id WHERE NOT f.is_uploaded;
\echo '-- 6d. references to a file id with no storage.files row at all --'
SELECT 'item_image' AS tbl, count(*) FROM item_image i
  WHERE i.file_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM storage.files f WHERE f.id = i.file_id)
UNION ALL SELECT 'menu_scans.original', count(*) FROM menu_scans m
  WHERE m.original_image_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM storage.files f WHERE f.id = m.original_image_id);

\echo ''
\echo '-- 7. admin.credentials (migration-plan §9 open question) -------'
SELECT count(*) AS rows FROM admin.credentials;
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'admin' AND table_name = 'credentials'
 ORDER BY ordinal_position;

\echo ''
\echo '-- 8. constraint-name budget (07 and 14 abort past 63 bytes) ----'
-- 07 lists three over-long derived names verbatim and aborts if a fourth
-- appears; 14 derives `<table>_<cols>_user_id_fkey` and aborts past 63 bytes.
SELECT src.relname AS table_name, con.conname AS current_name,
       length(src.relname || '_' ||
         (SELECT string_agg(a.attname, '_' ORDER BY k.ord)
            FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = src.oid AND a.attnum = k.attnum)
         || '_user_id_fkey') AS derived_len
  FROM pg_constraint con
  JOIN pg_class src ON src.oid = con.conrelid
  JOIN pg_namespace sn ON sn.oid = src.relnamespace
  JOIN pg_class tgt ON tgt.oid = con.confrelid
  JOIN pg_namespace tn ON tn.oid = tgt.relnamespace
 WHERE con.contype = 'f' AND sn.nspname = 'public'
   AND tn.nspname = 'auth' AND tgt.relname = 'users'
   AND length(src.relname || '_' ||
         (SELECT string_agg(a.attname, '_' ORDER BY k.ord)
            FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = src.oid AND a.attnum = k.attnum)
         || '_user_id_fkey') > 63
 ORDER BY 3 DESC;
SELECT count(*) AS fks_into_auth_users
  FROM pg_constraint con
  JOIN pg_class src ON src.oid = con.conrelid
  JOIN pg_namespace sn ON sn.oid = src.relnamespace
  JOIN pg_class tgt ON tgt.oid = con.confrelid
  JOIN pg_namespace tn ON tn.oid = tgt.relnamespace
 WHERE con.contype = 'f' AND sn.nspname = 'public'
   AND tn.nspname = 'auth' AND tgt.relname = 'users';
\echo '   (X2 measured 31 across 28 tables. A different number means an Nhost'
\echo '    migration added or removed one — 14 handles it, but say so in the PR.)'

\echo ''
\echo '-- 9. database size (sets the dump/restore budget) --------------'
SELECT pg_size_pretty(pg_database_size(current_database())) AS total;
SELECT n.nspname AS schema,
       pg_size_pretty(sum(pg_total_relation_size(c.oid))) AS size
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE c.relkind IN ('r', 'm') AND n.nspname NOT LIKE 'pg\_%'
   AND n.nspname <> 'information_schema'
 GROUP BY 1 ORDER BY sum(pg_total_relation_size(c.oid)) DESC;

\echo ''
\echo '-- 10. A1 indexes (informational since 17_target_indexes.sql) ---'
-- E4 decision 1. This used to be a blocking unknown: A1 is recorded
-- `done (local; the prod apply belongs to the user)`, only
-- `idx_cellars_privacy_public`
-- was recreated by the transform, and a source missing the other four produced
-- a non-empty baseline diff — aborting the runbook with the site frozen.
--
-- `packages/db/transform/17_target_indexes.sql` now creates all 145 indexes the
-- target schema declares, idempotently, so a `missing` row below no longer
-- stops anything. It is still worth printing: these are worth up to 300x on the
-- hottest queries (target-stack §7), so anything missing here is a live
-- slowness on Nhost for as long as Nhost keeps serving, and a `missing` row
-- also tells you the freeze includes a genuine index build rather than 145
-- name checks.
SELECT expected.indexname,
       CASE WHEN i.indexname IS NULL THEN 'MISSING' ELSE 'present' END AS state
  FROM (VALUES ('idx_cellar_items_cellar_id'),
               ('idx_cellars_created_by_id'),
               ('idx_cellars_privacy_public'),
               ('idx_friends_friend_user'),
               ('idx_cellar_owners_cellar')) AS expected(indexname)
  LEFT JOIN pg_indexes i
         ON i.schemaname = 'public' AND i.indexname = expected.indexname
 ORDER BY 2, 1;

\echo ''
\echo '=============================================================='
\echo ' preflight complete — nothing above was written to'
\echo '=============================================================='
