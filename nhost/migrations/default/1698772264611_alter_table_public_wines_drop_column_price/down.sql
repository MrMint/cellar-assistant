alter table "public"."wines" alter column "price" drop not null;
alter table "public"."wines" add column "price" money;
