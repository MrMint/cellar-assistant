-- Revert the constraint fix for generic_items
-- This restores the original unique index setup

-- Drop the unique constraint
ALTER TABLE public.generic_items 
DROP CONSTRAINT IF EXISTS idx_generic_items_name_category;

-- Recreate the original unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_generic_items_name_category 
ON public.generic_items (name, category);