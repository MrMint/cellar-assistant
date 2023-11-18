-- INSERT INTO cellar_items (cellar_id, created_by, beer_id, display_image_id, created_at)
-- SELECT cellar_id, user_id as created_by, beer_id, display_image_id, created_at FROM cellar_beer;

ALTER TABLE cellar_items
ADD COLUMN type text NOT NULL GENERATED ALWAYS AS (
    CASE
        WHEN beer_id IS NOT NULL THEN 'BEER'
        WHEN wine_id IS NOT NULL THEN 'WINE'
        ELSE 'SPIRIT'
    END
) STORED;
