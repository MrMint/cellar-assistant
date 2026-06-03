-- =====================================
-- Add tea to tier_list_items - UP
-- Adds tea_id column to tier_list_items to match sake parity
-- =====================================

-- Add tea_id column with FK to teas
ALTER TABLE tier_list_items ADD COLUMN tea_id UUID REFERENCES teas(id);

-- Partial index (matches sake pattern)
CREATE INDEX idx_tier_list_items_tea_id ON tier_list_items(tea_id) WHERE tea_id IS NOT NULL;

-- Unique constraint (one tea per tier list)
ALTER TABLE tier_list_items ADD CONSTRAINT unique_tea_in_tier_list UNIQUE (tier_list_id, tea_id);

-- Update CHECK constraint to include tea_id
ALTER TABLE tier_list_items DROP CONSTRAINT IF EXISTS exactly_one_tier_item_reference;
ALTER TABLE tier_list_items ADD CONSTRAINT exactly_one_tier_item_reference
    CHECK (num_nonnulls(place_id, wine_id, beer_id, spirit_id, coffee_id, sake_id, tea_id) = 1);

-- Recreate the generated type column to include TEA (insert before ELSE NULL)
ALTER TABLE tier_list_items DROP COLUMN IF EXISTS type CASCADE;
ALTER TABLE tier_list_items ADD COLUMN type TEXT GENERATED ALWAYS AS (
    CASE
        WHEN place_id IS NOT NULL THEN 'PLACE'::text
        WHEN beer_id IS NOT NULL THEN 'BEER'::text
        WHEN wine_id IS NOT NULL THEN 'WINE'::text
        WHEN coffee_id IS NOT NULL THEN 'COFFEE'::text
        WHEN sake_id IS NOT NULL THEN 'SAKE'::text
        WHEN tea_id IS NOT NULL THEN 'TEA'::text
        WHEN spirit_id IS NOT NULL THEN 'SPIRIT'::text
        ELSE NULL::text
    END
) STORED;

-- Verify
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tier_list_items' AND column_name = 'tea_id'
    ) THEN
        RAISE EXCEPTION 'Failed to add tea_id to tier_list_items';
    END IF;
    RAISE NOTICE 'tea added to tier_list_items successfully';
END $$;
