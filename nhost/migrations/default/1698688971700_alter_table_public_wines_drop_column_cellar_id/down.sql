alter table "public"."wines"
  add constraint "wines_cellar_id_fkey"
  foreign key (cellar_id)
  references "public"."cellars"
  (id) on update restrict on delete restrict;
alter table "public"."wines" alter column "cellar_id" drop not null;
alter table "public"."wines" add column "cellar_id" uuid;
