ALTER TABLE cellar_items drop COLUMN type;
ALTER TABLE cellar_items
ADD COLUMN type text NOT NULL GENERATED ALWAYS AS (
    CASE
        WHEN beer_id IS NOT NULL THEN 'BEER'
        WHEN wine_id IS NOT NULL THEN 'WINE'
        WHEN coffee_id IS NOT NULL THEN 'COFFEE'
        ELSE 'SPIRIT'
    END
) STORED;
