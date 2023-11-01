alter table "public"."beers"
  add constraint "beers_country_fkey"
  foreign key ("country")
  references "public"."country"
  ("text") on update restrict on delete restrict;
