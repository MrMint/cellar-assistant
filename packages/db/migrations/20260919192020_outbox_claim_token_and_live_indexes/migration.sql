ALTER TABLE "outbox" ADD COLUMN "claim_token" uuid;--> statement-breakpoint
CREATE INDEX "outbox_delivering_idx" ON "outbox" ("updated_at") WHERE (status = 'delivering'::text);--> statement-breakpoint
CREATE INDEX "outbox_live_target_idx" ON "outbox" ("target_actor","target_id","method") WHERE ((status = 'pending'::text) OR (status = 'delivering'::text));