alter table "public"."coffees"
  add constraint "coffees_species_fkey"
  foreign key ("species")
  references "public"."coffee_species"
  ("text") on update restrict on delete restrict;
