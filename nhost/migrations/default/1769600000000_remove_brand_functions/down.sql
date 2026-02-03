-- Recreate composite types
CREATE TYPE public.brand_similarity_result AS (
  id UUID,
  name TEXT,
  description TEXT,
  brand_type TEXT,
  similarity_score FLOAT
);

CREATE TYPE public.brand_match_result AS (
  id UUID,
  name TEXT,
  description TEXT,
  brand_type TEXT,
  similarity_score FLOAT,
  is_exact_match BOOLEAN
);

-- Recreate functions
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

CREATE OR REPLACE FUNCTION public.find_brand_match(
  search_term TEXT,
  similarity_threshold FLOAT DEFAULT 0.5
)
RETURNS SETOF public.brand_match_result
LANGUAGE plpgsql STABLE
AS $$
BEGIN
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

  IF FOUND THEN
    RETURN;
  END IF;

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
