alter table "public"."cellars" alter column "is_public" set default false;
alter table "public"."cellars" alter column "is_public" drop not null;
alter table "public"."cellars" add column "is_public" bool;
