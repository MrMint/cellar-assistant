-- =====================================
-- Fix item satellite table constraints for sake + tea - DOWN
-- Restores the original 4-arg constraints and item_favorites type column
-- =====================================

-- ---- item_favorites ----

-- Restore original 4-arg constraint
ALTER TABLE item_favorites DROP CONSTRAINT IF EXISTS "Ensure one item_id present";
ALTER TABLE item_favorites ADD CONSTRAINT "Ensure one item_id present"
    CHECK (num_nonnulls(beer_id, wine_id, spirit_id, coffee_id) = 1);

-- Restore original type column (4-branch, no sake/tea)
ALTER TABLE item_favorites DROP COLUMN IF EXISTS type CASCADE;
ALTER TABLE item_favorites ADD COLUMN type TEXT NOT NULL GENERATED ALWAYS AS (
    CASE
        WHEN beer_id IS NOT NULL THEN 'BEER'::text
        WHEN wine_id IS NOT NULL THEN 'WINE'::text
        WHEN coffee_id IS NOT NULL THEN 'COFFEE'::text
        ELSE 'SPIRIT'::text
    END
) STORED;
ALTER TABLE item_favorites ADD CONSTRAINT item_favorites_type_fkey
    FOREIGN KEY (type) REFERENCES item_type(value);

-- ---- item_reviews ----

ALTER TABLE item_reviews DROP CONSTRAINT IF EXISTS "Ensure one item_id present";
ALTER TABLE item_reviews ADD CONSTRAINT "Ensure one item_id present"
    CHECK (num_nonnulls(beer_id, wine_id, spirit_id, coffee_id) = 1);

-- ---- item_image ----

ALTER TABLE item_image DROP CONSTRAINT IF EXISTS "Ensure at least one item Id";
ALTER TABLE item_image ADD CONSTRAINT "Ensure at least one item Id"
    CHECK (num_nonnulls(beer_id, wine_id, spirit_id, coffee_id) = 1);
