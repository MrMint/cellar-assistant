alter table "public"."cellar_wine"
  add constraint "cellar_wine_display_image_id_fkey"
  foreign key ("display_image_id")
  references "public"."item_image"
  ("id") on update restrict on delete restrict;
