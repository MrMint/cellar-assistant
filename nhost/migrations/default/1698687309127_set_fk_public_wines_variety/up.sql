alter table "public"."wines"
  add constraint "wines_variety_fkey"
  foreign key ("variety")
  references "public"."wine_variety"
  ("text") on update restrict on delete restrict;
