-- Reverse recipes, brands, and ingredients system
-- Drop in reverse order to handle dependencies

-- Drop helper function
DROP FUNCTION IF EXISTS create_recipe_with_ingredients;

-- Drop views
DROP VIEW IF EXISTS item_brands_detailed;
DROP VIEW IF EXISTS recipe_ingredients_detailed;
DROP VIEW IF EXISTS recipe_summary;

-- Drop relationship tables
DROP TABLE IF EXISTS menu_item_recipes CASCADE;
DROP TABLE IF EXISTS place_brands CASCADE;
DROP TABLE IF EXISTS item_brands CASCADE;

-- Drop core recipe tables
DROP TABLE IF EXISTS recipe_ingredients CASCADE;
DROP TABLE IF EXISTS recipe_instructions CASCADE;
DROP TABLE IF EXISTS recipes CASCADE;

-- Drop brands table
DROP TABLE IF EXISTS brands CASCADE;

-- Drop generic_items table
DROP TABLE IF EXISTS generic_items CASCADE;