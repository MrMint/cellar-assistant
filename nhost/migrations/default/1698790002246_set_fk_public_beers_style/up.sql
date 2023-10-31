alter table "public"."beers"
  add constraint "beers_style_fkey"
  foreign key ("style")
  references "public"."beer_style"
  ("text") on update restrict on delete restrict;
