-- Create recipe_category enum table following established pattern
BEGIN;

-- Create the enum table
CREATE TABLE "public"."recipe_category" (
  "value" text NOT NULL,
  "comment" text,
  PRIMARY KEY ("value")
);

-- Insert enum values based on existing check constraint
INSERT INTO "public"."recipe_category"("value", "comment") VALUES
  ('cocktail', 'Alcoholic mixed drinks'),
  ('mocktail', 'Non-alcoholic mixed drinks'),
  ('shot', 'Single-serving alcoholic beverages'),
  ('punch', 'Large-batch mixed drinks for serving groups'),
  ('other', 'Other recipe categories');

-- Drop the old check constraint
ALTER TABLE "public"."recipe_groups" DROP CONSTRAINT IF EXISTS "recipe_groups_category_check";

-- Add foreign key constraint
ALTER TABLE "public"."recipe_groups"
  ADD CONSTRAINT "recipe_groups_category_fkey"
  FOREIGN KEY ("category")
  REFERENCES "public"."recipe_category"("value")
  ON UPDATE CASCADE
  ON DELETE RESTRICT;

COMMIT;
