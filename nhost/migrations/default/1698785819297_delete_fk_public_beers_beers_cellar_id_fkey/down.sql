alter table "public"."beers"
  add constraint "beers_cellar_id_fkey"
  foreign key ("cellar_id")
  references "public"."cellars"
  ("id") on update restrict on delete restrict;
