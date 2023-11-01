alter table "public"."beers"
  add constraint "beers_back_label_image_id_fkey"
  foreign key ("back_label_image_id")
  references "storage"."files"
  ("id") on update restrict on delete restrict;
