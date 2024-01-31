ALTER TABLE item_favorites drop COLUMN type;
ALTER TABLE item_favorites
ADD COLUMN type text NOT NULL GENERATED ALWAYS AS (
    CASE
        WHEN beer_id IS NOT NULL THEN 'BEER'
        WHEN wine_id IS NOT NULL THEN 'WINE'
        WHEN coffee_id IS NOT NULL THEN 'COFFEE'
        ELSE 'SPIRIT'
    END
) STORED;
