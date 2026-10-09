-- Regenerated at merge as 20261009005024 (was 20261008214058 on wa/tierlists),
-- so it sorts after X27's 20261008214722/214724, X02's 20261008230209, X08's
-- 20261008231951, X19's 20261008233536 and X14's 20261008235751 that other
-- databases already have; the snapshot now chains from X14's
-- (recipe_ingredient_meta_bar_pantry_recipe_love). The SQL below is unchanged.
--
-- D4 (tier lists: "keep a full edit history per tier list so the owner can
-- undo/redo mistakes"): an append-only log of every change to a list's
-- entries.
--
-- One row per owner edit — ADD, REMOVE, MOVE (a reorder, within a band or
-- across bands) — written by `TierListActor` in the same transaction as the
-- edit itself, and one row per UNDO / REDO, which names the edit it reverses
-- or re-applies by `target_seq`. Nothing is ever rewritten: the undo and redo
-- stacks are a replay of the log (`services/actors/src/lib/tier-list-history.ts`),
-- so the history survives reloads and a new activation, and an undone edit is
-- still on record.
--
-- `seq` counts per list from 1 (unique with the list id, which also indexes
-- the replay); `change` is the edit's own snapshot — the row (id, entry, band,
-- position, notes, created_at) for ADD and REMOVE, the touched bands' full
-- orders before and after for MOVE — so an undo needs nothing but this row.
-- `user_id` is who did it (always the creator today: every write is
-- creator-only); SET NULL so a deleted account does not take the record with
-- it, though `tier_lists` going takes its history (CASCADE).
--
-- No backfill: lists edited before this migration start with an empty
-- history, and Undo is disabled until their next edit.
CREATE TABLE "tier_list_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tier_list_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"kind" text NOT NULL,
	"target_seq" integer,
	"change" jsonb NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tier_list_history_tier_list_id_seq_key" UNIQUE("tier_list_id","seq"),
	CONSTRAINT "tier_list_history_kind_check" CHECK ((kind = ANY (ARRAY['ADD'::text, 'REMOVE'::text, 'MOVE'::text, 'UNDO'::text, 'REDO'::text]))),
	CONSTRAINT "tier_list_history_target_seq_check" CHECK (((kind = ANY (ARRAY['UNDO'::text, 'REDO'::text])) = (target_seq IS NOT NULL)))
);
--> statement-breakpoint
ALTER TABLE "tier_list_history" ADD CONSTRAINT "tier_list_history_tier_list_id_tier_lists_id_fkey" FOREIGN KEY ("tier_list_id") REFERENCES "tier_lists"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tier_list_history" ADD CONSTRAINT "tier_list_history_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
-- Append-only, enforced where an UPDATE would land rather than by convention:
-- the actor only ever inserts. DELETE stays possible — it is how
-- `ON DELETE CASCADE` from `tier_lists` removes a deleted list's history.
CREATE OR REPLACE FUNCTION public.tier_list_history_is_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'tier_list_history is append-only: undo and redo are new rows';
END
$$;
--> statement-breakpoint
CREATE TRIGGER tier_list_history_no_update
  BEFORE UPDATE ON public.tier_list_history
  FOR EACH ROW
  EXECUTE FUNCTION public.tier_list_history_is_append_only();
