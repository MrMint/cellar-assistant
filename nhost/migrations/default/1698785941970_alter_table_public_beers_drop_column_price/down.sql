alter table "public"."beers" alter column "price" drop not null;
alter table "public"."beers" add column "price" money;
