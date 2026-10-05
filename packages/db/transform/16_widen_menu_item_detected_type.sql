-- place_menu_items.detected_item_type's check constraint is narrower than
-- what the scanner actually emits.
--
-- Found by B8, fixed by B8b (migration plan). The vision pass extracts
-- `wine|beer|spirit|coffee|sake|tea|cocktail|unknown` (`SCANNED_ITEM_TYPES` in
-- `@cellar-assistant/contracts`), but this column's check constraint only ever
-- allowed `wine|beer|spirit|coffee|unknown` -- so `MenuScanActor` wrote
-- `unknown` for a detected sake, tea or cocktail line and hid the real type in
-- `extracted_attributes.scanItemType` instead. That is a lossy workaround for
-- a schema behind its own pipeline, the same family of bug as the
-- `item_favorites` sake/tea omission `08_item_favorites_missing_uniques.sql`
-- fixed.
--
-- This widens the constraint to the full eight values `ScannedItemType`
-- declares, so the column can hold every type the scanner actually names.
-- `MenuScanActor` (`services/actors/src/actors/menu-scan-actor.ts`) stops
-- degrading sake/tea/cocktail to `unknown` on write in the same change.
--
-- Widening a CHECK constraint can never make an existing row violate it, so
-- there is nothing to verify against existing data first -- unlike
-- `08_item_favorites_missing_uniques.sql`, which narrows.
--
-- `menu_item_recipes` -- giving an accepted cocktail match a home of its own,
-- the other half of B8b -- is deliberately not touched here. That table is
-- `PlaceActor`'s, nothing writes it yet, and where a cocktail match should
-- live is a design question, not a schema-widening one.
--
-- Re-runnable: a no-op once the constraint already allows all eight values.

ALTER TABLE place_menu_items
  DROP CONSTRAINT IF EXISTS place_menu_items_detected_item_type_check;

ALTER TABLE place_menu_items
  ADD CONSTRAINT place_menu_items_detected_item_type_check
  CHECK (detected_item_type = ANY (ARRAY[
    'wine'::text,
    'beer'::text,
    'spirit'::text,
    'coffee'::text,
    'sake'::text,
    'tea'::text,
    'cocktail'::text,
    'unknown'::text
  ]));
