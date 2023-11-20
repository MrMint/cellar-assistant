alter table "public"."item_reviews"
  add constraint "item_reviews_coffee_id_fkey"
  foreign key ("coffee_id")
  references "public"."coffees"
  ("id") on update restrict on delete restrict;
