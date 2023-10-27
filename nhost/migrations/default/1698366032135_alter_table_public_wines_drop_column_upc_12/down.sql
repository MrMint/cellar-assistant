alter table "public"."wines" alter column "upc_12" drop not null;
alter table "public"."wines" add column "upc_12" int8;
