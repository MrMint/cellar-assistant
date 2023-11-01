alter table "public"."spirits" alter column "price" drop not null;
alter table "public"."spirits" add column "price" money;
