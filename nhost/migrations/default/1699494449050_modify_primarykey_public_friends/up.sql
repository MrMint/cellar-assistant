BEGIN TRANSACTION;
ALTER TABLE "public"."friends" DROP CONSTRAINT "friends_pkey";

ALTER TABLE "public"."friends"
    ADD CONSTRAINT "friends_pkey" PRIMARY KEY ("user_id", "friend_id");
COMMIT TRANSACTION;
