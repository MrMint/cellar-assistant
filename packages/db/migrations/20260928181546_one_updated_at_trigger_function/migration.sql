-- One `updated_at` trigger function instead of eight.
--
-- Every `BEFORE UPDATE` trigger that stamps `updated_at` ran one of eight
-- functions — `set_current_timestamp_updated_at` (22 tables),
-- `trigger_set_updated_at` (sakes, teas), `update_updated_at_column`
-- (recipe_groups, recipe_votes), `update_item_image_updated_at` and four
-- `update_{item,place,recipe,category}_vectors_updated_at` — all byte-identical
-- (`NEW.updated_at = now(); RETURN NEW;`), no table with more than one. Eight
-- names for one behaviour cost real confusion: `ItemActor` stamped sakes and
-- teas by hand because "they use a different trigger", which it did not in any
-- way that mattered. `scripts/cutover/README.md` had recorded the eight as
-- deliberately kept; that is now superseded.
--
-- After this, every such trigger runs `public.set_current_timestamp_updated_at()`
-- and the other seven functions are gone. The nine re-pointed triggers keep
-- their names, their timing (BEFORE UPDATE, FOR EACH ROW) and their tables, so
-- nothing observable changes: `updated_at` is still the database's `now()` —
-- the transaction's start time — on every update, which is what the vector
-- freshness checks compare against. `CREATE OR REPLACE` states the one
-- function's body here, so the migrations say what it does; against a database
-- that already has it, it changes nothing (owner and grants are kept).
--
-- Tables with an `updated_at` column but no trigger (outbox, jobs, cellars,
-- files, api_budget_config, better-auth's four) are left alone — each writes
-- the column itself, and `outbox.updated_at` in particular means "time of
-- death", which a trigger would corrupt. `services/actors/src/lib/updated-at-
-- triggers.test.ts` names every table either way and proves each trigger fires.
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;--> statement-breakpoint
DROP TRIGGER set_updated_at_sakes ON public.sakes;--> statement-breakpoint
CREATE TRIGGER set_updated_at_sakes BEFORE UPDATE ON public.sakes FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();--> statement-breakpoint
DROP TRIGGER set_updated_at_teas ON public.teas;--> statement-breakpoint
CREATE TRIGGER set_updated_at_teas BEFORE UPDATE ON public.teas FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();--> statement-breakpoint
DROP TRIGGER update_recipe_groups_updated_at ON public.recipe_groups;--> statement-breakpoint
CREATE TRIGGER update_recipe_groups_updated_at BEFORE UPDATE ON public.recipe_groups FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();--> statement-breakpoint
DROP TRIGGER update_recipe_votes_updated_at ON public.recipe_votes;--> statement-breakpoint
CREATE TRIGGER update_recipe_votes_updated_at BEFORE UPDATE ON public.recipe_votes FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();--> statement-breakpoint
DROP TRIGGER update_item_image_updated_at ON public.item_image;--> statement-breakpoint
CREATE TRIGGER update_item_image_updated_at BEFORE UPDATE ON public.item_image FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();--> statement-breakpoint
DROP TRIGGER update_item_vectors_updated_at ON public.item_vectors;--> statement-breakpoint
CREATE TRIGGER update_item_vectors_updated_at BEFORE UPDATE ON public.item_vectors FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();--> statement-breakpoint
DROP TRIGGER update_place_vectors_updated_at ON public.place_vectors;--> statement-breakpoint
CREATE TRIGGER update_place_vectors_updated_at BEFORE UPDATE ON public.place_vectors FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();--> statement-breakpoint
DROP TRIGGER update_recipe_vectors_updated_at ON public.recipe_vectors;--> statement-breakpoint
CREATE TRIGGER update_recipe_vectors_updated_at BEFORE UPDATE ON public.recipe_vectors FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();--> statement-breakpoint
DROP TRIGGER trg_category_vectors_updated_at ON public.category_vectors;--> statement-breakpoint
CREATE TRIGGER trg_category_vectors_updated_at BEFORE UPDATE ON public.category_vectors FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();--> statement-breakpoint
DROP FUNCTION public.trigger_set_updated_at();--> statement-breakpoint
DROP FUNCTION public.update_updated_at_column();--> statement-breakpoint
DROP FUNCTION public.update_item_image_updated_at();--> statement-breakpoint
DROP FUNCTION public.update_item_vectors_updated_at();--> statement-breakpoint
DROP FUNCTION public.update_place_vectors_updated_at();--> statement-breakpoint
DROP FUNCTION public.update_recipe_vectors_updated_at();--> statement-breakpoint
DROP FUNCTION public.update_category_vectors_updated_at();
