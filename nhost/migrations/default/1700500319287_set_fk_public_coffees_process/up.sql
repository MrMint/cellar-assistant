alter table "public"."coffees"
  add constraint "coffees_process_fkey"
  foreign key ("process")
  references "public"."coffee_process"
  ("text") on update restrict on delete restrict;
