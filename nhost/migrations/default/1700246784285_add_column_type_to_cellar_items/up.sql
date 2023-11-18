ALTER TABLE cellar_items
ADD COLUMN type text NOT NULL GENERATED ALWAYS AS (
    CASE
        WHEN beer_id IS NOT NULL THEN 'BEER'
        WHEN wine_id IS NOT NULL THEN 'WINE'
        ELSE 'SPIRIT'
    END
) STORED;
