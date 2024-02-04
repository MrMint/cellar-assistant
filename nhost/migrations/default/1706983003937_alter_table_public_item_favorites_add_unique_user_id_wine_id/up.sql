alter table "public"."item_favorites" add constraint "item_favorites_user_id_wine_id_key" unique ("user_id", "wine_id");
