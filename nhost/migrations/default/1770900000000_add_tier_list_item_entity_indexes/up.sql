-- Add partial indexes on tier_list_items polymorphic FK columns
-- These indexes optimize lookups by entity type (wine, beer, spirit, coffee, sake)
-- Using partial indexes (WHERE col IS NOT NULL) for efficiency since most rows are NULL for each column

CREATE INDEX IF NOT EXISTS idx_tier_list_items_wine_id
ON tier_list_items(wine_id)
WHERE wine_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tier_list_items_beer_id
ON tier_list_items(beer_id)
WHERE beer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tier_list_items_spirit_id
ON tier_list_items(spirit_id)
WHERE spirit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tier_list_items_coffee_id
ON tier_list_items(coffee_id)
WHERE coffee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tier_list_items_sake_id
ON tier_list_items(sake_id)
WHERE sake_id IS NOT NULL;
