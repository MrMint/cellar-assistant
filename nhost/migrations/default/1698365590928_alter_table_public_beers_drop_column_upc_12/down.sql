alter table "public"."beers" alter column "upc_12" drop not null;
alter table "public"."beers" add column "upc_12" int8;
