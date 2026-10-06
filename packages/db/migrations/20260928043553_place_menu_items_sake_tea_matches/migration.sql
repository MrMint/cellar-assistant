ALTER TABLE "place_menu_items" ADD COLUMN "sake_id" uuid;--> statement-breakpoint
ALTER TABLE "place_menu_items" ADD COLUMN "tea_id" uuid;--> statement-breakpoint
DROP INDEX "idx_place_menu_items_unmatched";--> statement-breakpoint
CREATE INDEX "idx_place_menu_items_unmatched" ON "place_menu_items" ("wine_id","beer_id","spirit_id","coffee_id","sake_id","tea_id") WHERE ((wine_id IS NULL) AND (beer_id IS NULL) AND (spirit_id IS NULL) AND (coffee_id IS NULL) AND (sake_id IS NULL) AND (tea_id IS NULL));--> statement-breakpoint
ALTER TABLE "place_menu_items" ADD CONSTRAINT "place_menu_items_sake_id_sakes_id_fkey" FOREIGN KEY ("sake_id") REFERENCES "sakes"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "place_menu_items" ADD CONSTRAINT "place_menu_items_tea_id_teas_id_fkey" FOREIGN KEY ("tea_id") REFERENCES "teas"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "place_menu_items" DROP CONSTRAINT "check_single_item_type", ADD CONSTRAINT "check_single_item_type" CHECK ((num_nonnulls(wine_id, beer_id, spirit_id, coffee_id, sake_id, tea_id) <= 1));