alter table "public"."coffees"
  add constraint "coffees_cultivar_fkey"
  foreign key ("cultivar")
  references "public"."coffee_cultivar"
  ("text") on update restrict on delete restrict;
