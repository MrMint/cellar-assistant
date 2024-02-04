alter table "public"."item_favorites" add constraint "item_favorites_user_id_spirit_id_key" unique ("user_id", "spirit_id");
