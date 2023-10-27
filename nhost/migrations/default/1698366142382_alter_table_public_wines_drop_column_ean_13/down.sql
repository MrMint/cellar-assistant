alter table "public"."wines" alter column "ean_13" drop not null;
alter table "public"."wines" add column "ean_13" int8;
