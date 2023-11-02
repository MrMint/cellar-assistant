alter table "public"."cellar_spirit"
  add constraint "cellar_spirit_display_image_id_fkey"
  foreign key ("display_image_id")
  references "public"."item_image"
  ("id") on update restrict on delete restrict;
