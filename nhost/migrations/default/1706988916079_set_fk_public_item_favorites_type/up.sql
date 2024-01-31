alter table "public"."item_favorites"
  add constraint "item_favorites_type_fkey"
  foreign key ("type")
  references "public"."item_type"
  ("text") on update restrict on delete restrict;
