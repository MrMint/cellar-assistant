-- Fix generic_items constraint for Hasura upserts
-- The original migration created a unique index, but Hasura's on_conflict clause
-- requires a proper unique constraint to reference by name.

-- Drop the existing unique index
DROP INDEX IF EXISTS public.idx_generic_items_name_category;

-- Create a proper unique constraint that Hasura can reference
ALTER TABLE public.generic_items 
ADD CONSTRAINT idx_generic_items_name_category 
UNIQUE (name, category);