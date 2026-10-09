-- X03 follow-up (wave B "pour"): deleting a drink log offers Undo instead of a
-- confirm, and Undo puts back the *same* rows — the same ids and the same
-- `created_at` — rather than writing a new log that only looks alike.
--
-- `deleteDrinkLog` still hard-deletes from `check_ins` (no reader of that
-- table has to learn a `deleted_at` filter); in the same transaction
-- `CheckInActor.remove` copies each removed row here as JSON, keyed by its
-- own id, with the id the delete was addressed by (`removal_id`, the Undo
-- key) and who removed it. `restoreDrinkLog` re-inserts them and deletes the
-- trash rows; past `DRINK_LOG_RESTORE_WINDOW_MS` (one hour,
-- `packages/contracts/src/check-ins.ts`) they are no longer restorable and
-- each later removal purges them. The trash row goes with the user who
-- removed it. Written only by `CheckInActor` (`src/writers.ts`).
CREATE TABLE "check_in_trash" (
	"id" uuid PRIMARY KEY,
	"removal_id" uuid NOT NULL,
	"removed_by_id" uuid NOT NULL,
	"removed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_check_in_trash_removal_id" ON "check_in_trash" ("removal_id");--> statement-breakpoint
CREATE INDEX "idx_check_in_trash_removed_at" ON "check_in_trash" ("removed_at");--> statement-breakpoint
ALTER TABLE "check_in_trash" ADD CONSTRAINT "check_in_trash_removed_by_id_user_id_fkey" FOREIGN KEY ("removed_by_id") REFERENCES "user"("id") ON DELETE CASCADE;