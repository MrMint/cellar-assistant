-- X14 (recipes meet the cellar), D23 (Bar pantry), D9 (Love replaces the heart).
--
-- `recipe_ingredients` gains what the recipe-photo extraction now reads per
-- ingredient: `role` (base / modifier / … — a garnish never blocks "Make
-- now"), `kind` (one value of the closed vocabulary in
-- `packages/contracts/src/bar.ts`, the thing availability compares),
-- `quantity_text` (the amount as printed, "¾ oz" / "top with", which the one
-- quantity formatter prefers to the numeric pair) and `brand_mentioned`.
-- `kind` is deliberately not CHECKed against the vocabulary: the list grows in
-- code, and a CHECK would make every new kind a migration. The writer
-- (`RecipeActor.setIngredients`) refuses anything outside it.
--
-- The optional linked item is the column set that already exists: an
-- ingredient points at one catalog item *or* a generic item
-- (`exactly_one_item_reference`), and `kind` now carries the class either way,
-- so "2 oz Buffalo Trace" keeps its bottle link and still answers "bourbon".
--
-- All four are nullable with no backfill here. Reads derive a missing `kind`
-- and `role` from the referenced item's name (`inferIngredientMeta`), so
-- existing recipes work the moment this applies; `bun scripts/operator.ts
-- backfill-recipes` persists them (and `recipe_groups.base_spirit`) through
-- the owning actors.
--
-- `bar_pantry_items`: one row per pantry toggle that is ON, per user.
-- `recipe_favorites`: Love on a recipe. Both are `UserActor`'s (rows where
-- `user_id` is the actor's user) and go with the user.
CREATE TABLE "bar_pantry_items" (
	"user_id" uuid,
	"kind" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_pantry_items_pkey" PRIMARY KEY("user_id","kind"),
	CONSTRAINT "bar_pantry_items_kind_check" CHECK ((length(kind) > 0 AND length(kind) <= 64))
);
--> statement-breakpoint
CREATE TABLE "recipe_favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_favorites_user_id_recipe_id_key" UNIQUE("user_id","recipe_id")
);
--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD COLUMN "role" text;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD COLUMN "quantity_text" text;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD COLUMN "brand_mentioned" text;--> statement-breakpoint
CREATE INDEX "idx_recipe_favorites_recipe_id" ON "recipe_favorites" ("recipe_id");--> statement-breakpoint
CREATE INDEX "idx_recipe_ingredients_kind" ON "recipe_ingredients" ("kind");--> statement-breakpoint
ALTER TABLE "bar_pantry_items" ADD CONSTRAINT "bar_pantry_items_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recipe_favorites" ADD CONSTRAINT "recipe_favorites_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recipe_favorites" ADD CONSTRAINT "recipe_favorites_recipe_id_recipes_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_role_check" CHECK (((role IS NULL) OR (role = ANY (ARRAY['base'::text, 'modifier'::text, 'sweetener'::text, 'acid'::text, 'bitters'::text, 'mixer'::text, 'garnish'::text, 'other'::text]))));--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_quantity_text_check" CHECK (((quantity_text IS NULL) OR (length(quantity_text) <= 80)));