-- Reverse user-created places support

-- Restore the role-level statement timeout that was removed in the up migration
ALTER ROLE nhost_hasura SET statement_timeout = '10s';

-- Drop the function (CASCADE to handle dependencies)
DROP FUNCTION IF EXISTS public.find_duplicate_places(TEXT, FLOAT8, FLOAT8, FLOAT8, FLOAT8, INT) CASCADE;

-- Drop the results table
DROP TABLE IF EXISTS public.duplicate_place_results;

-- Drop indexes
DROP INDEX IF EXISTS public.places_source_idx;
DROP INDEX IF EXISTS public.places_created_by_idx;

-- Drop columns (cascade to drop the FK constraint automatically)
ALTER TABLE public.places
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS source,
  DROP COLUMN IF EXISTS created_by;
