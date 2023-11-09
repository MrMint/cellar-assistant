CREATE TABLE "public"."friend_requests" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "friend_id" uuid NOT NULL, "status" text NOT NULL, PRIMARY KEY ("id") , UNIQUE ("user_id", "friend_id"));
CREATE EXTENSION IF NOT EXISTS pgcrypto;
