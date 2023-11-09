alter table "public"."friends" add column "created_at" timestamptz
 null default now();
