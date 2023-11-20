alter table "public"."cellar_items"
  add constraint "cellar_items_coffee_id_fkey"
  foreign key ("coffee_id")
  references "public"."coffees"
  ("id") on update restrict on delete restrict;
