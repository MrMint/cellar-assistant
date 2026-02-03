-- Remove the brand similarity functions
DROP FUNCTION IF EXISTS public.find_brand_match(TEXT, FLOAT);
DROP FUNCTION IF EXISTS public.search_brands_by_similarity(TEXT, FLOAT, INTEGER);

-- Remove the composite types
DROP TYPE IF EXISTS public.brand_match_result;
DROP TYPE IF EXISTS public.brand_similarity_result;

-- Remove the trigram index
DROP INDEX IF EXISTS public.idx_brands_name_trgm;

-- Note: We don't drop the pg_trgm extension as it may be used elsewhere
