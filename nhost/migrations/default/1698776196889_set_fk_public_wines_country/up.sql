alter table "public"."wines"
  add constraint "wines_country_fkey"
  foreign key ("country")
  references "public"."country"
  ("text") on update restrict on delete restrict;
