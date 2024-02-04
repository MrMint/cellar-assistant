alter table "public"."item_favorites" add constraint "item_favorites_wine_id_spirit_id_coffee_id_user_id_beer_id_key" unique ("wine_id", "spirit_id", "coffee_id", "user_id", "beer_id");
