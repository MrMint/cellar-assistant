-- =====================================
-- Tea Tables Migration - DOWN
-- Removes tea as an item type and all related schema
-- =====================================

-- Restore original type generation column (without tea)
ALTER TABLE cellar_items DROP COLUMN IF EXISTS type;
ALTER TABLE cellar_items ADD COLUMN type TEXT GENERATED ALWAYS AS (
    CASE
        WHEN beer_id IS NOT NULL THEN 'BEER'::text
        WHEN wine_id IS NOT NULL THEN 'WINE'::text
        WHEN coffee_id IS NOT NULL THEN 'COFFEE'::text
        WHEN sake_id IS NOT NULL THEN 'SAKE'::text
        ELSE 'SPIRIT'::text
    END
) STORED;

-- Restore original constraint (without tea_id)
ALTER TABLE cellar_items DROP CONSTRAINT IF EXISTS "Ensure exactly one item Id";
ALTER TABLE cellar_items ADD CONSTRAINT "Ensure exactly one item Id"
    CHECK (num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id) = 1);

-- Restore item_brands constraint (without tea_id)
ALTER TABLE item_brands DROP CONSTRAINT IF EXISTS exactly_one_item_reference;
ALTER TABLE item_brands ADD CONSTRAINT exactly_one_item_reference
    CHECK (num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id) = 1);

-- Restore recipe_ingredients constraint (without tea_id)
ALTER TABLE recipe_ingredients DROP CONSTRAINT IF EXISTS exactly_one_item_reference;
ALTER TABLE recipe_ingredients ADD CONSTRAINT exactly_one_item_reference
    CHECK (num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, generic_item_id) = 1);

-- Restore item_match_suggestions check_single_suggested_item constraint (without suggested_tea_id)
ALTER TABLE item_match_suggestions DROP CONSTRAINT IF EXISTS check_single_suggested_item;
ALTER TABLE item_match_suggestions ADD CONSTRAINT check_single_suggested_item
    CHECK (num_nonnulls(suggested_wine_id, suggested_beer_id, suggested_spirit_id, suggested_coffee_id, suggested_sake_id, suggested_recipe_id) = 1);

-- Remove tea_id columns from all related tables (in reverse order)
ALTER TABLE recipe_ingredients DROP COLUMN IF EXISTS tea_id;
ALTER TABLE item_brands DROP COLUMN IF EXISTS tea_id;
ALTER TABLE item_match_suggestions DROP COLUMN IF EXISTS suggested_tea_id;
ALTER TABLE item_reviews DROP COLUMN IF EXISTS tea_id;
ALTER TABLE item_favorites DROP COLUMN IF EXISTS tea_id;
ALTER TABLE item_image DROP COLUMN IF EXISTS tea_id;
ALTER TABLE item_vectors DROP COLUMN IF EXISTS tea_id;
ALTER TABLE cellar_items DROP COLUMN IF EXISTS tea_id;

-- Remove tea from item_type enum
DELETE FROM item_type WHERE value = 'TEA';

-- Drop enum tables
DROP TABLE IF EXISTS tea_caffeine_level;
DROP TABLE IF EXISTS tea_form;
DROP TABLE IF EXISTS tea_category;

-- Drop the main teas table (this will cascade and remove all references)
DROP TABLE IF EXISTS teas CASCADE;

-- Verify cleanup
DO $$
BEGIN
    -- Check that teas table was removed
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'teas') THEN
        RAISE EXCEPTION 'Failed to remove teas table';
    END IF;

    -- Check that tea was removed from item_type
    IF EXISTS (SELECT 1 FROM item_type WHERE value = 'TEA') THEN
        RAISE EXCEPTION 'Failed to remove tea from item_type enum';
    END IF;

    -- Check that enum tables were removed
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tea_category') THEN
        RAISE EXCEPTION 'Failed to remove tea_category table';
    END IF;

    RAISE NOTICE 'Tea tables migration rollback completed successfully';
END $$;
