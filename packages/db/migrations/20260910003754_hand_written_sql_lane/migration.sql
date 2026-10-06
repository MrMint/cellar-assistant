-- Hand-written SQL lane (migration-plan.md §8.6, workstream A3b).
--
-- Re-creates the four search functions that `transform/02_drop_phantom_result_tables.sql`
-- dropped along with their phantom `RETURNS SETOF <table>` result types
-- (`hybrid_search_results`, `place_search_results`, `search_category_vectors_results`,
-- `duplicate_place_results`). Those tables existed only because Hasura required a
-- tracked table to expose a function as a query; nothing was ever written to them.
--
-- Ported verbatim from the Nhost database (`pg_get_functiondef`, 2026-09-08) except
-- for the two mechanical changes a `RETURNS TABLE(...)` conversion requires. No
-- ranking weight, cap, or clustering threshold has been touched — porting the SQL
-- bodies as-is (weights still hard-coded) is deliberate; migration-plan §2.3 and §9
-- both defer moving the weights into TypeScript arguments to a later pass.
--
-- Two mechanical changes, applied identically to all four functions:
--
--   1. `RETURNS SETOF <phantom table>` -> `RETURNS TABLE(<same columns, same order,
--      same types>)`, copied 1:1 from the dropped result table's `\d` output. Any
--      NOT NULL / CHECK constraint the old result table carried
--      (`place_search_results_cluster_check`) is dropped along with it: RETURNS
--      TABLE cannot express either, and neither was ever enforced on the function's
--      output anyway (a table's constraints fire on INSERT/UPDATE, never on a
--      `RETURN QUERY` that merely borrows the table as a row-type template).
--
--   2. `#variable_conflict use_column` added as the first line of every function
--      body. RETURNS TABLE turns each output column into a named PL/pgSQL OUT
--      parameter, i.e. a variable in scope for the rest of the function body. Two
--      of the four functions have inner queries that reference their *own*
--      same-named result columns unqualified (`search_places_hybrid`'s `deduped`
--      CTE and its ORDER BY; `find_duplicate_places`'s ORDER BY on `similarity` /
--      `distance_m`). Without this pragma, PL/pgSQL's default
--      `variable_conflict = error` raises "column reference ... is ambiguous" at
--      CREATE time, because those bare names now also match an OUT parameter that
--      did not exist under `RETURNS SETOF`. `use_column` restores the exact
--      pre-conversion resolution: a bare name that matches both a query column and
--      an OUT parameter always resolves to the query column. This is a required
--      consequence of the signature change, not a behavior change — with
--      `RETURNS SETOF <table>` there were no OUT parameters to conflict with in
--      the first place.
--
-- search_places_adaptive_cluster and search_places_hybrid both take a
-- `tier_list_ids` argument that they trust — see the comment directly above
-- search_places_adaptive_cluster for who is responsible for sanitising it.

--> statement-breakpoint

-- ============================================================================
-- search_places_hybrid — PlaceSearchActor (migration-plan §2.3)
--
-- Old:  search_places_hybrid(search_query text, matched_categories text[] DEFAULT NULL,
--         category_scores double precision[] DEFAULT NULL, west_bound double precision DEFAULT NULL,
--         south_bound double precision DEFAULT NULL, east_bound double precision DEFAULT NULL,
--         north_bound double precision DEFAULT NULL, min_rating double precision DEFAULT NULL,
--         result_limit integer DEFAULT 50, tier_list_ids uuid[] DEFAULT NULL,
--         filter_categories text[] DEFAULT NULL)
--       RETURNS SETOF hybrid_search_results
-- New:  same parameter list; RETURNS TABLE(23 columns — see below).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.search_places_hybrid(
  search_query text,
  matched_categories text[] DEFAULT NULL::text[],
  category_scores double precision[] DEFAULT NULL::double precision[],
  west_bound double precision DEFAULT NULL::double precision,
  south_bound double precision DEFAULT NULL::double precision,
  east_bound double precision DEFAULT NULL::double precision,
  north_bound double precision DEFAULT NULL::double precision,
  min_rating double precision DEFAULT NULL::double precision,
  result_limit integer DEFAULT 50,
  tier_list_ids uuid[] DEFAULT NULL::uuid[],
  filter_categories text[] DEFAULT NULL::text[]
)
 RETURNS TABLE(
  id uuid,
  name text,
  location geography(Point,4326),
  primary_category text,
  categories text[],
  confidence numeric(3,2),
  street_address text,
  locality text,
  region text,
  postcode text,
  country_code character(2),
  phone text,
  website text,
  email text,
  hours jsonb,
  price_level integer,
  rating numeric(2,1),
  review_count integer,
  is_verified boolean,
  text_rank double precision,
  trigram_similarity double precision,
  category_score double precision,
  combined_score double precision
 )
 LANGUAGE plpgsql
 STABLE
AS $function$
#variable_conflict use_column
DECLARE
  tsquery_val TSQUERY;
  has_categories BOOLEAN;
  has_text_query BOOLEAN;
  has_filter BOOLEAN;
  bbox geometry;
  safe_query TEXT;
  compact_query TEXT;
BEGIN
  has_categories := matched_categories IS NOT NULL AND array_length(matched_categories, 1) > 0;
  has_text_query := search_query IS NOT NULL AND length(trim(search_query)) > 0;
  has_filter := filter_categories IS NOT NULL AND array_length(filter_categories, 1) > 0;

  IF has_text_query THEN
    tsquery_val := websearch_to_tsquery('simple', search_query);
    -- Escape LIKE wildcards for safe ILIKE usage in trgm_matches
    safe_query := replace(replace(replace(search_query, '\', '\\'), '%', '\%'), '_', '\_');
    -- Normalized version for compact name matching (strip all non-alphanumeric)
    compact_query := regexp_replace(lower(search_query), '[^a-z0-9]', '', 'g');
  END IF;

  -- Pre-compute bounding box once (used by && operator below)
  IF west_bound IS NOT NULL AND south_bound IS NOT NULL
     AND east_bound IS NOT NULL AND north_bound IS NOT NULL THEN
    bbox := ST_MakeEnvelope(west_bound, south_bound, east_bound, north_bound, 4326);
  END IF;

  RETURN QUERY
  WITH
  -- Index-first strategy: each match layer queries the places table directly
  -- so PostgreSQL can leverage GIN indexes for text/trigram/category lookups.

  -- Layer 1A: Full-text search — uses GIN index idx_places_search_text.
  text_matches AS (
    SELECT
      p.id,
      ts_rank_cd(p.search_text, tsquery_val, 32) AS rank_score
    FROM public.places p
    WHERE has_text_query
      AND p.is_active = true
      AND p.search_text @@ tsquery_val
      AND (NOT has_filter OR p.primary_category = ANY(filter_categories) OR p.categories && filter_categories)
      AND (bbox IS NULL OR p.location && bbox)
      AND (min_rating IS NULL OR p.rating >= min_rating)
      AND (tier_list_ids IS NULL OR EXISTS (SELECT 1 FROM tier_list_items tli WHERE tli.place_id = p.id AND tli.tier_list_id = ANY(tier_list_ids)))
    LIMIT result_limit * 3
  ),
  -- Layer 1B: Fuzzy name matching — three candidate generation paths merged
  -- via BitmapOr. No ORDER BY: allows early termination via LIMIT.
  --   a) ILIKE on name — exact substring (GIN idx_places_name_trgm)
  --   b) ILIKE on space-stripped name — missing spaces (GIN idx_places_name_compact_trgm)
  --   c) <% word_similarity — character-level typos (GIN idx_places_name_trgm)
  trgm_matches AS (
    SELECT
      p.id,
      word_similarity(search_query, p.name) AS sim_score
    FROM public.places p
    WHERE has_text_query
      AND length(trim(search_query)) >= 3
      AND p.is_active = true
      AND (
        p.name ILIKE '%' || safe_query || '%'
        OR regexp_replace(lower(p.name), '[^a-z0-9]', '', 'g') ILIKE '%' || compact_query || '%'
        OR search_query OPERATOR(public.<%) p.name
      )
      AND (NOT has_filter OR p.primary_category = ANY(filter_categories) OR p.categories && filter_categories)
      AND (bbox IS NULL OR p.location && bbox)
      AND (min_rating IS NULL OR p.rating >= min_rating)
      AND (tier_list_ids IS NULL OR EXISTS (SELECT 1 FROM tier_list_items tli WHERE tli.place_id = p.id AND tli.tier_list_id = ANY(tier_list_ids)))
    LIMIT result_limit * 2
  ),
  -- Layer 2: Category matching — uses GIN index idx_places_categories
  category_matches AS (
    SELECT
      p.id,
      LEAST(1.0, scores.cat_score * CASE
        WHEN p.primary_category = ANY(matched_categories) THEN 1.15
        ELSE 1.0
      END) AS cat_score
    FROM public.places p
    CROSS JOIN LATERAL (
      SELECT COALESCE(MAX(
        CASE
          WHEN category_scores IS NOT NULL AND array_position(matched_categories, cat) IS NOT NULL
          THEN category_scores[array_position(matched_categories, cat)]
          ELSE 0.5
        END
      ), 0) AS cat_score
      FROM unnest(p.categories) AS cat
      WHERE cat = ANY(matched_categories)
    ) scores
    WHERE has_categories
      AND p.is_active = true
      AND (p.primary_category = ANY(matched_categories) OR p.categories && matched_categories)
      AND (NOT has_filter OR p.primary_category = ANY(filter_categories) OR p.categories && filter_categories)
      AND (bbox IS NULL OR p.location && bbox)
      AND (min_rating IS NULL OR p.rating >= min_rating)
      AND (tier_list_ids IS NULL OR EXISTS (SELECT 1 FROM tier_list_items tli WHERE tli.place_id = p.id AND tli.tier_list_id = ANY(tier_list_ids)))
    LIMIT result_limit * 3
  ),
  -- Merge all match layers (raw scores)
  merged AS (
    SELECT
      COALESCE(tm.id, tg.id, cm.id) AS place_id,
      COALESCE(tm.rank_score, 0.0)::FLOAT8 AS raw_text_rank,
      COALESCE(tg.sim_score, 0.0)::FLOAT8 AS trigram_similarity,
      COALESCE(cm.cat_score, 0.0)::FLOAT8 AS category_score
    FROM text_matches tm
    FULL OUTER JOIN trgm_matches tg ON tm.id = tg.id
    FULL OUTER JOIN category_matches cm ON COALESCE(tm.id, tg.id) = cm.id
  ),
  -- Category enrichment: text/trgm matched places may not appear in the
  -- LIMIT-constrained category_matches (e.g., 1.37M coffee shops but only
  -- 150 picked). For the small text/trgm set, look up actual category scores
  -- via primary key — just a handful of index lookups.
  category_enrich AS (
    SELECT
      m.place_id,
      LEAST(1.0, scores.cat_score * CASE
        WHEN p.primary_category = ANY(matched_categories) THEN 1.15
        ELSE 1.0
      END) AS cat_score
    FROM merged m
    JOIN public.places p ON p.id = m.place_id
    CROSS JOIN LATERAL (
      SELECT COALESCE(MAX(
        CASE
          WHEN category_scores IS NOT NULL AND array_position(matched_categories, cat) IS NOT NULL
          THEN category_scores[array_position(matched_categories, cat)]
          ELSE 0.5
        END
      ), 0) AS cat_score
      FROM unnest(p.categories) AS cat
      WHERE cat = ANY(matched_categories)
    ) scores
    WHERE has_categories
      AND m.category_score = 0.0
      AND (m.raw_text_rank > 0 OR m.trigram_similarity > 0)
  ),
  -- Compute max text_rank for normalization (avoids window functions which
  -- trigger a paradedb schema resolution issue in PL/pgSQL on some configs)
  max_text AS (
    SELECT GREATEST(MAX(raw_text_rank), 0.001) AS val FROM merged
  ),
  -- Normalize text_rank and compute combined score with name boost
  scored AS (
    SELECT
      m.place_id,
      -- Normalize text_rank to 0-1 within the result set.
      -- ts_rank_cd() returns ~0.001-0.15 raw; without normalization its
      -- 35% weight contributes almost nothing vs 0-1 trigram/category scores.
      (m.raw_text_rank / mt.val)::FLOAT8 AS text_rank,
      m.trigram_similarity,
      GREATEST(m.category_score, COALESCE(ce.cat_score, 0.0))::FLOAT8 AS category_score,
      (
        -- Base scoring with normalized text rank
        (m.raw_text_rank / mt.val) * 0.35 +
        m.trigram_similarity * 0.25 +
        GREATEST(m.category_score, COALESCE(ce.cat_score, 0.0)) * 0.40 +
        -- Name match boost: quadratic bonus for strong name similarity.
        -- Ensures specific place searches surface the correct place at the
        -- top, while generic queries remain category-dominant.
        CASE
          WHEN m.trigram_similarity >= 0.5
            THEN POWER(m.trigram_similarity, 2) * 0.5
          ELSE 0.0
        END
      )::FLOAT8 AS combined_score
    FROM merged m
    CROSS JOIN max_text mt
    LEFT JOIN category_enrich ce ON m.place_id = ce.place_id
  ),
  deduped AS (
    SELECT DISTINCT ON (place_id)
      place_id, text_rank, trigram_similarity, category_score, combined_score
    FROM scored
    ORDER BY place_id, combined_score DESC
  )
  -- Final join back to full places table (only for the small result set)
  SELECT
    p.id, p.name, p.location,
    p.primary_category, p.categories, p.confidence,
    p.street_address, p.locality, p.region, p.postcode, p.country_code,
    p.phone, p.website, p.email, p.hours, p.price_level, p.rating,
    p.review_count, p.is_verified,
    d.text_rank, d.trigram_similarity, d.category_score, d.combined_score
  FROM deduped d
  JOIN public.places p ON p.id = d.place_id
  WHERE d.combined_score > 0
  ORDER BY d.combined_score DESC, p.rating DESC NULLS LAST
  LIMIT result_limit;
END;
$function$;

COMMENT ON FUNCTION public.search_places_hybrid IS 'Hand-written SQL lane (migration-plan §8.6, A3b). Ported verbatim from the Nhost database; RETURNS TABLE replaces RETURNS SETOF hybrid_search_results (dropped, phantom). See packages/db/migrations/20260909043234_hand_written_sql_lane/migration.sql. SECURITY INVOKER: tier_list_ids must already have been narrowed by services/actors/src/lib/tier-list-visibility.ts.';

--> statement-breakpoint

-- ============================================================================
-- search_places_adaptive_cluster — MapActor (migration-plan §2.4)
--
-- ****************************************************************************
-- `tier_list_ids` IS TAKEN ON TRUST — the caller must sanitise it.
--
-- This function is SECURITY INVOKER (the default; no SECURITY DEFINER clause
-- below) and reads `tier_list_items` directly by `tier_list_id`. It has no way
-- to know who is asking, so it cannot itself check that the caller may see
-- those tier lists.
--
-- Do NOT add authorization logic here. migration-plan §1.6 and §2.4 are
-- explicit that there is no RLS and no in-SQL authorization in the new stack:
-- visibility is enforced in the actor layer. That is where it is enforced —
-- `services/actors/src/lib/tier-list-visibility.ts` narrows the id set to the
-- tier lists the viewer may read before this function is ever called, and
-- returns an empty result rather than a NULL filter when none of them are
-- visible (a NULL filter means "no tier-list filter at all" below, which would
-- widen the query instead of denying it). Every caller of this function and of
-- `search_places_hybrid` must go through it.
-- ****************************************************************************
--
-- Old:  search_places_adaptive_cluster(west_bound double precision, south_bound double precision,
--         east_bound double precision, north_bound double precision,
--         category_filter text[] DEFAULT NULL, min_rating double precision DEFAULT NULL,
--         visit_status_filter text DEFAULT NULL, filter_user_id uuid DEFAULT NULL,
--         result_limit integer DEFAULT 500, tier_list_ids uuid[] DEFAULT NULL)
--       RETURNS SETOF place_search_results
-- New:  same parameter list; RETURNS TABLE(27 columns — see below).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.search_places_adaptive_cluster(
  west_bound double precision,
  south_bound double precision,
  east_bound double precision,
  north_bound double precision,
  category_filter text[] DEFAULT NULL::text[],
  min_rating double precision DEFAULT NULL::double precision,
  visit_status_filter text DEFAULT NULL::text,
  filter_user_id uuid DEFAULT NULL::uuid,
  result_limit integer DEFAULT 500,
  tier_list_ids uuid[] DEFAULT NULL::uuid[]
)
 RETURNS TABLE(
  is_cluster boolean,
  cluster_id integer,
  cluster_count integer,
  cluster_center geography(Point,4326),
  cluster_bounds geometry(Polygon,4326),
  id uuid,
  name text,
  location geography(Point,4326),
  primary_category text,
  categories text[],
  confidence numeric(3,2),
  street_address text,
  locality text,
  region text,
  postcode text,
  country_code character(2),
  phone text,
  website text,
  email text,
  hours jsonb,
  price_level integer,
  rating numeric(2,1),
  review_count integer,
  is_verified boolean,
  viewport_area_km2 double precision,
  density_per_km2 double precision,
  clustering_applied boolean
 )
 LANGUAGE plpgsql
 STABLE
AS $function$
#variable_conflict use_column
DECLARE
  viewport_area_km2_calc FLOAT;
  viewport_max_dim_km FLOAT;
  cluster_distance_meters FLOAT;
  clustering_threshold INTEGER;
  density_factor FLOAT;
  confidence_floor FLOAT;
  total_places INTEGER;
  input_limit INTEGER;
  noise_limit INTEGER;
  scale_factor FLOAT;
  bounded_count INTEGER;
  table_total_estimate FLOAT;
  bbox geometry;
  grid_cells INTEGER;
  per_cell_limit INTEGER;
BEGIN
  -- Pre-compute bounding box to avoid repeated construction
  bbox := ST_MakeEnvelope(west_bound, south_bound, east_bound, north_bound, 4326);

  -- Calculate viewport area in km²
  SELECT ST_Area(bbox::geography) / 1000000 INTO viewport_area_km2_calc;

  -- Calculate viewport max dimension (width vs height) in km
  viewport_max_dim_km := GREATEST(
    ST_Distance(
      ST_SetSRID(ST_MakePoint(west_bound, (north_bound + south_bound) / 2.0), 4326)::geography,
      ST_SetSRID(ST_MakePoint(east_bound, (north_bound + south_bound) / 2.0), 4326)::geography
    ) / 1000.0,
    ST_Distance(
      ST_SetSRID(ST_MakePoint((west_bound + east_bound) / 2.0, south_bound), 4326)::geography,
      ST_SetSRID(ST_MakePoint((west_bound + east_bound) / 2.0, north_bound), 4326)::geography
    ) / 1000.0
  );

  -- ============================================================
  -- Zoom-dependent clustering threshold
  -- At close zoom show individual markers; only cluster when zoomed out
  -- ============================================================
  clustering_threshold := CASE
    WHEN viewport_max_dim_km < 2  THEN 2147483647  -- street level: never cluster
    WHEN viewport_max_dim_km < 5  THEN 100          -- neighborhood: cluster only when dense
    ELSE 20                                          -- city+: cluster at > 20 (unchanged)
  END;

  -- ============================================================
  -- TIER LIST FAST PATH
  -- When tier_list_ids is provided, drive from tier_list_items
  -- (small set, typically 10-100 rows per tier list) instead of
  -- scanning the places table (7M rows). This allows tier list
  -- queries at any zoom level including global view.
  -- ============================================================
  IF tier_list_ids IS NOT NULL THEN

    -- User-curated items: show all regardless of confidence
    confidence_floor := 0;

    -- Tier lists are small; use result_limit directly
    input_limit := result_limit;
    noise_limit := result_limit;

    -- Count matching tier list places.
    -- Skip bounds filter at wide zoom (>10000 km dimension) to show ALL tier list places.
    -- PostGIS geography && operator breaks for envelopes spanning >180° longitude,
    -- and at continental/global zoom showing all tier list places is the right UX.
    -- At local zoom, filter by viewport bounds.
    IF visit_status_filter IS NOT NULL AND filter_user_id IS NOT NULL THEN
      SELECT count(*) INTO bounded_count FROM (
        SELECT 1
        FROM tier_list_items tli
        JOIN places p ON p.id = tli.place_id
        LEFT JOIN user_place_interactions upi
          ON p.id = upi.place_id AND upi.user_id = filter_user_id
        WHERE tli.tier_list_id = ANY(tier_list_ids)
          AND tli.place_id IS NOT NULL
          AND p.is_active = true
          AND (viewport_max_dim_km > 10000 OR p.location && bbox)
          AND (category_filter IS NULL OR p.primary_category = ANY(category_filter))
          AND (min_rating IS NULL OR p.rating >= min_rating)
          AND (visit_status_filter = 'visited' AND upi.is_visited = true
            OR visit_status_filter = 'unvisited' AND (upi.is_visited IS NULL OR upi.is_visited = false))
        LIMIT input_limit + 1
      ) sub;
    ELSE
      SELECT count(*) INTO bounded_count FROM (
        SELECT 1
        FROM tier_list_items tli
        JOIN places p ON p.id = tli.place_id
        WHERE tli.tier_list_id = ANY(tier_list_ids)
          AND tli.place_id IS NOT NULL
          AND p.is_active = true
          AND (viewport_max_dim_km > 10000 OR p.location && bbox)
          AND (category_filter IS NULL OR p.primary_category = ANY(category_filter))
          AND (min_rating IS NULL OR p.rating >= min_rating)
        LIMIT input_limit + 1
      ) sub;
    END IF;

    IF bounded_count = 0 THEN
      RETURN;
    END IF;

    -- Clustering parameters
    total_places := bounded_count;
    scale_factor := 1.0;  -- exact count, no estimation needed
    density_factor := LEAST(1.0, SQRT(bounded_count::float / GREATEST(result_limit, 1)::float));
    -- Viewport-proportional minimum instead of fixed 50m floor
    cluster_distance_meters := GREATEST(
      viewport_max_dim_km * 5,
      LEAST(500000, viewport_max_dim_km * 50 * density_factor)
    );

    IF bounded_count > clustering_threshold THEN
      -- Cluster tier list places using DBSCAN
      RETURN QUERY
      WITH filtered_places AS (
        SELECT
          p.id, p.name, p.location, p.primary_category, p.categories, p.confidence,
          p.street_address, p.locality, p.region, p.postcode, p.country_code,
          p.phone, p.website, p.email, p.hours, p.price_level, p.rating,
          p.review_count, p.is_verified,
          ST_Transform(p.location::geometry, 3857) as geom
        FROM tier_list_items tli
        JOIN places p ON p.id = tli.place_id
        LEFT JOIN user_place_interactions upi
          ON visit_status_filter IS NOT NULL
          AND filter_user_id IS NOT NULL
          AND p.id = upi.place_id
          AND upi.user_id = filter_user_id
        WHERE tli.tier_list_id = ANY(tier_list_ids)
          AND tli.place_id IS NOT NULL
          AND p.is_active = true
          AND (viewport_max_dim_km > 10000 OR p.location && bbox)
          AND (category_filter IS NULL OR p.primary_category = ANY(category_filter))
          AND (min_rating IS NULL OR p.rating >= min_rating)
          AND (visit_status_filter IS NULL OR
               (visit_status_filter = 'visited' AND upi.is_visited = true) OR
               (visit_status_filter = 'unvisited' AND (upi.is_visited IS NULL OR upi.is_visited = false)))
        ORDER BY p.confidence DESC, p.rating DESC NULLS LAST
        LIMIT input_limit
      ),
      clustered_places AS (
        SELECT
          fp.*,
          ST_ClusterDBSCAN(fp.geom, cluster_distance_meters, 2) OVER () as cluster_id_calc
        FROM filtered_places fp
      ),
      cluster_summary AS (
        SELECT
          cluster_id_calc,
          COUNT(*) as place_count,
          ST_Transform(ST_Centroid(ST_Collect(geom)), 4326)::geography(point,4326) as center_point,
          ST_Transform(
            ST_Buffer(ST_ConvexHull(ST_Collect(geom)), GREATEST(cluster_distance_meters * 0.1, 100)),
            4326
          )::geometry(polygon,4326) as bounds,
          AVG(confidence)::numeric(3,2) as avg_confidence,
          AVG(rating)::numeric(2,1) as avg_rating
        FROM clustered_places
        WHERE cluster_id_calc IS NOT NULL
        GROUP BY cluster_id_calc
        HAVING COUNT(*) >= 2
      ),
      single_places AS (
        SELECT cp.* FROM clustered_places cp
        WHERE cp.cluster_id_calc IS NULL
        ORDER BY cp.confidence DESC, cp.rating DESC NULLS LAST
        LIMIT noise_limit
      )
      -- Return clusters
      SELECT
        true::boolean,
        cs.cluster_id_calc::integer,
        ROUND(cs.place_count * scale_factor)::integer,
        cs.center_point::geography(point,4326),
        cs.bounds::geometry(polygon,4326),
        gen_random_uuid(),
        ('🏪 ' || ROUND(cs.place_count * scale_factor) || ' places')::text,
        cs.center_point::geography(point,4326),
        'cluster'::text,
        ARRAY['cluster']::text[],
        cs.avg_confidence,
        NULL::text, NULL::text, NULL::text, NULL::text, NULL::char(2),
        NULL::text, NULL::text, NULL::text, NULL::jsonb, NULL::integer,
        cs.avg_rating, 0::integer, false::boolean,
        viewport_area_km2_calc,
        ROUND(cs.place_count * scale_factor)::float / GREATEST(viewport_area_km2_calc, 1.0),
        true::boolean
      FROM cluster_summary cs

      UNION ALL

      -- Return unclustered places
      SELECT
        false::boolean,
        NULL::integer, NULL::integer,
        NULL::geography(point,4326), NULL::geometry(polygon,4326),
        sp.id, sp.name, sp.location::geography(point,4326),
        sp.primary_category, sp.categories, sp.confidence,
        sp.street_address, sp.locality, sp.region, sp.postcode, sp.country_code,
        sp.phone, sp.website, sp.email, sp.hours, sp.price_level, sp.rating,
        sp.review_count, sp.is_verified,
        viewport_area_km2_calc,
        total_places::float / GREATEST(viewport_area_km2_calc, 1.0),
        true::boolean
      FROM single_places sp;

    ELSE
      -- Return individual places (no clustering needed)
      RETURN QUERY
      SELECT
        false::boolean,
        NULL::integer, NULL::integer,
        NULL::geography(point,4326), NULL::geometry(polygon,4326),
        p.id, p.name, p.location::geography(point,4326),
        p.primary_category, p.categories, p.confidence,
        p.street_address, p.locality, p.region, p.postcode, p.country_code,
        p.phone, p.website, p.email, p.hours, p.price_level, p.rating,
        p.review_count, p.is_verified,
        viewport_area_km2_calc,
        total_places::float / GREATEST(viewport_area_km2_calc, 1.0),
        false::boolean
      FROM tier_list_items tli
      JOIN places p ON p.id = tli.place_id
      LEFT JOIN user_place_interactions upi
        ON visit_status_filter IS NOT NULL
        AND filter_user_id IS NOT NULL
        AND p.id = upi.place_id
        AND upi.user_id = filter_user_id
      WHERE tli.tier_list_id = ANY(tier_list_ids)
        AND tli.place_id IS NOT NULL
        AND p.is_active = true
        AND (viewport_max_dim_km > 10000 OR p.location && bbox)
        AND (category_filter IS NULL OR p.primary_category = ANY(category_filter))
        AND (min_rating IS NULL OR p.rating >= min_rating)
        AND (visit_status_filter IS NULL OR
             (visit_status_filter = 'visited' AND upi.is_visited = true) OR
             (visit_status_filter = 'unvisited' AND (upi.is_visited IS NULL OR upi.is_visited = false)))
      ORDER BY p.confidence DESC, p.rating DESC NULLS LAST
      LIMIT result_limit;
    END IF;

    RETURN;  -- Don't fall through to the non-tier-list code path
  END IF;

  -- ============================================================
  -- STANDARD PATH (no tier list filter)
  -- ============================================================

  -- Skip query entirely at world-view zoom (viewport > 50M km²)
  IF viewport_area_km2_calc > 50000000 THEN
    RETURN;
  END IF;

  -- ============================================================
  -- Progressive confidence floor when filtering by category
  -- ============================================================
  IF category_filter IS NOT NULL THEN
    confidence_floor := GREATEST(0.5, LEAST(0.9,
      0.5 + 0.4 * LEAST(1.0, viewport_area_km2_calc / 100.0)
    ));
  ELSE
    confidence_floor := 0.5;
  END IF;

  -- Input limit scales with viewport but stays manageable
  input_limit := CASE
    WHEN viewport_area_km2_calc > 1000000 THEN result_limit           -- 500 at continent
    WHEN viewport_area_km2_calc > 100000  THEN result_limit * 2       -- 1000 at multi-state
    WHEN viewport_area_km2_calc > 10000   THEN result_limit * 3       -- 1500 at state
    ELSE result_limit * 2                                              -- 1000 at local
  END;

  -- Cap on unclustered/noise points returned
  noise_limit := CASE
    WHEN viewport_area_km2_calc > 100000 THEN 50
    WHEN viewport_area_km2_calc > 10000  THEN 100
    ELSE result_limit
  END;

  -- ============================================================
  -- For small viewports (< 50 km²) skip the count pre-query.
  -- There are few enough rows that clustering math is cheap and
  -- the count scan is wasted I/O.
  -- ============================================================
  IF viewport_area_km2_calc < 50 THEN
    bounded_count := input_limit;
  ELSIF visit_status_filter IS NOT NULL AND filter_user_id IS NOT NULL THEN
    SELECT count(*) INTO bounded_count FROM (
      SELECT 1 FROM places p
      LEFT JOIN user_place_interactions upi ON (p.id = upi.place_id AND upi.user_id = filter_user_id)
      WHERE p.location && bbox
        AND p.is_active = true
        AND p.confidence >= confidence_floor
        AND (category_filter IS NULL OR p.primary_category = ANY(category_filter))
        AND (min_rating IS NULL OR p.rating >= min_rating)
        AND (visit_status_filter = 'visited' AND upi.is_visited = true
          OR visit_status_filter = 'unvisited' AND (upi.is_visited IS NULL OR upi.is_visited = false))
      LIMIT input_limit + 1
    ) sub;
  ELSE
    SELECT count(*) INTO bounded_count FROM (
      SELECT 1 FROM places p
      WHERE p.location && bbox
        AND p.is_active = true
        AND p.confidence >= confidence_floor
        AND (category_filter IS NULL OR p.primary_category = ANY(category_filter))
        AND (min_rating IS NULL OR p.rating >= min_rating)
      LIMIT input_limit + 1
    ) sub;
  END IF;

  -- ============================================================
  -- Estimate total from table stats when over limit
  -- ============================================================
  IF bounded_count > input_limit THEN
    SELECT reltuples INTO table_total_estimate
    FROM pg_class WHERE relname = 'places';

    total_places := GREATEST(
      bounded_count,
      (table_total_estimate * LEAST(1.0, viewport_area_km2_calc / 150000000.0))::integer
    );
  ELSE
    total_places := bounded_count;
  END IF;

  -- Scale factor to estimate true cluster counts from sampled data
  scale_factor := GREATEST(1.0, total_places::float / GREATEST(input_limit, 1)::float);

  -- ============================================================
  -- Density-aware cluster distance using max dimension
  -- Viewport-proportional minimum instead of fixed 50m floor
  -- ============================================================
  density_factor := LEAST(1.0, SQRT(bounded_count::float / GREATEST(result_limit, 1)::float));
  cluster_distance_meters := GREATEST(
    viewport_max_dim_km * 5,
    LEAST(500000, viewport_max_dim_km * 50 * density_factor)
  );

  -- Cluster only when exceeding zoom-dependent threshold
  IF bounded_count > clustering_threshold THEN

    -- Calculate grid dimensions for large viewports
    grid_cells := CASE
      WHEN viewport_area_km2_calc > 100000 THEN 5  -- 5x5 = 25 cells
      ELSE 1                                        -- No grid (single cell = standard query)
    END;
    per_cell_limit := CASE
      WHEN grid_cells > 1 THEN GREATEST(4, input_limit / (grid_cells * grid_cells))
      ELSE input_limit
    END;

    RETURN QUERY
    WITH filtered_places AS (
      SELECT
        p.id, p.name, p.location, p.primary_category, p.categories, p.confidence,
        p.street_address, p.locality, p.region, p.postcode, p.country_code,
        p.phone, p.website, p.email, p.hours, p.price_level, p.rating,
        p.review_count, p.is_verified,
        ST_Transform(p.location::geometry, 3857) as geom
      FROM generate_series(0, grid_cells - 1) gx
      CROSS JOIN generate_series(0, grid_cells - 1) gy
      CROSS JOIN LATERAL (
        SELECT
          p2.id, p2.name, p2.location, p2.primary_category, p2.categories, p2.confidence,
          p2.street_address, p2.locality, p2.region, p2.postcode, p2.country_code,
          p2.phone, p2.website, p2.email, p2.hours, p2.price_level, p2.rating,
          p2.review_count, p2.is_verified
        FROM places p2
        LEFT JOIN user_place_interactions upi
          ON visit_status_filter IS NOT NULL
          AND filter_user_id IS NOT NULL
          AND p2.id = upi.place_id
          AND upi.user_id = filter_user_id
        WHERE p2.location && ST_MakeEnvelope(
          west_bound  + (east_bound - west_bound) * gx::float / grid_cells,
          south_bound + (north_bound - south_bound) * gy::float / grid_cells,
          west_bound  + (east_bound - west_bound) * (gx + 1)::float / grid_cells,
          south_bound + (north_bound - south_bound) * (gy + 1)::float / grid_cells,
          4326
        )
          AND p2.is_active = true
          AND p2.confidence >= confidence_floor
          AND (category_filter IS NULL OR p2.primary_category = ANY(category_filter))
          AND (min_rating IS NULL OR p2.rating >= min_rating)
          AND (visit_status_filter IS NULL OR
               (visit_status_filter = 'visited' AND upi.is_visited = true) OR
               (visit_status_filter = 'unvisited' AND (upi.is_visited IS NULL OR upi.is_visited = false)))
        ORDER BY
          CASE WHEN grid_cells = 1 THEN p2.confidence ELSE NULL END DESC,
          CASE WHEN grid_cells = 1 THEN p2.rating ELSE NULL END DESC NULLS LAST
        LIMIT per_cell_limit
      ) p
    ),
    clustered_places AS (
      SELECT
        fp.*,
        ST_ClusterDBSCAN(fp.geom, cluster_distance_meters, 2) OVER () as cluster_id_calc
      FROM filtered_places fp
    ),
    cluster_summary AS (
      SELECT
        cluster_id_calc,
        COUNT(*) as place_count,
        ST_Transform(ST_Centroid(ST_Collect(geom)), 4326)::geography(point,4326) as center_point,
        ST_Transform(
          ST_Buffer(ST_ConvexHull(ST_Collect(geom)), GREATEST(cluster_distance_meters * 0.1, 100)),
          4326
        )::geometry(polygon,4326) as bounds,
        AVG(confidence)::numeric(3,2) as avg_confidence,
        AVG(rating)::numeric(2,1) as avg_rating
      FROM clustered_places
      WHERE cluster_id_calc IS NOT NULL
      GROUP BY cluster_id_calc
      HAVING COUNT(*) >= 2
    ),
    single_places AS (
      SELECT cp.* FROM clustered_places cp
      WHERE cp.cluster_id_calc IS NULL
      ORDER BY cp.confidence DESC, cp.rating DESC NULLS LAST
      LIMIT noise_limit
    )
    -- Return clusters with estimated true counts
    SELECT
      true::boolean,
      cs.cluster_id_calc::integer,
      ROUND(cs.place_count * scale_factor)::integer,
      cs.center_point::geography(point,4326),
      cs.bounds::geometry(polygon,4326),
      gen_random_uuid(),
      ('🏪 ' || ROUND(cs.place_count * scale_factor) || ' places')::text,
      cs.center_point::geography(point,4326),
      'cluster'::text,
      ARRAY['cluster']::text[],
      cs.avg_confidence,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::char(2),
      NULL::text, NULL::text, NULL::text, NULL::jsonb, NULL::integer,
      cs.avg_rating, 0::integer, false::boolean,
      viewport_area_km2_calc,
      ROUND(cs.place_count * scale_factor)::float / GREATEST(viewport_area_km2_calc, 1.0),
      true::boolean
    FROM cluster_summary cs

    UNION ALL

    SELECT
      false::boolean,
      NULL::integer, NULL::integer,
      NULL::geography(point,4326), NULL::geometry(polygon,4326),
      sp.id, sp.name, sp.location::geography(point,4326),
      sp.primary_category, sp.categories, sp.confidence,
      sp.street_address, sp.locality, sp.region, sp.postcode, sp.country_code,
      sp.phone, sp.website, sp.email, sp.hours, sp.price_level, sp.rating,
      sp.review_count, sp.is_verified,
      viewport_area_km2_calc,
      total_places::float / GREATEST(viewport_area_km2_calc, 1.0),
      true::boolean
    FROM single_places sp;

  ELSE
    -- Return individual places when count is low or zoom is close
    RETURN QUERY
    SELECT
      false::boolean,
      NULL::integer, NULL::integer,
      NULL::geography(point,4326), NULL::geometry(polygon,4326),
      p.id, p.name, p.location::geography(point,4326),
      p.primary_category, p.categories, p.confidence,
      p.street_address, p.locality, p.region, p.postcode, p.country_code,
      p.phone, p.website, p.email, p.hours, p.price_level, p.rating,
      p.review_count, p.is_verified,
      viewport_area_km2_calc, total_places::float / GREATEST(viewport_area_km2_calc, 1.0),
      false::boolean
    FROM places p
    LEFT JOIN user_place_interactions upi
      ON visit_status_filter IS NOT NULL
      AND filter_user_id IS NOT NULL
      AND p.id = upi.place_id
      AND upi.user_id = filter_user_id
    WHERE p.location && bbox
      AND p.is_active = true
      AND p.confidence >= confidence_floor
      AND (category_filter IS NULL OR p.primary_category = ANY(category_filter))
      AND (min_rating IS NULL OR p.rating >= min_rating)
      AND (visit_status_filter IS NULL OR
           (visit_status_filter = 'visited' AND upi.is_visited = true) OR
           (visit_status_filter = 'unvisited' AND (upi.is_visited IS NULL OR upi.is_visited = false)))
    ORDER BY p.confidence DESC, p.rating DESC NULLS LAST
    LIMIT result_limit;
  END IF;

END;
$function$;

COMMENT ON FUNCTION public.search_places_adaptive_cluster IS 'Hand-written SQL lane (migration-plan §8.6, A3b). SECURITY INVOKER: it reads tier_list_items by id and cannot tell who is asking, so tier_list_ids must already have been narrowed to the viewer''s visible lists by services/actors/src/lib/tier-list-visibility.ts. Same contract as search_places_hybrid.';

--> statement-breakpoint

-- ============================================================================
-- search_category_vectors — CategoryVectorsActor (migration-plan §2.1, §2.3)
--
-- Old:  search_category_vectors(query_vector halfvec, max_distance double precision DEFAULT 0.8,
--         result_limit integer DEFAULT 15)
--       RETURNS SETOF search_category_vectors_results
-- New:  same parameter list; RETURNS TABLE(6 columns).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.search_category_vectors(
  query_vector halfvec,
  max_distance double precision DEFAULT 0.8,
  result_limit integer DEFAULT 15
)
 RETURNS TABLE(
  id integer,
  label text,
  label_type text,
  associated_categories text[],
  metadata jsonb,
  distance double precision
 )
 LANGUAGE plpgsql
 STABLE
AS $function$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  SELECT
    cv.id,
    cv.label,
    cv.label_type,
    cv.associated_categories,
    cv.metadata,
    (cv.vector <=> query_vector)::FLOAT8 AS distance
  FROM public.category_vectors cv
  WHERE (cv.vector <=> query_vector) <= max_distance
  ORDER BY cv.vector <=> query_vector
  LIMIT result_limit;
END;
$function$;

COMMENT ON FUNCTION public.search_category_vectors IS 'Hand-written SQL lane (migration-plan §8.6, A3b). Ported verbatim from the Nhost database; RETURNS TABLE replaces RETURNS SETOF search_category_vectors_results (dropped, phantom).';

--> statement-breakpoint

-- ============================================================================
-- find_duplicate_places — DuplicatePlaceSearchActor (migration-plan §2.3)
--
-- Old:  find_duplicate_places(place_name text, place_lat double precision, place_lng double precision,
--         search_radius_m double precision DEFAULT 200, min_similarity double precision DEFAULT 0.3,
--         result_limit integer DEFAULT 5)
--       RETURNS SETOF duplicate_place_results
-- New:  same parameter list; RETURNS TABLE(8 columns).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.find_duplicate_places(
  place_name text,
  place_lat double precision,
  place_lng double precision,
  search_radius_m double precision DEFAULT 200,
  min_similarity double precision DEFAULT 0.3,
  result_limit integer DEFAULT 5
)
 RETURNS TABLE(
  id uuid,
  name text,
  primary_category text,
  location geography(Point,4326),
  street_address text,
  locality text,
  similarity real,
  distance_m double precision
 )
 LANGUAGE plpgsql
 STABLE
AS $function$
#variable_conflict use_column
DECLARE
  search_point GEOGRAPHY;
BEGIN
  -- Create geography point from lat/lng
  search_point := ST_SetSRID(ST_MakePoint(place_lng, place_lat), 4326)::GEOGRAPHY;

  -- Return places within radius, ordered by similarity and distance
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.primary_category,
    p.location,
    p.street_address,
    p.locality,
    SIMILARITY(p.name, place_name) AS similarity,
    ST_Distance(p.location, search_point) AS distance_m
  FROM public.places p
  WHERE
    p.is_active = true
    AND ST_DWithin(p.location, search_point, search_radius_m)
    AND SIMILARITY(p.name, place_name) >= min_similarity
  ORDER BY
    similarity DESC,
    distance_m ASC
  LIMIT result_limit;
END;
$function$;

COMMENT ON FUNCTION public.find_duplicate_places IS 'Hand-written SQL lane (migration-plan §8.6, A3b). Ported verbatim from the Nhost database; RETURNS TABLE replaces RETURNS SETOF duplicate_place_results (dropped, phantom).';

--> statement-breakpoint

-- Down (manual — the drizzle-kit custom lane has no automatic down-migration
-- runner; this documents the reverse for a manual rollback, matching
-- migration-plan §8.6's "every hand-written migration has a matching down"):
--
-- DROP FUNCTION IF EXISTS public.search_places_hybrid(text, text[], double precision[], double precision, double precision, double precision, double precision, double precision, integer, uuid[], text[]);
-- DROP FUNCTION IF EXISTS public.search_places_adaptive_cluster(double precision, double precision, double precision, double precision, text[], double precision, text, uuid, integer, uuid[]);
-- DROP FUNCTION IF EXISTS public.search_category_vectors(halfvec, double precision, integer);
-- DROP FUNCTION IF EXISTS public.find_duplicate_places(text, double precision, double precision, double precision, double precision, integer);
