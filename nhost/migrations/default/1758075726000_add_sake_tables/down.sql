-- =====================================
-- Sake Tables Migration - DOWN
-- Removes sake as an item type and all related schema
-- =====================================

-- Restore original type generation column (without sake)
ALTER TABLE cellar_items DROP COLUMN IF EXISTS type;
ALTER TABLE cellar_items ADD COLUMN type TEXT GENERATED ALWAYS AS (
    CASE
        WHEN beer_id IS NOT NULL THEN 'BEER'::text
        WHEN wine_id IS NOT NULL THEN 'WINE'::text
        WHEN coffee_id IS NOT NULL THEN 'COFFEE'::text
        ELSE 'SPIRIT'::text
    END
) STORED;

-- Restore original constraint (without sake_id)
ALTER TABLE cellar_items DROP CONSTRAINT IF EXISTS "Ensure exactly one item Id";
ALTER TABLE cellar_items ADD CONSTRAINT "Ensure exactly one item Id"
    CHECK (num_nonnulls(beer_id, wine_id, spirit_id, coffee_id) = 1);

-- Remove sake_id columns from all related tables (in reverse order)
ALTER TABLE recipe_ingredients DROP COLUMN IF EXISTS sake_id;
ALTER TABLE item_brands DROP COLUMN IF EXISTS sake_id;
ALTER TABLE item_match_suggestions DROP COLUMN IF EXISTS sake_id;
ALTER TABLE item_reviews DROP COLUMN IF EXISTS sake_id;
ALTER TABLE item_favorites DROP COLUMN IF EXISTS sake_id;
ALTER TABLE item_image DROP COLUMN IF EXISTS sake_id;
ALTER TABLE item_vectors DROP COLUMN IF EXISTS sake_id;
ALTER TABLE cellar_items DROP COLUMN IF EXISTS sake_id;

-- Remove sake from item_type enum
DELETE FROM item_type WHERE value = 'sake';

-- Drop enum tables (these will cascade and remove foreign key references)
DROP TABLE IF EXISTS sake_rice_variety;
DROP TABLE IF EXISTS sake_serving_temperature;
DROP TABLE IF EXISTS sake_type;
DROP TABLE IF EXISTS sake_category;

-- Drop the main sakes table (this will cascade and remove all references)
DROP TABLE IF EXISTS sakes;

-- Verify cleanup
DO $$
BEGIN
    -- Check that sakes table was removed
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sakes') THEN
        RAISE EXCEPTION 'Failed to remove sakes table';
    END IF;

    -- Check that sake was removed from item_type
    IF EXISTS (SELECT 1 FROM item_type WHERE value = 'sake') THEN
        RAISE EXCEPTION 'Failed to remove sake from item_type enum';
    END IF;

    -- Check that enum tables were removed
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sake_category') THEN
        RAISE EXCEPTION 'Failed to remove sake_category table';
    END IF;

    RAISE NOTICE 'Sake tables migration rollback completed successfully';
END $$;