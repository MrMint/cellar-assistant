alter table "public"."item_favorites" add constraint "item_favorites_user_id_coffee_id_key" unique ("user_id", "coffee_id");
