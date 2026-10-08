-- X02 (D5): a bottle-optional drink log.
--
-- `check_ins` was "a timestamp bound to a bottle": `cellar_item_id NOT NULL`,
-- `ON DELETE RESTRICT`, so `CellarActor.removeItem` deleted a bottle's history
-- together with the bottle. A log entry is now about an *item* (the six-column
-- arc every other item-pointing table uses, under the same `num_nonnulls = 1`
-- check), and the bottle is an optional detail of it:
--
-- * `cellar_item_id` is nullable and `ON DELETE SET NULL` — removing or
--   finishing a bottle keeps every log against it;
-- * `score` (nullable, the half-star scale `item_reviews` uses — one rating per
--   item stays the review, D5), `note`, `tags` (flavour words the drinker
--   confirmed), `place_id`, `photo_file_id`;
-- * `group_id` — the drinking occasion. "Who drank with you" stays the existing
--   model (one row per drinker, written by whoever logged it), and the rows
--   written together share a `group_id`, which is what lets a log say "with
--   Sam" and lets Sam see the entry it names him in;
-- * `created_by_id` — who wrote the row, which `bulkCheckIn` already made
--   different from `user_id` (who it is about).
--
-- Backfill, in this order, before any NOT NULL or CHECK lands:
--   1. the item arc from the bottle each existing row points at (every
--      existing row has one: the column was NOT NULL until this migration);
--   2. `created_by_id = user_id` (the old table did not record a writer; the
--      drinker is the only answer that is never wrong about whose row it is);
--   3. `group_id = id` (every existing row its own occasion — `bulkCheckIn`
--      did not record which rows were written together).
ALTER TABLE "check_ins" ADD COLUMN "wine_id" uuid;--> statement-breakpoint
ALTER TABLE "check_ins" ADD COLUMN "beer_id" uuid;--> statement-breakpoint
ALTER TABLE "check_ins" ADD COLUMN "spirit_id" uuid;--> statement-breakpoint
ALTER TABLE "check_ins" ADD COLUMN "coffee_id" uuid;--> statement-breakpoint
ALTER TABLE "check_ins" ADD COLUMN "sake_id" uuid;--> statement-breakpoint
ALTER TABLE "check_ins" ADD COLUMN "tea_id" uuid;--> statement-breakpoint
ALTER TABLE "check_ins" ADD COLUMN "created_by_id" uuid;--> statement-breakpoint
ALTER TABLE "check_ins" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "check_ins" ADD COLUMN "score" real;--> statement-breakpoint
ALTER TABLE "check_ins" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "check_ins" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "check_ins" ADD COLUMN "place_id" uuid;--> statement-breakpoint
ALTER TABLE "check_ins" ADD COLUMN "photo_file_id" uuid;--> statement-breakpoint
ALTER TABLE "check_ins" ALTER COLUMN "cellar_item_id" DROP NOT NULL;--> statement-breakpoint
UPDATE "check_ins" ci
SET "wine_id" = it."wine_id",
    "beer_id" = it."beer_id",
    "spirit_id" = it."spirit_id",
    "coffee_id" = it."coffee_id",
    "sake_id" = it."sake_id",
    "tea_id" = it."tea_id"
FROM "cellar_items" it
WHERE it."id" = ci."cellar_item_id";--> statement-breakpoint
UPDATE "check_ins" SET "created_by_id" = "user_id", "group_id" = "id";--> statement-breakpoint
ALTER TABLE "check_ins" ALTER COLUMN "created_by_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "check_ins" ALTER COLUMN "group_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_check_ins_user_id_created_at" ON "check_ins" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_check_ins_group_id" ON "check_ins" ("group_id");--> statement-breakpoint
CREATE INDEX "idx_check_ins_wine_id" ON "check_ins" ("wine_id");--> statement-breakpoint
CREATE INDEX "idx_check_ins_beer_id" ON "check_ins" ("beer_id");--> statement-breakpoint
CREATE INDEX "idx_check_ins_spirit_id" ON "check_ins" ("spirit_id");--> statement-breakpoint
CREATE INDEX "idx_check_ins_coffee_id" ON "check_ins" ("coffee_id");--> statement-breakpoint
CREATE INDEX "idx_check_ins_sake_id" ON "check_ins" ("sake_id");--> statement-breakpoint
CREATE INDEX "idx_check_ins_tea_id" ON "check_ins" ("tea_id");--> statement-breakpoint
CREATE INDEX "idx_check_ins_photo_file_id" ON "check_ins" ("photo_file_id");--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_wine_id_wines_id_fkey" FOREIGN KEY ("wine_id") REFERENCES "wines"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_beer_id_beers_id_fkey" FOREIGN KEY ("beer_id") REFERENCES "beers"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_spirit_id_spirits_id_fkey" FOREIGN KEY ("spirit_id") REFERENCES "spirits"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_coffee_id_coffees_id_fkey" FOREIGN KEY ("coffee_id") REFERENCES "coffees"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_sake_id_sakes_id_fkey" FOREIGN KEY ("sake_id") REFERENCES "sakes"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_tea_id_teas_id_fkey" FOREIGN KEY ("tea_id") REFERENCES "teas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_created_by_id_user_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_place_id_places_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_photo_file_id_files_id_fkey" FOREIGN KEY ("photo_file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "check_ins" DROP CONSTRAINT "check_ins_cellar_item_id_cellar_items_id_fkey", ADD CONSTRAINT "check_ins_cellar_item_id_cellar_items_id_fkey" FOREIGN KEY ("cellar_item_id") REFERENCES "cellar_items"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_one_item" CHECK ((num_nonnulls(wine_id, beer_id, spirit_id, coffee_id, sake_id, tea_id) = 1));--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_score_half_stars" CHECK (((score IS NULL) OR (score = ANY (ARRAY[(0.5)::double precision, (1)::double precision, (1.5)::double precision, (2)::double precision, (2.5)::double precision, (3)::double precision, (3.5)::double precision, (4)::double precision, (4.5)::double precision, (5)::double precision]))));--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_note_length" CHECK (((note IS NULL) OR (char_length(note) <= 2000)));--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_tags_count" CHECK ((cardinality(tags) <= 12));