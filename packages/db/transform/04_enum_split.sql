-- 04 · The migration-plan §4 enum split.
--
-- Twelve reference tables become native Postgres enum types (Drizzle `pgEnum`,
-- Pothos `enumType`, gql.tada literal unions) because application code branches
-- on their values. The other ten stay as tables behind `ReferenceDataActor`
-- because they are catalogs with display data that code never branches on:
--   country, wine_variety, wine_style, beer_style, spirit_type,
--   coffee_cultivar, sake_category, sake_type, sake_rice_variety, tea_category.
--
-- Each converted table today is a two-column `(value|id, comment)` lookup with a
-- FK from every column that uses it. After this step the lookup table is gone,
-- the FK is gone, and the column carries the enum type of the same name.
--
-- Enum values are hard-coded, not read from the table, so that the Drizzle
-- baseline is identical in every environment. The block asserts the table holds
-- no value outside the hard-coded list and fails loudly if production has drifted
-- — that assertion is the whole point of hard-coding them, so do not replace it
-- with a dynamic read.
--
-- Value order is alphabetical, which is exactly the ordering these columns have
-- today as `text`. Enum order is the sort order, so alphabetical is the only
-- choice that leaves existing `ORDER BY` results unchanged.
--
-- Re-runnable. Destroys: 12 reference tables, 14 FK constraints. Column data is
-- preserved (cast text -> enum); a value that does not cast aborts the transform.
--
-- E1 DECISION (2026-09-09): `friend_request_status` keeps its `ACCEPTED` label
-- even though B6 left nothing writing it -- the request is deleted on
-- acceptance, matching today's behaviour. Postgres has no `DROP VALUE`, so
-- retiring a label means recreating the type and retyping the column: a table
-- rewrite inside the outage window, plus matching edits here and in the Pothos
-- enum, to remove one unreachable label -- and it is impossible at all if any
-- historical row still holds it. `scripts/cutover/preflight.sql` section 3b
-- counts those rows against production.

-- `idx_cellars_privacy_public` (workstream A1) has the predicate
-- `privacy = 'PUBLIC'::text`. Postgres rebuilds plain indexes across an
-- `ALTER COLUMN ... TYPE`, but it cannot re-resolve a predicate whose operator
-- (`text = text`) no longer applies, so the index is dropped here and recreated
-- against the enum below. Any other predicate or expression index on a converted
-- column will make the ALTER below fail with Postgres's own error — that is
-- intentional; add it here rather than weakening the transform.
DROP INDEX IF EXISTS public.idx_cellars_privacy_public;

DO $$
DECLARE
  spec CONSTANT jsonb := $spec$[
    {"type": "item_type", "table": "item_type", "key": "value",
     "values": ["BEER", "COFFEE", "SAKE", "SPIRIT", "TEA", "WINE"],
     "columns": [["item_favorites", "type"]],
     "generated_as": {
       "item_favorites.type": "CASE WHEN beer_id IS NOT NULL THEN 'BEER'::public.item_type WHEN wine_id IS NOT NULL THEN 'WINE'::public.item_type WHEN coffee_id IS NOT NULL THEN 'COFFEE'::public.item_type WHEN sake_id IS NOT NULL THEN 'SAKE'::public.item_type WHEN tea_id IS NOT NULL THEN 'TEA'::public.item_type ELSE 'SPIRIT'::public.item_type END"
     }},

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
  type_name text;
  lookup_table text;
  key_col text;
  values_list text[];
  stray text;
  fk record;
  target_table text;
  target_col text;
  current_type text;
  default_expr text;
  is_generated boolean;
  is_not_null boolean;
  generated_expr text;
  literal_default text;
BEGIN
  FOR entry IN SELECT * FROM jsonb_array_elements(spec)
  LOOP
    type_name := entry ->> 'type';
    lookup_table := entry ->> 'table';
    key_col := entry ->> 'key';
    SELECT array_agg(v ORDER BY ord)
      INTO values_list
      FROM jsonb_array_elements_text(entry -> 'values') WITH ORDINALITY AS t(v, ord);

    ----------------------------------------------------------------------------
    -- 1. Guard: the live reference table must not hold a value this file does
    --    not know about. Skipped on a re-run, when the table is already gone.
    ----------------------------------------------------------------------------
    IF to_regclass(format('public.%I', lookup_table)) IS NOT NULL THEN
      EXECUTE format(
        'SELECT %I::text FROM public.%I WHERE NOT (%I::text = ANY($1)) LIMIT 1',
        key_col, lookup_table, key_col
      ) INTO stray USING values_list;

      IF stray IS NOT NULL THEN
        RAISE EXCEPTION
          'reference table public.% holds %, which is not in the hard-coded value list for enum %. Add it to 04_enum_split.sql (and to the Pothos enum) before re-running.',
          lookup_table, quote_literal(stray), type_name;
      END IF;

      ------------------------------------------------------------------------
      -- 2. Drop every FK pointing at the reference table, then the table. The
      --    composite type of the table occupies the type name, so the table has
      --    to go before the enum type can take its name.
      ------------------------------------------------------------------------
      FOR fk IN
        SELECT n.nspname AS schema_name, c.relname AS table_name, con.conname AS constraint_name
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE con.contype = 'f'
          AND con.confrelid = to_regclass(format('public.%I', lookup_table))
      LOOP
        EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I',
                       fk.schema_name, fk.table_name, fk.constraint_name);
      END LOOP;

      EXECUTE format('DROP TABLE public.%I', lookup_table);
    END IF;

    ----------------------------------------------------------------------------
    -- 3. Create the enum type.
    ----------------------------------------------------------------------------
    IF NOT EXISTS (
      SELECT 1 FROM pg_type
      WHERE typname = type_name AND typnamespace = 'public'::regnamespace
    ) THEN
      EXECUTE format('CREATE TYPE public.%I AS ENUM (%s)',
                     type_name,
                     (SELECT string_agg(quote_literal(v), ', ')
                        FROM unnest(values_list) AS v));
    END IF;

    ----------------------------------------------------------------------------
    -- 4. Retype the referencing columns, carrying their defaults across.
    ----------------------------------------------------------------------------
    FOR col IN SELECT * FROM jsonb_array_elements(entry -> 'columns')
    LOOP
      target_table := col ->> 0;
      target_col := col ->> 1;

      SELECT format_type(a.atttypid, a.atttypmod),
             pg_get_expr(ad.adbin, ad.adrelid),
             a.attgenerated = 's',
             a.attnotnull
        INTO current_type, default_expr, is_generated, is_not_null
        FROM pg_attribute a
        LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
        WHERE a.attrelid = to_regclass(format('public.%I', target_table))
          AND a.attname = target_col
          AND NOT a.attisdropped;

      IF current_type IS NULL THEN
        RAISE EXCEPTION 'column public.%.% does not exist', target_table, target_col;
      END IF;

      CONTINUE WHEN current_type = format('%I', type_name) OR current_type = type_name;

      ------------------------------------------------------------------------
      -- A STORED GENERATED column cannot be retyped in place: Postgres rejects
      -- `USING` on one, and a generation expression may not contain a text ->
      -- enum cast (that cast is only STABLE, and generation expressions must be
      -- IMMUTABLE). The column is therefore dropped and re-added with the arms
      -- of its CASE producing enum literals directly. Consequences, both
      -- deliberate: the column moves to the end of the table, and its values are
      -- recomputed from the other columns — which is what "generated" means, so
      -- no data is lost. The replacement expression is written out in the spec
      -- above rather than derived, so that it is reviewable.
      ------------------------------------------------------------------------
      IF is_generated THEN
        generated_expr := entry -> 'generated_as' ->> format('%s.%s', target_table, target_col);
        IF generated_expr IS NULL THEN
          RAISE EXCEPTION
            'public.%.% is a generated column but 04_enum_split.sql has no replacement expression for it',
            target_table, target_col;
        END IF;

        EXECUTE format('ALTER TABLE public.%I DROP COLUMN %I', target_table, target_col);
        EXECUTE format(
          'ALTER TABLE public.%I ADD COLUMN %I public.%I GENERATED ALWAYS AS (%s) STORED %s',
          target_table, target_col, type_name, generated_expr,
          CASE WHEN is_not_null THEN 'NOT NULL' ELSE '' END
        );
        CONTINUE;
      END IF;

      IF default_expr IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP DEFAULT',
                       target_table, target_col);
      END IF;

      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN %I TYPE public.%I USING %I::text::public.%I',
        target_table, target_col, type_name, target_col, type_name
      );

      IF default_expr IS NOT NULL THEN
        -- A constant default (every one here is) is re-set as a plain enum
        -- literal so the catalog reads `'PRIVATE'::permission_type` rather than
        -- a nested `('PRIVATE'::text)::permission_type`. Anything not constant-
        -- foldable keeps the wrapped form.
        BEGIN
          EXECUTE format('SELECT (%s)::text', default_expr) INTO literal_default;
          EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET DEFAULT %L::public.%I',
                         target_table, target_col, literal_default, type_name);
        EXCEPTION WHEN others THEN
          EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET DEFAULT (%s)::public.%I',
                         target_table, target_col, default_expr, type_name);
        END;
      END IF;
    END LOOP;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_cellars_privacy_public
  ON public.cellars (id)
  WHERE privacy = 'PUBLIC'::public.permission_type;
