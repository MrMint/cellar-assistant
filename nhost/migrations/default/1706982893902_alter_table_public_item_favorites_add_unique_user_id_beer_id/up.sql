alter table "public"."item_favorites" add constraint "item_favorites_user_id_beer_id_key" unique ("user_id", "beer_id");
