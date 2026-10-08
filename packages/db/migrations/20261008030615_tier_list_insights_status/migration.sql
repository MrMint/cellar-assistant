-- N07 (`TierList.insightsStatus`): the state a tier list's generated insights
-- are in, so the read can say PENDING / READY / FAILED instead of a client
-- guessing "Generating Insights" forever.
--
-- `insights_requested_at` is stamped by the content bump that enqueues
-- `TierListActor.generateInsights`; `insights_failure` is the latest failed
-- attempt as a stored failure (`CODE[REASON]: message`), `insights_failed_at`
-- when, and `insights_retry_at` when the refusal said asking again could work
-- (a budget window). All nullable, no backfill: a list with none of them set
-- reads as READY when it has insights and IDLE when it does not.
ALTER TABLE "tier_lists" ADD COLUMN "insights_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tier_lists" ADD COLUMN "insights_failure" text;--> statement-breakpoint
ALTER TABLE "tier_lists" ADD COLUMN "insights_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tier_lists" ADD COLUMN "insights_retry_at" timestamp with time zone;