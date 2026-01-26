-- Add created_by_id to community-managed tables for ownership tracking
-- This allows users to create and manage their own entries while maintaining accountability

-- Add created_by_id to generic_items
ALTER TABLE public.generic_items
ADD COLUMN created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add created_by_id to recipe_groups
ALTER TABLE public.recipe_groups
ADD COLUMN created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add created_by_id to recipes
ALTER TABLE public.recipes
ADD COLUMN created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_generic_items_created_by ON public.generic_items(created_by_id);
CREATE INDEX IF NOT EXISTS idx_recipe_groups_created_by ON public.recipe_groups(created_by_id);
CREATE INDEX IF NOT EXISTS idx_recipes_created_by ON public.recipes(created_by_id);

-- Note: Existing rows will have NULL created_by_id, which is acceptable for pre-existing reference data
