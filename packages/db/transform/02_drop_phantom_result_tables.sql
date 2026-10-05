-- 02 · Drop the phantom `RETURNS SETOF` result tables and the four search
--      functions that return them.
--
-- Hasura cannot track a function returning `TABLE(...)`, so the four search
-- functions were given a real, permanently-empty table as their return type
-- (migration-plan §3, "Removed at cutover"). Those tables are not data; they are
-- a Hasura workaround, and Drizzle would otherwise baseline them as real tables.
--
-- The functions themselves are NOT gone from the system — migration-plan §5 keeps
-- them in the hand-written SQL lane (§8.6), rewritten to return `TABLE(...)`
-- instead of `SETOF <phantom table>`. Dropping them here is what makes the
-- phantom tables droppable; the follow-up hand-written-SQL workstream re-creates
-- them (see transform/README.md, "Left for the hand-written SQL lane").
--
-- Re-runnable. Destroys: four functions and four empty tables.

DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_class c ON c.reltype = p.prorettype
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'place_search_results',
        'hybrid_search_results',
        'search_category_vectors_results',
        'duplicate_place_results'
      )
  LOOP
    RAISE NOTICE 'dropping SETOF-phantom function %', f.signature;
    EXECUTE format('DROP FUNCTION IF EXISTS %s', f.signature);
  END LOOP;
END $$;

-- No CASCADE: anything still depending on these tables is a surprise that E1
-- must see, not swallow.
DROP TABLE IF EXISTS public.place_search_results;
DROP TABLE IF EXISTS public.hybrid_search_results;
DROP TABLE IF EXISTS public.search_category_vectors_results;
DROP TABLE IF EXISTS public.duplicate_place_results;
