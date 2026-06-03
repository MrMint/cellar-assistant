-- =====================================
-- Fix item satellite table constraints for sake + tea - UP
-- item_favorites, item_reviews, item_image all have a 4-arg num_nonnulls CHECK
-- that excludes sake_id and tea_id, causing inserts to fail.
-- item_favorites also has a 4-branch generated type column missing SAKE/TEA.
-- =====================================

-- ---- item_favorites ----

-- Fix CHECK constraint (was: num_nonnulls(beer_id, wine_id, spirit_id, coffee_id) = 1)
ALTER TABLE item_favorites DROP CONSTRAINT IF EXISTS "Ensure one item_id present";
ALTER TABLE item_favorites ADD CONSTRAINT "Ensure one item_id present"
    CHECK (num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id) = 1);

-- Recreate generated type column with SAKE + TEA branches (drop CASCADE clears dependent FK)
ALTER TABLE item_favorites DROP COLUMN IF EXISTS type CASCADE;
ALTER TABLE item_favorites ADD COLUMN type TEXT NOT NULL GENERATED ALWAYS AS (
    CASE
        WHEN beer_id IS NOT NULL THEN 'BEER'::text
        WHEN wine_id IS NOT NULL THEN 'WINE'::text
        WHEN coffee_id IS NOT NULL THEN 'COFFEE'::text
        WHEN sake_id IS NOT NULL THEN 'SAKE'::text
        WHEN tea_id IS NOT NULL THEN 'TEA'::text
        ELSE 'SPIRIT'::text
    END
) STORED;

-- Restore FK to item_type (was present before)
ALTER TABLE item_favorites ADD CONSTRAINT item_favorites_type_fkey
    FOREIGN KEY (type) REFERENCES item_type(value);

-- ---- item_reviews ----

-- Fix CHECK constraint (was: num_nonnulls(beer_id, wine_id, spirit_id, coffee_id) = 1)
ALTER TABLE item_reviews DROP CONSTRAINT IF EXISTS "Ensure one item_id present";
ALTER TABLE item_reviews ADD CONSTRAINT "Ensure one item_id present"
    CHECK (num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id) = 1);

-- ---- item_image ----

-- Fix CHECK constraint (was: num_nonnulls(beer_id, wine_id, spirit_id, coffee_id) = 1)
ALTER TABLE item_image DROP CONSTRAINT IF EXISTS "Ensure at least one item Id";
ALTER TABLE item_image ADD CONSTRAINT "Ensure at least one item Id"
    CHECK (num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id) = 1);

-- Verify
DO $$
BEGIN
    -- item_favorites: new constraint exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'item_favorites'::regclass
          AND conname = 'Ensure one item_id present'
          AND pg_get_constraintdef(oid) LIKE '%sake_id%'
    ) THEN
        RAISE EXCEPTION 'item_favorites constraint not updated';
    END IF;

    -- item_reviews: new constraint exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'item_reviews'::regclass
          AND conname = 'Ensure one item_id present'
          AND pg_get_constraintdef(oid) LIKE '%sake_id%'
    ) THEN
        RAISE EXCEPTION 'item_reviews constraint not updated';
    END IF;

    -- item_image: new constraint exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'item_image'::regclass
          AND conname = 'Ensure at least one item Id'
          AND pg_get_constraintdef(oid) LIKE '%sake_id%'
    ) THEN
        RAISE EXCEPTION 'item_image constraint not updated';
    END IF;

    RAISE NOTICE 'item satellite constraints fixed for sake + tea successfully';
END $$;
