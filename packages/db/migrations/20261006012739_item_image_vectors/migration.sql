-- G32 (image search): a vector per stored item photograph.
--
-- Legacy production matched a search photo against `item_vectors` only — one
-- vector per item, its text fused with up to three of its images. This adds a
-- second set: each `item_image` embedded on its own, in the same
-- `gemini-embedding-2` space, so a photo of a bottle can match the photo
-- somebody already took of it even when the item's fused vector is dominated
-- by its text. `ItemSearchActor` ranks an item by the nearer of the two.
--
-- A table rather than a column on `item_image`: see the comment above
-- `itemImageVectors` in `src/schema/tables.ts`. Empty when created — rows are
-- written by `ItemActor.embedImage` on attach, and for existing images by the
-- vector re-embed job's `item_image_vectors` table (the backfill).
-- The HNSW index matches `item_vectors_vector_hnsw_idx` (cosine, m=16,
-- ef_construction=64).
CREATE TABLE "item_image_vectors" (
	"item_image_id" uuid PRIMARY KEY,
	"vector" halfvec(768) NOT NULL,
	"embedding_model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "item_image_vectors_vector_hnsw_idx" ON "item_image_vectors" USING hnsw ("vector" halfvec_cosine_ops) WITH (m=16, ef_construction=64);--> statement-breakpoint
ALTER TABLE "item_image_vectors" ADD CONSTRAINT "item_image_vectors_item_image_id_item_image_id_fkey" FOREIGN KEY ("item_image_id") REFERENCES "item_image"("id") ON DELETE CASCADE;