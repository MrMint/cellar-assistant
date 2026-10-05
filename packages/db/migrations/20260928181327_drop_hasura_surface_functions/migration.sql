-- Drop the Hasura-era SQL functions nothing calls any more.
--
-- Nineteen functions in `public` existed only because Hasura exposed SQL
-- functions as GraphQL: computed fields (a function whose first argument is a
-- table's row type) and tracked queries/mutations. The actor stack reaches
-- Postgres through Drizzle and never calls a SQL function by name except the
-- four place/category search functions (`hand_written_sql_lane`), and those,
-- together with every trigger function, are NOT touched here.
--
-- Two groups:
--
--  * The five computed-field distance helpers (`calculate_*distance`, first
--    argument a row type). `20260910003755_pgvector_distance_helpers` re-created
--    them "verbatim" so a migrations-only build matched a transformed one;
--    nothing ever called them from TypeScript. The cutover smoke check
--    (`scripts/cutover/smoke.sql`) required them to exist and is updated in the
--    same change.
--  * Fourteen transform survivors that no migration creates at all: recipe
--    votes (`count_recipe_up/downvotes`, `calculate_recipe_vote_score`,
--    `get_recipe_vote_summary`, `get_user_vote_for_recipe(uuid, json)` — the
--    json is a Hasura session), recipe groups (`get_canonical_recipe_*`,
--    `calculate_group_average_rating`, `count_recipes_in_group`),
--    `create_recipe_with_ingredients`, `get_user_favorite_places`,
--    `update_place_access`, and the Nhost tier-list visibility pair
--    (`hasura_session_user_id(json)`, `visible_tier_list_ids`) whose only
--    caller was the Hasura-era body of `search_places_hybrid` that
--    `hand_written_sql_lane` replaced. Because only a transform-built database
--    had them, a database built from the Nhost dump and one built from
--    migrations disagreed about `public`'s functions; after this they agree.
--
-- `IF EXISTS` because the set differs by build: the cellar-stack database
-- (built from an older dump) lacks the last two. Exact signatures from
-- `pg_proc` (`oid::regprocedure`) on a transform-built database, 2026-09-28.
-- No `CASCADE`: nothing depends on any of them, and if something did the
-- migration should fail rather than silently take it along.
--
-- `services/actors/src/lib/public-functions.test.ts` holds the allow-list of
-- functions that may exist in `public` after this, so none of these can come
-- back unnoticed.
DROP FUNCTION IF EXISTS public.calculate_category_vector_distance(public.category_vectors, halfvec);--> statement-breakpoint
DROP FUNCTION IF EXISTS public.calculate_distance(public.places, geography);--> statement-breakpoint
DROP FUNCTION IF EXISTS public.calculate_place_vector_distance(public.place_vectors, halfvec);--> statement-breakpoint
DROP FUNCTION IF EXISTS public.calculate_recipe_vector_distance(public.recipe_vectors, halfvec);--> statement-breakpoint
DROP FUNCTION IF EXISTS public.calculate_vector_distance(public.item_vectors, halfvec);--> statement-breakpoint
DROP FUNCTION IF EXISTS public.calculate_group_average_rating(uuid);--> statement-breakpoint
DROP FUNCTION IF EXISTS public.calculate_recipe_vote_score(uuid);--> statement-breakpoint
DROP FUNCTION IF EXISTS public.count_recipe_downvotes(uuid);--> statement-breakpoint
DROP FUNCTION IF EXISTS public.count_recipe_upvotes(uuid);--> statement-breakpoint
DROP FUNCTION IF EXISTS public.count_recipes_in_group(uuid);--> statement-breakpoint
DROP FUNCTION IF EXISTS public.create_recipe_with_ingredients(text, text, text);--> statement-breakpoint
DROP FUNCTION IF EXISTS public.get_canonical_recipe_calculation(uuid);--> statement-breakpoint
DROP FUNCTION IF EXISTS public.get_canonical_recipe_for_group(uuid);--> statement-breakpoint
DROP FUNCTION IF EXISTS public.get_recipe_vote_summary(uuid);--> statement-breakpoint
DROP FUNCTION IF EXISTS public.get_user_favorite_places(uuid, integer);--> statement-breakpoint
DROP FUNCTION IF EXISTS public.get_user_vote_for_recipe(uuid, json);--> statement-breakpoint
DROP FUNCTION IF EXISTS public.update_place_access(uuid, text);--> statement-breakpoint
DROP FUNCTION IF EXISTS public.visible_tier_list_ids(uuid[], uuid);--> statement-breakpoint
DROP FUNCTION IF EXISTS public.hasura_session_user_id(json);
