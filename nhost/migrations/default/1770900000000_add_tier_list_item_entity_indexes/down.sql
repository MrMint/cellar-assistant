-- Remove partial indexes on tier_list_items polymorphic FK columns

DROP INDEX IF EXISTS idx_tier_list_items_wine_id;
DROP INDEX IF EXISTS idx_tier_list_items_beer_id;
DROP INDEX IF EXISTS idx_tier_list_items_spirit_id;
DROP INDEX IF EXISTS idx_tier_list_items_coffee_id;
DROP INDEX IF EXISTS idx_tier_list_items_sake_id;
