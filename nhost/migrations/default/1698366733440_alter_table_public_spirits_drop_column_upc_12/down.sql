alter table "public"."spirits" alter column "upc_12" drop not null;
alter table "public"."spirits" add column "upc_12" int8;
