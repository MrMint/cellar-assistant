alter table "public"."item_vectors" add column "created_at" timestamptz
 null default now();
