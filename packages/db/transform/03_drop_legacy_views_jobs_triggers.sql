-- 03 · Drop the rest of migration-plan §3's "Removed at cutover" list that is
--      inside `public`: three read views, the two bespoke job tables, and the
--      three application triggers whose logic moves into actors.
--
-- Views: replaced by Pothos resolvers over RQB v2 (§6 C).
-- Job tables: replaced by the single `jobs` table created in 06 (§6 A5).
-- Triggers: `update_canonical_recipe` → RecipeGroupActor;
--           `trigger_recipe_group_embedding_update` → outbox-driven
--           `RecipeActor.regenerateVector`; `tier_list_items_content_changed` →
--           TierListActor. Postgres stays the truth (§1.3), but derived state is
--           written by the owning actor, not by a trigger.
--
-- NOT dropped here: `auth.*` and `storage.*`. §3 lists them as removed *after*
-- the transform — A6 (better-auth) and A8 (files) migrate their rows first, and
-- the Drizzle baseline still needs them (every user-owned row FKs to
-- `auth.users`; see transform/README.md).
--
-- Re-runnable. Destroys: 3 views, 2 tables, 5 triggers, 3 trigger functions.

DROP VIEW IF EXISTS public.recipe_summary;
DROP VIEW IF EXISTS public.recipe_ingredients_detailed;
DROP VIEW IF EXISTS public.item_brands_detailed;

DROP TABLE IF EXISTS public.place_refresh_jobs;
DROP TABLE IF EXISTS public.onboarding_reprocess_jobs;

-- `update_canonical_recipe()` is wired to three triggers on `recipe_votes`.
DROP TRIGGER IF EXISTS trigger_update_canonical_recipe_on_vote_insert ON public.recipe_votes;
DROP TRIGGER IF EXISTS trigger_update_canonical_recipe_on_vote_update ON public.recipe_votes;
DROP TRIGGER IF EXISTS trigger_update_canonical_recipe_on_vote_delete ON public.recipe_votes;
DROP FUNCTION IF EXISTS public.update_canonical_recipe();

DROP TRIGGER IF EXISTS trigger_recipe_group_embedding_update ON public.recipe_groups;
DROP FUNCTION IF EXISTS public.trigger_recipe_group_embedding_update();

DROP TRIGGER IF EXISTS tier_list_items_content_changed ON public.tier_list_items;
DROP FUNCTION IF EXISTS public.update_tier_list_content_timestamp();
