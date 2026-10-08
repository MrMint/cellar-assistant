-- X27 / D28 (async place moderation): a place's review status.
--
-- A user-created place is inserted `pending` and is visible to its creator
-- only; the AI review (`PlaceActor.review`, delivered by the outbox) moves it
-- to `approved` — shared, on everyone's map — or `rejected`, which stays
-- creator-only and carries `rejection_reason` for the creator to act on (Edit
-- resubmits it as `pending`; Delete removes it). A review that cannot run
-- (no AI provider, a timeout, a malformed answer) leaves the place `pending`:
-- never an approval nobody made.
--
-- `suggested_categories` and `suggested_description` are the review's
-- advisory output. They are stored for the creator to confirm ("also tagged
-- as …") or dismiss, and are never written into `categories` or
-- `description` on their own — AI output does not reach the shared row
-- without a person choosing it. `reviewed_at` is when the latest verdict
-- landed. `review_requested_at` names the submission a queued review is for
-- (stamped at creation and at every edit-and-resubmit, and carried in the
-- outbox payload): a verdict for an older submission — the creator edited the
-- place while the model was thinking — is discarded, so an edit can never be
-- approved on the strength of a review of what it replaced.
--
-- Backfill: none needed. Every existing row — Overture's, and the user places
-- the old synchronous review already let through — becomes `approved` through
-- the column default, which PostgreSQL applies without a table rewrite.
-- `places_unshared_by_creator_idx` is partial, so it holds only the unshared
-- rows (bounded by the 25-a-day creation limit): it is what the creator-only
-- reads (`created_by = $viewer AND review_status <> 'approved'`) use.
ALTER TABLE "places" ADD COLUMN "review_status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "review_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "suggested_categories" text[];--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "suggested_description" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "places_unshared_by_creator_idx" ON "places" ("created_by") WHERE (review_status <> 'approved'::text);--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_review_status_check" CHECK ((review_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));