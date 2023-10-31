alter table "public"."wines"
  add constraint "wines_style_fkey"
  foreign key ("style")
  references "public"."wine_style"
  ("text") on update restrict on delete restrict;
