-- X17 friend invites: one live invite secret per user.
--
-- An invite link is `/invite/<token>`, where the token packs the inviter's id
-- and this secret (`packages/contracts/src/share.ts`). Accepting it makes the
-- two users friends through the existing two-sided write (UserActor, §1.7):
-- the invitee's own `friends` row plus an outbox `confirmFriendship` to the
-- inviter. Resetting the link replaces the secret, so every earlier link stops
-- working. Written only by the inviter's `UserActor` (`src/writers.ts`).
--
-- `secret` is 16 random bytes in base64url (22 characters, checked) and is
-- unique, so a secret names at most one inviter. The row goes with its user.
CREATE TABLE "friend_invites" (
	"user_id" uuid PRIMARY KEY,
	"secret" text NOT NULL CONSTRAINT "friend_invites_secret_key" UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friend_invites_secret_check" CHECK ((char_length(secret) = 22))
);
--> statement-breakpoint
ALTER TABLE "friend_invites" ADD CONSTRAINT "friend_invites_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;