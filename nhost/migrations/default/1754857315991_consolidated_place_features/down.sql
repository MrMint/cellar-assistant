-- Down migration for consolidated place features
-- This removes all place-related schema changes

-- Drop spatial functions
DROP FUNCTION IF EXISTS public.get_user_favorite_places(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.update_place_access(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_places_in_bounds(NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT[], INTEGER);
DROP FUNCTION IF EXISTS public.calculate_distance(public.places, GEOGRAPHY);
DROP FUNCTION IF EXISTS public.search_cached_places_nearby(GEOGRAPHY, INTEGER, TEXT[], INTEGER);
DROP FUNCTION IF EXISTS public.places_distance(geography, geography);
DROP FUNCTION IF EXISTS public.places_within_distance(geography, geography, integer);

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS public.item_match_suggestions CASCADE;
DROP TABLE IF EXISTS public.place_menu_items CASCADE;
DROP TABLE IF EXISTS public.menu_scans CASCADE;
DROP TABLE IF EXISTS public.place_menus CASCADE;
DROP TABLE IF EXISTS public.user_place_interactions CASCADE;

-- Remove source tracking columns from cellar_items if they exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cellar_items' AND column_name='source_menu_item_id') THEN
    ALTER TABLE public.cellar_items DROP COLUMN source_menu_item_id;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cellar_items' AND column_name='source_place_id') THEN
    ALTER TABLE public.cellar_items DROP COLUMN source_place_id;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cellar_items' AND column_name='source_type') THEN
    ALTER TABLE public.cellar_items DROP COLUMN source_type;
  END IF;
END
$$;

-- Note: We don't drop the places table as it may have been pre-existing
-- If you need to drop it completely, uncomment the line below:
-- DROP TABLE IF EXISTS public.places CASCADE;