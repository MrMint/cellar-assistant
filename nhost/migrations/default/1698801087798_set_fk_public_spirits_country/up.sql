alter table "public"."spirits"
  add constraint "spirits_country_fkey"
  foreign key ("country")
  references "public"."country"
  ("text") on update restrict on delete restrict;
