alter table "public"."spirits" alter column "ean_13" drop not null;
alter table "public"."spirits" add column "ean_13" int8;
