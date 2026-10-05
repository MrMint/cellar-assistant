-- A scanned menu line's type and search phrase live in columns, once.
--
-- `MenuScanActor` wrote the scanned type twice — `detected_item_type` and
-- `extracted_attributes.scanItemType` — and the AI-normalised search phrase
-- only in `extracted_attributes.search_name`; `MenuMatchJobActor` read both
-- from the JSONB. The copy dates from `detected_item_type`'s old CHECK
-- (`wine|beer|spirit|coffee|unknown`), which could not spell sake, tea or
-- cocktail. `20260910040517_b8b_widen_menu_item_type` fixed the CHECK and left
-- the duplicate and its reader in place, and rows written before it say
-- `unknown` in the column with the real type only in the JSONB.
--
-- 1. `search_name` becomes a column.
-- 2. Backfill the type: where the column is NULL or `unknown` and the JSONB
--    names a type the CHECK accepts, the JSONB wins. Where the column already
--    names a real type it is kept even if the JSONB disagrees — the column is
--    the one `PlaceActor` rewrites when a user matches the line to an item, so
--    it is the fresher of the two.
-- 3. Backfill `search_name` from the JSONB (trimmed; blank means none, and the
--    matcher falls back to the menu's own wording).
-- 4. Remove both keys from `extracted_attributes`. Every value the backfill
--    could use it has used — any valid `scanItemType` fits the widened CHECK,
--    any non-blank `search_name` fits a text column — so what is left in those
--    keys is either a duplicate or unusable. Leaving them would keep a second
--    source of truth that nothing reads and that the GraphQL
--    `extractedAttributes` field would go on serving; readers therefore read
--    the columns only, with no JSONB fallback.
--
-- The backfilled rows' `updated_at` moves to the migration's `now()` (the
-- BEFORE UPDATE trigger); nothing reads `place_menu_items.updated_at` as a
-- freshness signal.
--
-- `services/actors/src/lib/menu-scan-columns-migration.test.ts` runs steps
-- 2–4 of this file against fixture rows of every shape. Measured on
-- cellar-stack before writing this (2026-09-28): 0 rows in place_menu_items.
ALTER TABLE "place_menu_items" ADD COLUMN "search_name" text;--> statement-breakpoint
UPDATE "place_menu_items"
   SET "detected_item_type" = "extracted_attributes"->>'scanItemType'
 WHERE ("detected_item_type" IS NULL OR "detected_item_type" = 'unknown')
   AND "extracted_attributes"->>'scanItemType' IN
       ('wine', 'beer', 'spirit', 'coffee', 'sake', 'tea', 'cocktail');--> statement-breakpoint
UPDATE "place_menu_items"
   SET "search_name" = NULLIF(btrim("extracted_attributes"->>'search_name'), '')
 WHERE "search_name" IS NULL
   AND jsonb_typeof("extracted_attributes"->'search_name') = 'string';--> statement-breakpoint
UPDATE "place_menu_items"
   SET "extracted_attributes" = "extracted_attributes" - 'scanItemType' - 'search_name'
 WHERE jsonb_typeof("extracted_attributes") = 'object'
   AND "extracted_attributes" ?| ARRAY['scanItemType', 'search_name'];
