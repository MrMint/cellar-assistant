alter table "public"."coffees"
  add constraint "coffees_roast_level_fkey"
  foreign key ("roast_level")
  references "public"."coffee_roast_level"
  ("text") on update restrict on delete restrict;
