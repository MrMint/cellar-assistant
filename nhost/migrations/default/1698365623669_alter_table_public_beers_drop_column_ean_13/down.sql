alter table "public"."beers" alter column "ean_13" drop not null;
alter table "public"."beers" add column "ean_13" int8;
