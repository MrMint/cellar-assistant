-- Remove PostgreSQL functions - now using Hasura native queries instead
DROP FUNCTION IF EXISTS public.find_brand_match(TEXT, FLOAT);
DROP FUNCTION IF EXISTS public.search_brands_by_similarity(TEXT, FLOAT, INTEGER);

-- Remove composite types that were created for the functions
DROP TYPE IF EXISTS public.brand_match_result;
DROP TYPE IF EXISTS public.brand_similarity_result;
