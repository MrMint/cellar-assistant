-- N08 (hybrid retrieval): a trigram index on each item table's name.
--
-- `ItemSearchActor` now ranks a text search by fusing two lists — the
-- nearest item vectors (HNSW, as before) and the names most similar to the
-- phrase by pg_trgm (`strict_word_similarity`) — with reciprocal rank fusion.
-- These are what make the lexical list an index scan rather than a scan of
-- every name: `<<%` is GIN-indexable through `gin_trgm_ops`, the operator
-- class `idx_brands_name_trgm` and `idx_places_name_trgm` already use.
--
-- Plain CREATE INDEX, not CONCURRENTLY: `db:migrate` runs each migration in a
-- transaction, and the six item tables are small enough (thousands of rows)
-- that the brief write lock is not worth a non-transactional lane.
CREATE INDEX "idx_beers_name_trgm" ON "beers" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_coffees_name_trgm" ON "coffees" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_sakes_name_trgm" ON "sakes" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_spirits_name_trgm" ON "spirits" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_teas_name_trgm" ON "teas" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_wines_name_trgm" ON "wines" USING gin ("name" gin_trgm_ops);