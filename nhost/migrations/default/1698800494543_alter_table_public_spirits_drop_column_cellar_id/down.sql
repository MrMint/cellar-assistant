alter table "public"."spirits"
  add constraint "spirits_cellar_id_fkey"
  foreign key (cellar_id)
  references "public"."cellars"
  (id) on update restrict on delete restrict;
alter table "public"."spirits" alter column "cellar_id" drop not null;
alter table "public"."spirits" add column "cellar_id" uuid;
