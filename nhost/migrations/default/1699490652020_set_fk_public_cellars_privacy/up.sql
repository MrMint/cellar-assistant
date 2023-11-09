alter table "public"."cellars"
  add constraint "cellars_privacy_fkey"
  foreign key ("privacy")
  references "public"."permission_type"
  ("text") on update restrict on delete restrict;
