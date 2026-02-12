-- Drop the old 9-parameter overload of search_places_hybrid
-- This function has been replaced by a 10-parameter version that includes tier_list_ids
-- Hasura cannot handle function overloading, so we must drop the old version

DROP FUNCTION IF EXISTS public.search_places_hybrid(
  text,                    -- search_query
  text[],                  -- matched_categories
  double precision[],      -- category_scores
  double precision,        -- west_bound
  double precision,        -- south_bound
  double precision,        -- east_bound
  double precision,        -- north_bound
  double precision,        -- min_rating
  integer                  -- result_limit
);
