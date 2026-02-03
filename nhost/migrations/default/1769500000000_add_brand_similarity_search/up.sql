-- Enable pg_trgm extension for trigram-based similarity matching
-- Requires postgres role for extension installation
SET ROLE postgres;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
RESET ROLE;

-- Create a GIN trigram index on brands.name for fast similarity searches
-- GIN is preferred over GiST for this use case as it provides better search performance
CREATE INDEX IF NOT EXISTS idx_brands_name_trgm ON public.brands USING GIN (name gin_trgm_ops);

-- Create composite type for brand similarity search results
-- Hasura requires a composite type (not inline TABLE) to track functions
CREATE TYPE public.brand_similarity_result AS (
  id UUID,
  name TEXT,
  description TEXT,
  brand_type TEXT,
  similarity_score FLOAT
);

-- Create composite type for brand match results (includes exact match flag)
CREATE TYPE public.brand_match_result AS (
  id UUID,
  name TEXT,
  description TEXT,
  brand_type TEXT,
  similarity_score FLOAT,
  is_exact_match BOOLEAN
);

-- Create a function to search brands by similarity
-- This returns brands with similarity score above the threshold, ordered by best match
-- Uses database-side similarity() function from pg_trgm for efficient matching
CREATE OR REPLACE FUNCTION public.search_brands_by_similarity(
  search_term TEXT,
  similarity_threshold FLOAT DEFAULT 0.3,
  max_results INTEGER DEFAULT 10
)
RETURNS SETOF public.brand_similarity_result
LANGUAGE SQL STABLE
AS $$
  SELECT
    b.id,
    b.name,
    b.description,
    b.brand_type::TEXT,
    similarity(b.name, search_term) as similarity_score
  FROM public.brands b
  WHERE similarity(b.name, search_term) >= similarity_threshold
  ORDER BY similarity_score DESC
  LIMIT max_results;
$$;

-- Also create a simple exact or similar match function that tries exact first
-- Returns the best single match or null
-- Uses PL/pgSQL for conditional logic (exact match takes priority)
CREATE OR REPLACE FUNCTION public.find_brand_match(
  search_term TEXT,
  similarity_threshold FLOAT DEFAULT 0.5
)
RETURNS SETOF public.brand_match_result
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  -- First try case-insensitive exact match
  RETURN QUERY
  SELECT
    b.id,
    b.name,
    b.description,
    b.brand_type::TEXT,
    1.0::FLOAT as similarity_score,
    TRUE as is_exact_match
  FROM public.brands b
  WHERE LOWER(b.name) = LOWER(search_term)
  LIMIT 1;

  -- If exact match found, we're done (RETURN QUERY doesn't exit the function)
  IF FOUND THEN
    RETURN;
  END IF;

  -- Fall back to best similarity match
  RETURN QUERY
  SELECT
    b.id,
    b.name,
    b.description,
    b.brand_type::TEXT,
    similarity(b.name, search_term) as similarity_score,
    FALSE as is_exact_match
  FROM public.brands b
  WHERE similarity(b.name, search_term) >= similarity_threshold
  ORDER BY similarity_score DESC
  LIMIT 1;
END;
$$;
