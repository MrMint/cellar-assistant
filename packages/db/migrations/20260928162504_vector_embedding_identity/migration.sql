-- Which embedding produced each stored vector.
--
-- Two vectors are comparable only when the same model, at the same width,
-- with the same task instruction, over the same inputs made them
-- (`services/actors/src/lib/embeddings.ts`). A `halfvec(768)` column cannot
-- tell any of that apart, and `regenerateVector`'s freshness test used to be
-- the timestamp alone — so after a model change every stored vector read as
-- fresh and search silently compared across two spaces.
--
--   embedding_model   `<provider>:<model>@<dimensions>/<document task>`, as
--                     `EmbeddingActor` reported it, e.g.
--                     `vertex-ai:gemini-embedding-2@768/RETRIEVAL_DOCUMENT`.
--   embedding_images  the images embedded with the text: `none`, or
--                     `<count>:<the file ids, comma-separated, in send order>`.
--
-- Both are NULL for every existing row, and NULL means "unknown": the
-- migrated legacy vectors (gemini-embedding-2-preview, text plus up to three
-- label/display images, task_type RETRIEVAL_DOCUMENT) and anything written
-- before this. A NULL never matches the configured model, so every such row
-- is stale, and `VectorReembedJobActor` re-embeds them — the cutover step.
-- No backfill: guessing an identity for a row nobody recorded is the failure
-- these columns exist to stop.
ALTER TABLE "item_vectors" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "item_vectors" ADD COLUMN "embedding_images" text;--> statement-breakpoint
ALTER TABLE "recipe_vectors" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "recipe_vectors" ADD COLUMN "embedding_images" text;