-- Regenerated at merge as 20261009071400 (was 20261009054209 on
-- wb/recipesedit), so it sorts after want_to_try's 20261009054753
-- (want_to_try_restrict_recipe_index) and X03's 20261009071339
-- (check_in_trash) that other databases already have; the snapshot now
-- chains from check_in_trash. drizzle-kit generated the same end state (it
-- would add the column straight at DEFAULT 'PRIVATE'); the reviewed SQL below,
-- which backfills existing rows as PUBLIC first, is unchanged.
--
-- X15 (D22): recipes are private first, and AI output is a draft.
--
-- `privacy` is the same `permission_type` cellars and tier lists carry, with
-- the same four-branch rule (`canSeeRecipe` in packages/policy). Every recipe
-- that exists today was readable by any signed-in user, so they keep that:
-- the column is added with DEFAULT 'PUBLIC' — which backfills every existing
-- row in the same statement — and the default then moves to 'PRIVATE', so
-- only rows written from now on start private. Nothing that was visible
-- yesterday disappears today.
--
-- `is_draft` marks a recipe the AI read (a photo or pasted text) that its
-- creator has not reviewed yet. A draft is its creator's alone whatever
-- `privacy` says; saving it in the editor clears the flag. Existing rows were
-- all published by the old flow, so they are not drafts.
ALTER TABLE "recipes" ADD COLUMN "privacy" "permission_type" DEFAULT 'PUBLIC'::"permission_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "recipes" ALTER COLUMN "privacy" SET DEFAULT 'PRIVATE'::"permission_type";--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "is_draft" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- The public half of every catalog read ("shared": PUBLIC and not a draft),
-- partial like `idx_cellars_privacy_public`.
CREATE INDEX "idx_recipes_shared" ON "recipes" ("id") WHERE ((privacy = 'PUBLIC'::permission_type) AND (NOT is_draft));
