-- Wave B hardening (wave-A follow-up to X08's want_to_try).
--
-- 1. idx_want_to_try_recipe_id: deleting a recipe cascades into want_to_try
--    by recipe_id, and the only index carrying that column is the unique
--    (user_id, recipe_id), which leads with the user — so every recipe delete
--    scanned the whole table. Partial on NOT NULL: six of the seven target
--    columns are null on any row, and `recipe_id = $1` implies the predicate.
-- 2. The user and the six item columns go from CASCADE to RESTRICT, matching
--    item_favorites. Nothing deletes a user or an item today; when something
--    does (a purge, a merge), it has to decide what a wish becomes instead of
--    the wish vanishing as a side effect. recipe_id stays CASCADE on purpose,
--    matching recipe_favorites (Love): RecipeActor.delete is a creator's
--    action, and RESTRICT would let anyone who saved the recipe block it with
--    a raw foreign-key error.
CREATE INDEX "idx_want_to_try_recipe_id" ON "want_to_try" ("recipe_id") WHERE (recipe_id IS NOT NULL);--> statement-breakpoint
ALTER TABLE "want_to_try" DROP CONSTRAINT "want_to_try_user_id_user_id_fkey", ADD CONSTRAINT "want_to_try_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "want_to_try" DROP CONSTRAINT "want_to_try_beer_id_beers_id_fkey", ADD CONSTRAINT "want_to_try_beer_id_beers_id_fkey" FOREIGN KEY ("beer_id") REFERENCES "beers"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "want_to_try" DROP CONSTRAINT "want_to_try_wine_id_wines_id_fkey", ADD CONSTRAINT "want_to_try_wine_id_wines_id_fkey" FOREIGN KEY ("wine_id") REFERENCES "wines"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "want_to_try" DROP CONSTRAINT "want_to_try_spirit_id_spirits_id_fkey", ADD CONSTRAINT "want_to_try_spirit_id_spirits_id_fkey" FOREIGN KEY ("spirit_id") REFERENCES "spirits"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "want_to_try" DROP CONSTRAINT "want_to_try_coffee_id_coffees_id_fkey", ADD CONSTRAINT "want_to_try_coffee_id_coffees_id_fkey" FOREIGN KEY ("coffee_id") REFERENCES "coffees"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "want_to_try" DROP CONSTRAINT "want_to_try_sake_id_sakes_id_fkey", ADD CONSTRAINT "want_to_try_sake_id_sakes_id_fkey" FOREIGN KEY ("sake_id") REFERENCES "sakes"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "want_to_try" DROP CONSTRAINT "want_to_try_tea_id_teas_id_fkey", ADD CONSTRAINT "want_to_try_tea_id_teas_id_fkey" FOREIGN KEY ("tea_id") REFERENCES "teas"("id") ON DELETE RESTRICT;