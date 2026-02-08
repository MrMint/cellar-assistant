-- Reverse hybrid place search migration

-- Recreate dropped functions
CREATE OR REPLACE FUNCTION public.get_places_in_bounds(
  sw_lat numeric, sw_lng numeric, ne_lat numeric, ne_lng numeric,
  category_filter text[] DEFAULT NULL, limit_count integer DEFAULT 200
)
RETURNS SETOF places
LANGUAGE plpgsql STABLE
AS $function$
DECLARE
  bounds_geom GEOMETRY;
BEGIN
  bounds_geom := ST_MakeEnvelope(sw_lng, sw_lat, ne_lng, ne_lat, 4326);
  RETURN QUERY
  SELECT p.*
  FROM public.places p
  WHERE ST_Within(p.location::geometry, bounds_geom)
    AND p.is_active = true
    AND (category_filter IS NULL OR p.categories && category_filter)
  ORDER BY p.confidence DESC, p.last_accessed_at DESC NULLS LAST
  LIMIT limit_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_cached_places_nearby(
  user_location geography, radius_meters integer DEFAULT 5000,
  category_filter text[] DEFAULT NULL, limit_count integer DEFAULT 50
)
RETURNS SETOF places
LANGUAGE plpgsql STABLE
AS $function$
BEGIN
  RETURN QUERY
  SELECT p.*
  FROM public.places p
  WHERE ST_DWithin(p.location, user_location, radius_meters)
    AND p.is_active = true
    AND (category_filter IS NULL OR p.categories && category_filter)
  ORDER BY p.last_accessed_at DESC NULLS LAST, ST_Distance(p.location, user_location)
  LIMIT limit_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.places_distance(
  place_location geography, center_point geography
)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
AS $function$
BEGIN
  RETURN ST_Distance(place_location, center_point);
END;
$function$;

CREATE OR REPLACE FUNCTION public.places_within_distance(
  place_location geography, center_point geography, distance_meters integer
)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
AS $function$
BEGIN
  RETURN ST_DWithin(place_location, center_point, distance_meters);
END;
$function$;

-- Drop hybrid search
DROP FUNCTION IF EXISTS public.search_places_hybrid;
DROP TABLE IF EXISTS public.hybrid_search_results;

-- Drop category vector search
DROP FUNCTION IF EXISTS public.search_category_vectors(halfvec(768), FLOAT8, INTEGER);
DROP TABLE IF EXISTS public.search_category_vectors_results;

-- Drop category vectors
DROP FUNCTION IF EXISTS public.calculate_category_vector_distance(category_vectors, halfvec(768));
DROP TRIGGER IF EXISTS trg_category_vectors_updated_at ON public.category_vectors;
DROP FUNCTION IF EXISTS public.update_category_vectors_updated_at();
DROP TABLE IF EXISTS public.category_vectors;

-- Drop text search / trigram indexes
DROP INDEX IF EXISTS idx_places_locality_trgm;
DROP INDEX IF EXISTS idx_places_name_trgm;
DROP INDEX IF EXISTS idx_places_search_text;
DROP TRIGGER IF EXISTS trg_places_search_text ON public.places;
DROP FUNCTION IF EXISTS public.update_places_search_text();
ALTER TABLE public.places DROP COLUMN IF EXISTS search_text;
