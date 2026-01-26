-- Create recipe_reviews table
-- Similar to item_reviews but for recipes
CREATE TABLE "public"."recipe_reviews" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "recipe_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "score" float4,
  "text" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON UPDATE restrict ON DELETE cascade,
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON UPDATE restrict ON DELETE cascade,
  CONSTRAINT "recipe_reviews_unique_user_recipe" UNIQUE ("recipe_id", "user_id")
);

-- Add check constraint for score range (0.5 to 5.0 in 0.5 increments)
ALTER TABLE "public"."recipe_reviews" 
ADD CONSTRAINT "recipe_reviews_score_range" 
CHECK (score IS NULL OR score = ANY(ARRAY[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]));

-- Create indexes for performance
CREATE INDEX "idx_recipe_reviews_recipe_id" ON "public"."recipe_reviews" ("recipe_id");
CREATE INDEX "idx_recipe_reviews_user_id" ON "public"."recipe_reviews" ("user_id");
CREATE INDEX "idx_recipe_reviews_score" ON "public"."recipe_reviews" ("score");
CREATE INDEX "idx_recipe_reviews_created_at" ON "public"."recipe_reviews" ("created_at");

-- Create trigger for updated_at timestamp
CREATE TRIGGER "set_public_recipe_reviews_updated_at"
BEFORE UPDATE ON "public"."recipe_reviews"
FOR EACH ROW
EXECUTE PROCEDURE "public"."set_current_timestamp_updated_at"();

COMMENT ON TRIGGER "set_public_recipe_reviews_updated_at" ON "public"."recipe_reviews"
IS 'trigger to set value of column "updated_at" to current timestamp on row update';

-- Ensure pgcrypto extension is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;