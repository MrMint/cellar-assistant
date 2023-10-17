alter table "public"."spirits"
  add constraint "spirits_type_fkey"
  foreign key ("type")
  references "public"."spirit_type"
  ("text") on update restrict on delete restrict;
