alter table "public"."cellar_beer"
  add constraint "cellar_beer_display_image_id_fkey"
  foreign key ("display_image_id")
  references "public"."item_image"
  ("id") on update restrict on delete restrict;
