-- X08 (D11, D27): "Want to try" — the Save verb — for items and recipes.
--
-- One row per thing a user wants to try: the six-column item arc plus
-- `recipe_id`, exactly one set (`want_to_try_one_target`), unique per user per
-- column so a double save fails loudly instead of duplicating. Places are not
-- here: D11 revives `user_place_interactions.want_to_visit`, which already
-- exists, rather than keeping the same fact in two tables.
--
-- Cascades on every foreign key: a wish names something, and when that thing
-- (or the user) is gone the wish has nothing left to say. Written only by
-- `UserActor` (`src/writers.ts`). The (user_id, created_at) index serves the
-- only read pattern, "my list, newest first".
CREATE TABLE "want_to_try" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"beer_id" uuid,
	"wine_id" uuid,
	"spirit_id" uuid,
	"coffee_id" uuid,
	"sake_id" uuid,
	"tea_id" uuid,
	"recipe_id" uuid,
	CONSTRAINT "want_to_try_user_id_beer_id_key" UNIQUE("user_id","beer_id"),
	CONSTRAINT "want_to_try_user_id_coffee_id_key" UNIQUE("user_id","coffee_id"),
	CONSTRAINT "want_to_try_user_id_recipe_id_key" UNIQUE("user_id","recipe_id"),
	CONSTRAINT "want_to_try_user_id_sake_id_key" UNIQUE("user_id","sake_id"),
	CONSTRAINT "want_to_try_user_id_spirit_id_key" UNIQUE("user_id","spirit_id"),
	CONSTRAINT "want_to_try_user_id_tea_id_key" UNIQUE("user_id","tea_id"),
	CONSTRAINT "want_to_try_user_id_wine_id_key" UNIQUE("user_id","wine_id"),
	CONSTRAINT "want_to_try_one_target" CHECK ((num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id, recipe_id) = 1))
);
--> statement-breakpoint
CREATE INDEX "idx_want_to_try_user_created" ON "want_to_try" ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "want_to_try" ADD CONSTRAINT "want_to_try_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "want_to_try" ADD CONSTRAINT "want_to_try_beer_id_beers_id_fkey" FOREIGN KEY ("beer_id") REFERENCES "beers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "want_to_try" ADD CONSTRAINT "want_to_try_wine_id_wines_id_fkey" FOREIGN KEY ("wine_id") REFERENCES "wines"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "want_to_try" ADD CONSTRAINT "want_to_try_spirit_id_spirits_id_fkey" FOREIGN KEY ("spirit_id") REFERENCES "spirits"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "want_to_try" ADD CONSTRAINT "want_to_try_coffee_id_coffees_id_fkey" FOREIGN KEY ("coffee_id") REFERENCES "coffees"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "want_to_try" ADD CONSTRAINT "want_to_try_sake_id_sakes_id_fkey" FOREIGN KEY ("sake_id") REFERENCES "sakes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "want_to_try" ADD CONSTRAINT "want_to_try_tea_id_teas_id_fkey" FOREIGN KEY ("tea_id") REFERENCES "teas"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "want_to_try" ADD CONSTRAINT "want_to_try_recipe_id_recipes_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE;