-- =====================================
-- Add tea to tier_list_items - DOWN
-- Removes tea_id from tier_list_items
-- =====================================

-- Restore type column without TEA branch
ALTER TABLE tier_list_items DROP COLUMN IF EXISTS type CASCADE;
ALTER TABLE tier_list_items ADD COLUMN type TEXT GENERATED ALWAYS AS (
    CASE
        WHEN place_id IS NOT NULL THEN 'PLACE'::text
        WHEN beer_id IS NOT NULL THEN 'BEER'::text
        WHEN wine_id IS NOT NULL THEN 'WINE'::text
        WHEN coffee_id IS NOT NULL THEN 'COFFEE'::text
        WHEN sake_id IS NOT NULL THEN 'SAKE'::text
        WHEN spirit_id IS NOT NULL THEN 'SPIRIT'::text
        ELSE NULL::text
    END
) STORED;

-- Restore CHECK constraint without tea_id
ALTER TABLE tier_list_items DROP CONSTRAINT IF EXISTS exactly_one_tier_item_reference;
ALTER TABLE tier_list_items ADD CONSTRAINT exactly_one_tier_item_reference
    CHECK (num_nonnulls(place_id, wine_id, beer_id, spirit_id, coffee_id, sake_id) = 1);

-- Drop unique constraint and column
ALTER TABLE tier_list_items DROP CONSTRAINT IF EXISTS unique_tea_in_tier_list;
ALTER TABLE tier_list_items DROP COLUMN IF EXISTS tea_id;

-- Verify
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tier_list_items' AND column_name = 'tea_id'
    ) THEN
        RAISE EXCEPTION 'Failed to remove tea_id from tier_list_items';
    END IF;
    RAISE NOTICE 'tea removed from tier_list_items successfully';
END $$;
