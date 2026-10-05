-- Hand-written SQL lane (migration-plan.md §8.6, workstream A3b).
--
-- The five pgvector/PostGIS distance helpers. `transform/` never touched these —
-- they take a table's composite row type as their first argument
-- (`item_vectors`, `place_vectors`, `recipe_vectors`, `category_vectors`, `places`,
-- none of which were dropped or renamed at cutover) — so they still exist in a
-- freshly transformed database. But Drizzle does not model functions at all, so
-- nothing in `packages/db` reproduces them from source; a database built from
-- migrations alone would be missing all five until this file exists. `CREATE OR
-- REPLACE` makes them idempotent against a database where they already survived
-- the transform untouched.
--
-- Ported verbatim (`pg_get_functiondef`, 2026-09-08). No signature or body change
-- of any kind — unlike the four search functions, these don't return a phantom
-- `SETOF <table>`, so there is nothing to convert.

--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.calculate_vector_distance(item_vector item_vectors, search halfvec)
 RETURNS double precision
 LANGUAGE sql
 STABLE
AS $function$
  SELECT item_vector.vector <=> search
$function$;

--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.calculate_place_vector_distance(place_vector place_vectors, search halfvec)
 RETURNS double precision
 LANGUAGE sql
 STABLE
AS $function$
  SELECT place_vector.vector <=> search
$function$;

--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.calculate_recipe_vector_distance(recipe_vector recipe_vectors, query_vector halfvec)
 RETURNS double precision
 LANGUAGE sql
 STABLE
AS $function$
  SELECT recipe_vector.vector <=> query_vector
$function$;

--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.calculate_category_vector_distance(category_vector category_vectors, query_vector halfvec)
 RETURNS double precision
 LANGUAGE sql
 STABLE
AS $function$
  SELECT category_vector.vector <=> query_vector
$function$;

--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.calculate_distance(place_row places, user_location geography)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN ST_Distance(place_row.location, user_location);
END;
$function$;

--> statement-breakpoint

-- Down (manual — see the note in 20260909043234_hand_written_sql_lane/migration.sql):
--
-- DROP FUNCTION IF EXISTS public.calculate_vector_distance(item_vectors, halfvec);
-- DROP FUNCTION IF EXISTS public.calculate_place_vector_distance(place_vectors, halfvec);
-- DROP FUNCTION IF EXISTS public.calculate_recipe_vector_distance(recipe_vectors, halfvec);
-- DROP FUNCTION IF EXISTS public.calculate_category_vector_distance(category_vectors, halfvec);
-- DROP FUNCTION IF EXISTS public.calculate_distance(places, geography);
