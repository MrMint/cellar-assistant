alter table "public"."cellar_wine" add column "created_at" timestamptz
 not null default now();
