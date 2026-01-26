-- Drop utility functions
DROP FUNCTION IF EXISTS get_canonical_recipe_calculation(UUID);
DROP FUNCTION IF EXISTS get_recipe_vote_summary(UUID);

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_recipe_group_embedding_update ON recipe_groups;
DROP TRIGGER IF EXISTS trigger_update_canonical_recipe_on_vote_delete ON recipe_votes;
DROP TRIGGER IF EXISTS trigger_update_canonical_recipe_on_vote_update ON recipe_votes;
DROP TRIGGER IF EXISTS trigger_update_canonical_recipe_on_vote_insert ON recipe_votes;

-- Drop functions
DROP FUNCTION IF EXISTS trigger_recipe_group_embedding_update();
DROP FUNCTION IF EXISTS update_canonical_recipe();