alter table "public"."item_vectors"
  add constraint "item_vectors_coffee_id_fkey"
  foreign key ("coffee_id")
  references "public"."coffees"
  ("id") on update restrict on delete restrict;
