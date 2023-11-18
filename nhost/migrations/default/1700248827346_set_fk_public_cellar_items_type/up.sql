alter table "public"."cellar_items"
  add constraint "cellar_items_type_fkey"
  foreign key ("type")
  references "public"."item_type"
  ("text") on update restrict on delete restrict;
