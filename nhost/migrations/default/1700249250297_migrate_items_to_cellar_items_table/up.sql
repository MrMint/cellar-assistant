INSERT INTO cellar_items (cellar_id, created_by, beer_id, display_image_id, created_at)
SELECT cellar_id, user_id as created_by, beer_id, display_image_id, created_at FROM cellar_beer;

INSERT INTO cellar_items (cellar_id, created_by, wine_id, display_image_id, created_at)
SELECT cellar_id, user_id as created_by, wine_id, display_image_id, created_at FROM cellar_wine;

INSERT INTO cellar_items (cellar_id, created_by, spirit_id, display_image_id, created_at)
SELECT cellar_id, user_id as created_by, spirit_id, display_image_id, created_at FROM cellar_spirit;

DROP TABLE "public"."cellar_beer";
DROP TABLE "public"."cellar_wine";
DROP TABLE "public"."cellar_spirit";
