-- Drop all computed field functions
DROP FUNCTION IF EXISTS calculate_group_average_rating(uuid);
DROP FUNCTION IF EXISTS count_recipes_in_group(uuid);
DROP FUNCTION IF EXISTS get_user_vote_for_recipe(uuid, json);
DROP FUNCTION IF EXISTS count_recipe_downvotes(uuid);
DROP FUNCTION IF EXISTS count_recipe_upvotes(uuid);