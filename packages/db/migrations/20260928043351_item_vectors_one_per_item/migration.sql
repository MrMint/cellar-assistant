-- One vector per item, enforced (ITEM_TYPE_SPECS work, item 3).
--
-- `item_vectors` carried no `num_nonnulls(...) = 1` check — the only one of
-- the six-column item arcs without one — and nothing kept an item to a single
-- row, so readers papered over it: `ItemSearchActor` with `DISTINCT ON` over
-- the six columns, `ItemActor` by taking `vectors[0]` ordered by id.
--
-- Before the constraints, the rows they would refuse are removed, and this is
-- the only data this migration touches. A vector is derived data:
-- `ItemActor.regenerateVector` rebuilds it from the item row, so nothing is
-- lost that cannot be recomputed.
--   1. rows naming no item, or more than one (no referent to keep them for);
--   2. every duplicate for one item but the newest — `updated_at` desc, then
--      `id` desc, so the choice is deterministic and is the vector
--      `regenerateVector` wrote last.
-- Measured on cellar-stack before applying (2026-09-28): 86 rows, all with
-- exactly one item, no item with two — both deletes were no-ops there.
DELETE FROM "item_vectors"
 WHERE num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id) <> 1;--> statement-breakpoint
DELETE FROM "item_vectors" v
 USING (SELECT id,
               row_number() OVER (
                 PARTITION BY beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id
                 ORDER BY updated_at DESC NULLS LAST, id DESC) AS rank
          FROM "item_vectors") ranked
 WHERE v.id = ranked.id AND ranked.rank > 1;--> statement-breakpoint
DROP INDEX "idx_item_vectors_sake_id";--> statement-breakpoint
CREATE UNIQUE INDEX "idx_item_vectors_sake_id" ON "item_vectors" ("sake_id");--> statement-breakpoint
DROP INDEX "idx_item_vectors_tea_id";--> statement-breakpoint
CREATE UNIQUE INDEX "idx_item_vectors_tea_id" ON "item_vectors" ("tea_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_item_vectors_beer_id" ON "item_vectors" ("beer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_item_vectors_coffee_id" ON "item_vectors" ("coffee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_item_vectors_spirit_id" ON "item_vectors" ("spirit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_item_vectors_wine_id" ON "item_vectors" ("wine_id");--> statement-breakpoint
ALTER TABLE "item_vectors" ADD CONSTRAINT "exactly_one_item_reference" CHECK ((num_nonnulls(beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id) = 1));