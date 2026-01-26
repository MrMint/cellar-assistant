-- Drop triggers first
DROP TRIGGER IF EXISTS update_recipe_votes_updated_at ON recipe_votes;
DROP TRIGGER IF EXISTS update_recipe_groups_updated_at ON recipe_groups;

-- Drop functions
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP FUNCTION IF EXISTS get_canonical_recipe_for_group(uuid);
DROP FUNCTION IF EXISTS calculate_recipe_vote_score(uuid);

-- Remove column from recipes table
ALTER TABLE recipes DROP COLUMN IF EXISTS recipe_group_id;

-- Drop tables in reverse order
DROP TABLE IF EXISTS recipe_votes;
DROP TABLE IF EXISTS recipe_groups;