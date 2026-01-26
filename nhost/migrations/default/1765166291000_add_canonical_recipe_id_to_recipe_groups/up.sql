-- Add canonical_recipe_id column to recipe_groups table
-- This column references the canonical (primary) recipe for the group
ALTER TABLE recipe_groups
ADD COLUMN canonical_recipe_id UUID;

-- Add foreign key constraint with ON DELETE SET NULL
-- When a canonical recipe is deleted, the group's canonical_recipe_id is set to NULL
ALTER TABLE recipe_groups
ADD CONSTRAINT recipe_groups_canonical_recipe_id_fkey
    FOREIGN KEY (canonical_recipe_id)
    REFERENCES recipes(id)
    ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX idx_recipe_groups_canonical_recipe
    ON recipe_groups(canonical_recipe_id);

-- Add helpful comment
COMMENT ON COLUMN recipe_groups.canonical_recipe_id IS 'The canonical (primary/most voted) recipe in this group';
