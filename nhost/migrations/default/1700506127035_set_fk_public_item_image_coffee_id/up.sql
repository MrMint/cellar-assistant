alter table "public"."item_image"
  add constraint "item_image_coffee_id_fkey"
  foreign key ("coffee_id")
  references "public"."coffees"
  ("id") on update restrict on delete restrict;
