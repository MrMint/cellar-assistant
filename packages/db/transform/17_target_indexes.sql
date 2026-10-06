-- 17 · Every index the target schema declares, created idempotently.
--
-- ## Why this file exists
--
-- E4 decision 1 (`docs/architecture/e4-decisions.md`). Before this file, the
-- transform recreated exactly **one** index on a table that already existed in
-- the source: `idx_cellars_privacy_public`, and only because
-- `04_enum_split.sql` has to drop it to retype `cellars.privacy` (`04:43`,
-- `04:259`). The other ten `CREATE INDEX` statements in the transform
-- (`06_new_tables.sql`, `13_better_auth_tables.sql`) are on tables the
-- transform itself creates. So all 134 remaining indexes reached the
-- transformed database **only because the dump happened to carry them** — which
-- makes the outcome a property of the source, not of the transform.
--
-- That is a bad property in general and a specific hazard for A1's five
-- indexes, which are recorded `done (local; prod apply is the user's)`
-- (`docs/architecture/migration-plan.md:551`). If production lacks them, the
-- dump lacks them, the transformed database lacks them, and `cutover.sh`'s
-- `baseline` phase — a `drizzle-kit pull` diffed against
-- `packages/db/src/schema/tables.ts` — produces a non-empty diff and calls
-- `die`. With the site already frozen. The freeze is then held open while
-- somebody works out what the diff means.
--
-- With this file the answer no longer depends on production at all: whatever
-- the source had or lacked, the transformed database ends with the complete
-- target index set. The unanswered "does production have A1's five?" stops
-- being a question that has to be settled before the freeze.
--
-- ## Why `IF NOT EXISTS` and not `CONCURRENTLY`
--
-- `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block. These
-- files are fed to `psql` one file at a time with no `BEGIN`, so it would in
-- fact be *permitted* here — and it is still the wrong choice:
--
--   * It exists to avoid blocking writers. There are no writers: the cutover
--     runs against a freshly restored private copy, during a freeze.
--   * It is slower (two table scans plus a wait for old snapshots).
--   * On failure it leaves an **INVALID** index behind, and a later
--     `CREATE INDEX IF NOT EXISTS` of the same name then does nothing, because
--     `IF NOT EXISTS` matches on name alone. A half-built index that no
--     re-run ever repairs is precisely the landmine this file removes.
--
-- The same name-only matching is why this file cannot repair an index that
-- exists under a target name with a *different definition*. Nothing in the
-- source is known to do that, and the `baseline` phase would catch it if it
-- did: `drizzle-kit pull` reads the definition, not the name.
--
-- ## Cost inside the freeze window
--
-- Every one of these is a no-op on a source that already has it — Postgres
-- checks the name and returns. Only genuinely missing indexes are built, and
-- the five A1 ones are all small btrees on `cellars`, `cellar_items`,
-- `cellar_owners` and `friends`. Measured build times are in
-- `packages/db/transform/README.md`.
--
-- ## Where this list comes from, and what keeps it honest
--
-- Generated from the Drizzle baseline's own index block — the last 145
-- statements of `packages/db/migrations/20260910003220_opposite_havok/migration.sql`
-- — so the definitions are identical to the ones the `baseline` phase compares
-- against, rather than a hand-retyped paraphrase of them. Regenerate with:
--
--   sed -n '904,1048p' packages/db/migrations/20260910003220_opposite_havok/migration.sql \
--     | sed -e 's|--> statement-breakpoint$||' \
--     | sed -E 's|^CREATE (UNIQUE )?INDEX "([^"]+)" ON "([^"]+)"|CREATE \1INDEX IF NOT EXISTS "\2" ON public."\3"|'
--
-- `packages/db/src/schema/target-indexes.test.ts` asserts that the set of index
-- names here is exactly the set `tables.ts` declares, read through
-- `getTableConfig` rather than by grepping. Adding an index to the schema and
-- not to this file fails that test, which is what stops the gap reopening.
--
-- Re-runnable. Creates nothing that already exists; destroys nothing.
--
-- MUST RUN AFTER `06` and `13`. It indexes `files`, `jobs` and `outbox`
-- (created by `06`) and better-auth's `account`, `session`, `user` and
-- `verification` (created by `13`), so it cannot run before them. It said "MUST
-- STAY LAST" while it happened to be last, which is a stronger claim than the
-- dependency it was describing and read as a prohibition on numbering anything
-- after it; `18_teas_country_fk.sql` adds a foreign key and neither creates nor
-- indexes anything, so the two do not interact.

CREATE UNIQUE INDEX IF NOT EXISTS "account_provider_account_key" ON public."account" ("provider_id","account_id");
CREATE INDEX IF NOT EXISTS "account_user_id_idx" ON public."account" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "brands_unique_lower_name" ON public."brands" (lower(name));
CREATE INDEX IF NOT EXISTS "idx_brands_name" ON public."brands" ("name");
CREATE INDEX IF NOT EXISTS "idx_brands_name_trgm" ON public."brands" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_brands_parent" ON public."brands" ("parent_brand_id");
CREATE INDEX IF NOT EXISTS "idx_brands_type" ON public."brands" ("brand_type");
CREATE UNIQUE INDEX IF NOT EXISTS "files_bucket_key_idx" ON public."files" ("bucket","key");
CREATE INDEX IF NOT EXISTS "files_unverified_idx" ON public."files" ("created_at") WHERE (verified_at IS NULL);
CREATE INDEX IF NOT EXISTS "idx_api_usage_log_created_at" ON public."api_usage_log" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_api_usage_log_service_created" ON public."api_usage_log" ("service","created_at");
CREATE INDEX IF NOT EXISTS "idx_api_usage_log_reservation_id" ON public."api_usage_log" ((metadata ->> 'reservationId'::text)) WHERE ((metadata ->> 'reservationId'::text) IS NOT NULL);
CREATE INDEX IF NOT EXISTS "idx_category_vectors_hnsw" ON public."category_vectors" USING hnsw ("vector" halfvec_cosine_ops) WITH (m=16, ef_construction=64);
CREATE INDEX IF NOT EXISTS "idx_category_vectors_label_type" ON public."category_vectors" ("label_type");
CREATE INDEX IF NOT EXISTS "idx_cellar_items_cellar_id" ON public."cellar_items" ("cellar_id");
CREATE INDEX IF NOT EXISTS "idx_cellar_items_sake_id" ON public."cellar_items" ("sake_id");
CREATE INDEX IF NOT EXISTS "idx_cellar_items_tea_id" ON public."cellar_items" ("tea_id");
CREATE INDEX IF NOT EXISTS "idx_cellar_owners_cellar" ON public."cellar_owners" ("cellar_id","user_id");
CREATE INDEX IF NOT EXISTS "idx_cellars_created_by_id" ON public."cellars" ("created_by_id");
CREATE INDEX IF NOT EXISTS "idx_cellars_privacy_public" ON public."cellars" ("id") WHERE (privacy = 'PUBLIC'::permission_type);
CREATE INDEX IF NOT EXISTS "idx_friends_friend_user" ON public."friends" ("friend_id","user_id");
CREATE INDEX IF NOT EXISTS "idx_generic_items_category" ON public."generic_items" ("category");
CREATE INDEX IF NOT EXISTS "idx_generic_items_created_by" ON public."generic_items" ("created_by_id");
CREATE INDEX IF NOT EXISTS "idx_generic_items_item_type" ON public."generic_items" ("item_type");
CREATE INDEX IF NOT EXISTS "idx_item_brands_beer_id" ON public."item_brands" ("beer_id");
CREATE INDEX IF NOT EXISTS "idx_item_brands_brand_id" ON public."item_brands" ("brand_id");
CREATE INDEX IF NOT EXISTS "idx_item_brands_coffee_id" ON public."item_brands" ("coffee_id");
CREATE INDEX IF NOT EXISTS "idx_item_brands_sake_id" ON public."item_brands" ("sake_id");
CREATE INDEX IF NOT EXISTS "idx_item_brands_spirit_id" ON public."item_brands" ("spirit_id");
CREATE INDEX IF NOT EXISTS "idx_item_brands_tea_id" ON public."item_brands" ("tea_id");
CREATE INDEX IF NOT EXISTS "idx_item_brands_wine_id" ON public."item_brands" ("wine_id");
CREATE INDEX IF NOT EXISTS "idx_item_favorites_sake_id" ON public."item_favorites" ("sake_id");
CREATE INDEX IF NOT EXISTS "idx_item_favorites_tea_id" ON public."item_favorites" ("tea_id");
CREATE INDEX IF NOT EXISTS "idx_item_image_sake_id" ON public."item_image" ("sake_id");
CREATE INDEX IF NOT EXISTS "idx_item_image_tea_id" ON public."item_image" ("tea_id");
CREATE INDEX IF NOT EXISTS "idx_item_match_suggestions_suggested_tea_id" ON public."item_match_suggestions" ("suggested_tea_id");
CREATE INDEX IF NOT EXISTS "idx_match_suggestions_pending" ON public."item_match_suggestions" ("place_menu_item_id") WHERE ((accepted IS NULL) AND (rejected IS NULL));
CREATE INDEX IF NOT EXISTS "idx_item_reviews_sake_id" ON public."item_reviews" ("sake_id");
CREATE INDEX IF NOT EXISTS "idx_item_reviews_tea_id" ON public."item_reviews" ("tea_id");
CREATE INDEX IF NOT EXISTS "idx_item_vectors_sake_id" ON public."item_vectors" ("sake_id");
CREATE INDEX IF NOT EXISTS "idx_item_vectors_tea_id" ON public."item_vectors" ("tea_id");
CREATE INDEX IF NOT EXISTS "item_vectors_vector_hnsw_idx" ON public."item_vectors" USING hnsw ("vector" halfvec_cosine_ops) WITH (m=16, ef_construction=64);
CREATE INDEX IF NOT EXISTS "item_vectors_vector_hnsw_l2_idx" ON public."item_vectors" USING hnsw ("vector" halfvec_l2_ops) WITH (m=16, ef_construction=64);
CREATE INDEX IF NOT EXISTS "idx_menu_item_recipes_menu_item_id" ON public."menu_item_recipes" ("menu_item_id");
CREATE INDEX IF NOT EXISTS "idx_menu_item_recipes_recipe_id" ON public."menu_item_recipes" ("recipe_id");
CREATE INDEX IF NOT EXISTS "idx_menu_scans_location" ON public."menu_scans" USING gist ("scan_location");
CREATE INDEX IF NOT EXISTS "idx_menu_scans_status" ON public."menu_scans" ("processing_status");
CREATE INDEX IF NOT EXISTS "idx_menu_scans_user" ON public."menu_scans" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_pge_details_fetched_at" ON public."place_google_enrichments" ("details_fetched_at");
CREATE INDEX IF NOT EXISTS "idx_pge_google_place_id" ON public."place_google_enrichments" ("google_place_id");
CREATE UNIQUE INDEX IF NOT EXISTS "unique_google_place_id" ON public."place_google_enrichments" ("google_place_id");
CREATE INDEX IF NOT EXISTS "idx_pgp_place_id" ON public."place_google_photos" ("place_id");
CREATE UNIQUE INDEX IF NOT EXISTS "unique_place_photo" ON public."place_google_photos" ("place_id","google_photo_name");
CREATE INDEX IF NOT EXISTS "idx_place_brands_brand_id" ON public."place_brands" ("brand_id");
CREATE INDEX IF NOT EXISTS "idx_place_brands_place_id" ON public."place_brands" ("place_id");
CREATE INDEX IF NOT EXISTS "idx_place_menu_items_menu" ON public."place_menu_items" ("place_menu_id");
CREATE INDEX IF NOT EXISTS "idx_place_menu_items_place" ON public."place_menu_items" ("place_id");
CREATE INDEX IF NOT EXISTS "idx_place_menu_items_scan" ON public."place_menu_items" ("menu_scan_id");
CREATE INDEX IF NOT EXISTS "idx_place_menu_items_type" ON public."place_menu_items" ("detected_item_type");
CREATE INDEX IF NOT EXISTS "idx_place_menu_items_unmatched" ON public."place_menu_items" ("wine_id","beer_id","spirit_id","coffee_id") WHERE ((wine_id IS NULL) AND (beer_id IS NULL) AND (spirit_id IS NULL) AND (coffee_id IS NULL));
CREATE INDEX IF NOT EXISTS "idx_place_menus_current" ON public."place_menus" ("place_id","is_current") WHERE (is_current = true);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_place_menus_current_unique" ON public."place_menus" ("place_id","menu_type") WHERE (is_current = true);
CREATE INDEX IF NOT EXISTS "idx_place_menus_place_id" ON public."place_menus" ("place_id");
CREATE INDEX IF NOT EXISTS "idx_place_menus_type" ON public."place_menus" ("menu_type");
CREATE INDEX IF NOT EXISTS "idx_place_vectors_hnsw" ON public."place_vectors" USING hnsw ("vector" halfvec_cosine_ops) WITH (m=16, ef_construction=64);
CREATE INDEX IF NOT EXISTS "idx_place_vectors_hnsw_l2" ON public."place_vectors" USING hnsw ("vector" halfvec_l2_ops) WITH (m=16, ef_construction=64);
CREATE INDEX IF NOT EXISTS "idx_place_vectors_place_created" ON public."place_vectors" ("place_id","created_at");
CREATE INDEX IF NOT EXISTS "idx_place_vectors_place_id" ON public."place_vectors" ("place_id");
CREATE INDEX IF NOT EXISTS "idx_places_categories" ON public."places" USING gin ("categories");
CREATE INDEX IF NOT EXISTS "idx_places_created_by_created_at" ON public."places" ("created_by","created_at" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_places_google_place_id" ON public."places" ("google_place_id") WHERE (google_place_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS "idx_places_locality" ON public."places" ("locality");
CREATE INDEX IF NOT EXISTS "idx_places_locality_trgm" ON public."places" USING gin ("locality" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_places_location" ON public."places" USING gist ("location");
CREATE INDEX IF NOT EXISTS "idx_places_name_compact_trgm" ON public."places" USING gin (regexp_replace(lower(name), '[^a-z0-9]'::text, ''::text, 'g'::text) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_places_name_trgm" ON public."places" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_places_primary_category" ON public."places" ("primary_category");
CREATE INDEX IF NOT EXISTS "idx_places_search_text" ON public."places" USING gin ("search_text");
CREATE INDEX IF NOT EXISTS "places_created_by_idx" ON public."places" ("created_by") WHERE (created_by IS NOT NULL);
CREATE INDEX IF NOT EXISTS "places_source_idx" ON public."places" ("source");
CREATE INDEX IF NOT EXISTS "idx_recipe_groups_base_spirit" ON public."recipe_groups" ("base_spirit");
CREATE INDEX IF NOT EXISTS "idx_recipe_groups_canonical_recipe" ON public."recipe_groups" ("canonical_recipe_id");
CREATE INDEX IF NOT EXISTS "idx_recipe_groups_category" ON public."recipe_groups" ("category");
CREATE INDEX IF NOT EXISTS "idx_recipe_groups_created_by" ON public."recipe_groups" ("created_by_id");
CREATE INDEX IF NOT EXISTS "idx_recipe_groups_tags" ON public."recipe_groups" USING gin ("tags");
CREATE INDEX IF NOT EXISTS "idx_recipe_ingredients_beer_id" ON public."recipe_ingredients" ("beer_id");
CREATE INDEX IF NOT EXISTS "idx_recipe_ingredients_coffee_id" ON public."recipe_ingredients" ("coffee_id");
CREATE INDEX IF NOT EXISTS "idx_recipe_ingredients_generic_id" ON public."recipe_ingredients" ("generic_item_id");
CREATE INDEX IF NOT EXISTS "idx_recipe_ingredients_recipe_id" ON public."recipe_ingredients" ("recipe_id");
CREATE INDEX IF NOT EXISTS "idx_recipe_ingredients_sake_id" ON public."recipe_ingredients" ("sake_id");
CREATE INDEX IF NOT EXISTS "idx_recipe_ingredients_spirit_id" ON public."recipe_ingredients" ("spirit_id");
CREATE INDEX IF NOT EXISTS "idx_recipe_ingredients_tea_id" ON public."recipe_ingredients" ("tea_id");
CREATE INDEX IF NOT EXISTS "idx_recipe_ingredients_wine_id" ON public."recipe_ingredients" ("wine_id");
CREATE INDEX IF NOT EXISTS "idx_recipe_instructions_recipe_id" ON public."recipe_instructions" ("recipe_id");
CREATE INDEX IF NOT EXISTS "idx_recipe_instructions_step" ON public."recipe_instructions" ("recipe_id","step_number");
CREATE INDEX IF NOT EXISTS "idx_recipe_instructions_type" ON public."recipe_instructions" ("instruction_type");
CREATE INDEX IF NOT EXISTS "idx_recipe_reviews_created_at" ON public."recipe_reviews" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_recipe_reviews_recipe_id" ON public."recipe_reviews" ("recipe_id");
CREATE INDEX IF NOT EXISTS "idx_recipe_reviews_score" ON public."recipe_reviews" ("score");
CREATE INDEX IF NOT EXISTS "idx_recipe_reviews_user_id" ON public."recipe_reviews" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_recipe_vectors_hnsw_cosine" ON public."recipe_vectors" USING hnsw ("vector" halfvec_cosine_ops) WITH (m=16, ef_construction=64);
CREATE INDEX IF NOT EXISTS "idx_recipe_vectors_hnsw_l2" ON public."recipe_vectors" USING hnsw ("vector" halfvec_l2_ops) WITH (m=16, ef_construction=64);
CREATE INDEX IF NOT EXISTS "idx_recipe_vectors_recipe_id" ON public."recipe_vectors" ("recipe_id");
CREATE INDEX IF NOT EXISTS "idx_recipe_votes_recipe_id" ON public."recipe_votes" ("recipe_id");
CREATE INDEX IF NOT EXISTS "idx_recipe_votes_user_id" ON public."recipe_votes" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_recipe_votes_vote_type" ON public."recipe_votes" ("vote_type");
CREATE INDEX IF NOT EXISTS "idx_recipes_canonical" ON public."recipes" ("canonical_recipe_id");
CREATE INDEX IF NOT EXISTS "idx_recipes_created_by" ON public."recipes" ("created_by_id");
CREATE INDEX IF NOT EXISTS "idx_recipes_difficulty" ON public."recipes" ("difficulty_level");
CREATE INDEX IF NOT EXISTS "idx_recipes_group_id" ON public."recipes" ("recipe_group_id");
CREATE INDEX IF NOT EXISTS "idx_recipes_name" ON public."recipes" ("name");
CREATE INDEX IF NOT EXISTS "idx_recipes_type" ON public."recipes" ("type");
CREATE INDEX IF NOT EXISTS "idx_sakes_category" ON public."sakes" ("category");
CREATE INDEX IF NOT EXISTS "idx_sakes_created_by" ON public."sakes" ("created_by_id");
CREATE INDEX IF NOT EXISTS "idx_sakes_name" ON public."sakes" ("name");
CREATE INDEX IF NOT EXISTS "idx_sakes_polish_grade" ON public."sakes" ("polish_grade");
CREATE INDEX IF NOT EXISTS "idx_sakes_region" ON public."sakes" ("region");
CREATE INDEX IF NOT EXISTS "idx_sakes_type" ON public."sakes" ("type");
CREATE INDEX IF NOT EXISTS "idx_sakes_vintage" ON public."sakes" ("vintage");
CREATE INDEX IF NOT EXISTS "idx_teas_category" ON public."teas" ("category");
CREATE INDEX IF NOT EXISTS "idx_teas_created_by" ON public."teas" ("created_by_id");
CREATE INDEX IF NOT EXISTS "idx_teas_name" ON public."teas" ("name");
CREATE INDEX IF NOT EXISTS "idx_teas_region" ON public."teas" ("region");
CREATE INDEX IF NOT EXISTS "idx_tier_list_items_beer_id" ON public."tier_list_items" ("beer_id") WHERE (beer_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS "idx_tier_list_items_coffee_id" ON public."tier_list_items" ("coffee_id") WHERE (coffee_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS "idx_tier_list_items_place_id_tier_list_id" ON public."tier_list_items" ("place_id","tier_list_id");
CREATE INDEX IF NOT EXISTS "idx_tier_list_items_sake_id" ON public."tier_list_items" ("sake_id") WHERE (sake_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS "idx_tier_list_items_spirit_id" ON public."tier_list_items" ("spirit_id") WHERE (spirit_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS "idx_tier_list_items_tea_id" ON public."tier_list_items" ("tea_id") WHERE (tea_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS "idx_tier_list_items_wine_id" ON public."tier_list_items" ("wine_id") WHERE (wine_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS "tier_list_items_place_id_idx" ON public."tier_list_items" ("place_id");
CREATE INDEX IF NOT EXISTS "tier_list_items_tier_list_id_band_position_idx" ON public."tier_list_items" ("tier_list_id","band" DESC,"position");
CREATE INDEX IF NOT EXISTS "tier_list_items_tier_list_id_idx" ON public."tier_list_items" ("tier_list_id");
CREATE INDEX IF NOT EXISTS "idx_user_place_interactions_favorites" ON public."user_place_interactions" ("user_id","is_favorite") WHERE (is_favorite = true);
CREATE INDEX IF NOT EXISTS "idx_user_place_interactions_place" ON public."user_place_interactions" ("place_id");
CREATE INDEX IF NOT EXISTS "idx_user_place_interactions_user" ON public."user_place_interactions" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_place_interactions_visited" ON public."user_place_interactions" ("user_id","is_visited") WHERE (is_visited = true);
CREATE INDEX IF NOT EXISTS "idx_user_place_interactions_want_to_visit" ON public."user_place_interactions" ("user_id","want_to_visit") WHERE (want_to_visit = true);
CREATE INDEX IF NOT EXISTS "jobs_kind_status_idx" ON public."jobs" ("kind","status");
CREATE INDEX IF NOT EXISTS "outbox_delivering_idx" ON public."outbox" ("updated_at") WHERE (status = 'delivering'::text);
CREATE INDEX IF NOT EXISTS "outbox_due_idx" ON public."outbox" ("run_after","seq") WHERE (status = 'pending'::text);
CREATE INDEX IF NOT EXISTS "outbox_live_target_idx" ON public."outbox" ("target_actor","target_id","method") WHERE ((status = 'pending'::text) OR (status = 'delivering'::text));
CREATE UNIQUE INDEX IF NOT EXISTS "session_token_key" ON public."session" ("token");
CREATE INDEX IF NOT EXISTS "session_user_id_idx" ON public."session" ("user_id");
CREATE INDEX IF NOT EXISTS "tier_lists_created_by_id_idx" ON public."tier_lists" ("created_by_id");
CREATE INDEX IF NOT EXISTS "tier_lists_privacy_idx" ON public."tier_lists" ("privacy");
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_key" ON public."user" ("email");
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON public."verification" ("identifier");
