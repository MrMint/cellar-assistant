-- Drop the vector column from item_image
-- Image embeddings are now unified into item_vectors using Gemini Embedding 2's multimodal space

ALTER TABLE "public"."item_image" DROP COLUMN "vector";
