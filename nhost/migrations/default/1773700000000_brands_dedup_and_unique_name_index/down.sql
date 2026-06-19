-- Drop the case-insensitive unique index.
-- NOTE: We do not attempt to recreate merged duplicate rows on rollback.
DROP INDEX IF EXISTS public.brands_unique_lower_name;
