-- Add user-created places support to the places table

-- Disable statement timeout for THIS transaction (the role-level 10s default
-- from migration 1771100000000 is already active on this connection).
SET LOCAL statement_timeout = '0';

-- Permanently revert the role-level 10s statement timeout for future sessions.
ALTER ROLE nhost_hasura RESET statement_timeout;

-- Add new columns
ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'overture' CHECK (source IN ('overture', 'user', 'merged')),
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Create indexes
CREATE INDEX IF NOT EXISTS places_created_by_idx ON public.places(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS places_source_idx ON public.places(source);

-- Create results table for function return type
-- Note: similarity is REAL (not FLOAT8) because pg_trgm SIMILARITY() returns REAL
CREATE TABLE IF NOT EXISTS public.duplicate_place_results (
  id UUID,
  name TEXT,
  primary_category TEXT,
  location GEOGRAPHY(Point, 4326),
  street_address TEXT,
  locality TEXT,
  similarity REAL,
  distance_m FLOAT8
);

-- Create function to find duplicate places using hybrid search
-- Combines spatial distance with name similarity (using pg_trgm)
CREATE OR REPLACE FUNCTION public.find_duplicate_places(
  place_name TEXT,
  place_lat FLOAT8,
  place_lng FLOAT8,
  search_radius_m FLOAT8 DEFAULT 200,
  min_similarity FLOAT8 DEFAULT 0.3,
  result_limit INT DEFAULT 5
)
RETURNS SETOF public.duplicate_place_results
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  search_point GEOGRAPHY;
BEGIN
  -- Create geography point from lat/lng
  search_point := ST_SetSRID(ST_MakePoint(place_lng, place_lat), 4326)::GEOGRAPHY;

  -- Return places within radius, ordered by similarity and distance
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.primary_category,
    p.location,
    p.street_address,
    p.locality,
    SIMILARITY(p.name, place_name) AS similarity,
    ST_Distance(p.location, search_point) AS distance_m
  FROM public.places p
  WHERE
    p.is_active = true
    AND ST_DWithin(p.location, search_point, search_radius_m)
    AND SIMILARITY(p.name, place_name) >= min_similarity
  ORDER BY
    similarity DESC,
    distance_m ASC
  LIMIT result_limit;
END;
$$;

COMMENT ON FUNCTION public.find_duplicate_places IS 'Find potential duplicate places using hybrid spatial + text similarity search';
