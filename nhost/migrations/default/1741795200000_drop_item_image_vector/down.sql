-- Restore the vector column on item_image
-- Reverses the removal of per-image embeddings

ALTER TABLE "public"."item_image" ADD COLUMN "vector" vector NULL;
