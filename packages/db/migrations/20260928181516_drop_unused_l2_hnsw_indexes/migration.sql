-- Drop the three L2-distance HNSW indexes: nothing queries by L2.
--
-- `item_vectors`, `recipe_vectors` and `place_vectors` each carried two HNSW
-- indexes over the same column, one `halfvec_cosine_ops` and one
-- `halfvec_l2_ops`. Every vector query in the tree is cosine (`<=>`): grep for
-- `<->` (L2) or `<#>` (inner product) across services/ and packages/ finds
-- nothing, and no SQL function body in `public` uses either. Measured on
-- cellar-stack, 2026-09-28: `pg_stat_user_indexes.idx_scan` = 0 for all three.
-- An HNSW index is the most expensive kind to maintain — every vector write
-- paid for a second graph insert — so these were pure write amplification.
--
-- The cosine indexes stay. `place_vectors` itself stays too (0 rows, nothing
-- reads or writes it; dropping the table is a post-E4 decision), and loses only
-- its L2 index here. `transform/17_target_indexes.sql` is frozen and still
-- creates all three; this migration takes them away again on every build,
-- which `src/schema/target-indexes.test.ts` already accounts for.
DROP INDEX "item_vectors_vector_hnsw_l2_idx";--> statement-breakpoint
DROP INDEX "idx_place_vectors_hnsw_l2";--> statement-breakpoint
DROP INDEX "idx_recipe_vectors_hnsw_l2";