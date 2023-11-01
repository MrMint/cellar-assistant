alter table "public"."beers" alter column "cellar_id" drop not null;
alter table "public"."beers" add column "cellar_id" uuid;
