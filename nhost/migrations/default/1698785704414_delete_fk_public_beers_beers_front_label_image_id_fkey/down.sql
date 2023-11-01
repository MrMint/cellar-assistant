alter table "public"."beers"
  add constraint "beers_front_label_image_id_fkey"
  foreign key ("front_label_image_id")
  references "storage"."files"
  ("id") on update restrict on delete restrict;
