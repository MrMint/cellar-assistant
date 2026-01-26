-- Consolidated migration for place features
-- This combines all place-related schema changes from the feature branch

-- Install PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create places table for map feature
CREATE TABLE IF NOT EXISTS public.places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  overture_id TEXT UNIQUE NOT NULL,
  
  -- Core place data
  name TEXT NOT NULL,
  display_name TEXT,
  categories TEXT[] NOT NULL,
  primary_category TEXT,
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  
  -- Address components
  street_address TEXT,
  locality TEXT,
  region TEXT,
  postcode TEXT,
  country_code CHAR(2),
  
  -- Contact info
  phone TEXT,
  website TEXT,
  email TEXT,
  
  -- Business info
  hours JSONB,
  price_level INTEGER CHECK (price_level >= 1 AND price_level <= 4),
  rating NUMERIC(2,1) CHECK (rating >= 0 AND rating <= 5),
  review_count INTEGER DEFAULT 0,
  
  -- Usage tracking (why this place is cached)
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  first_cached_reason TEXT, -- 'view', 'favorite', 'menu_scan', etc.
  
  -- Metadata
  source_tags JSONB,
  is_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ
);

-- Add primary_category as a generated column after table creation
-- Drop the regular column and recreate as generated
ALTER TABLE public.places DROP COLUMN IF EXISTS primary_category;
ALTER TABLE public.places ADD COLUMN primary_category TEXT GENERATED ALWAYS AS (categories[1]) STORED;

-- Essential indexes for places table
CREATE INDEX IF NOT EXISTS idx_places_location ON public.places USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_places_categories ON public.places USING GIN(categories);
CREATE INDEX IF NOT EXISTS idx_places_primary_category ON public.places(primary_category);
CREATE INDEX IF NOT EXISTS idx_places_confidence ON public.places(confidence) WHERE confidence > 0.9;
CREATE INDEX IF NOT EXISTS idx_places_locality ON public.places(locality);
CREATE INDEX IF NOT EXISTS idx_places_active ON public.places(is_active) WHERE is_active = true;

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for places table
DROP TRIGGER IF EXISTS set_places_updated_at ON public.places;
CREATE TRIGGER set_places_updated_at
  BEFORE UPDATE ON public.places
  FOR EACH ROW
  EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Create place_menus table for discovered menus
CREATE TABLE IF NOT EXISTS public.place_menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  
  -- Menu data
  menu_data JSONB NOT NULL,
  menu_type TEXT CHECK (menu_type IN ('food', 'drinks', 'wine', 'beer', 'cocktails', 'coffee')),
  
  -- Discovery metadata
  source TEXT NOT NULL CHECK (source IN ('web_scrape', 'api', 'user_upload', 'ai_generated', 'camera_scan')),
  source_url TEXT,
  discovery_method TEXT,
  confidence_score NUMERIC(3,2),
  
  -- Versioning
  version INTEGER DEFAULT 1,
  is_current BOOLEAN DEFAULT true,
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  
  -- User tracking
  created_by UUID REFERENCES auth.users(id),
  verified_by UUID REFERENCES auth.users(id),
  
  -- Timestamps
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create menu_scans table for camera-based menu scanning
CREATE TABLE IF NOT EXISTS public.menu_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id UUID REFERENCES public.places(id) ON DELETE SET NULL,
  
  -- Image data
  original_image_id UUID NOT NULL REFERENCES storage.files(id),
  processed_image_id UUID REFERENCES storage.files(id),
  
  -- OCR and processing results
  extracted_text TEXT,
  processing_status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  processing_error TEXT,
  confidence_score NUMERIC(3,2),
  
  -- Location context
  scan_location GEOGRAPHY(POINT, 4326),
  estimated_place_id UUID REFERENCES public.places(id),
  manual_place_override UUID REFERENCES public.places(id),
  
  -- Processing metadata
  processing_model TEXT,
  processing_duration_ms INTEGER,
  items_detected INTEGER DEFAULT 0,
  items_matched INTEGER DEFAULT 0,
  
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create place_menu_items table for individual menu items
CREATE TABLE IF NOT EXISTS public.place_menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_menu_id UUID REFERENCES public.place_menus(id) ON DELETE CASCADE,
  menu_scan_id UUID REFERENCES public.menu_scans(id) ON DELETE CASCADE,
  place_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  
  -- Menu item details
  menu_item_name TEXT NOT NULL,
  menu_item_description TEXT,
  menu_item_price MONEY,
  menu_category TEXT,
  
  -- Item type detection and matching
  detected_item_type TEXT CHECK (detected_item_type IN ('wine', 'beer', 'spirit', 'coffee', 'unknown')),
  confidence_score NUMERIC(3,2),
  extracted_attributes JSONB,
  
  -- Links to existing items
  wine_id UUID REFERENCES public.wines(id) ON DELETE SET NULL,
  beer_id UUID REFERENCES public.beers(id) ON DELETE SET NULL,
  spirit_id UUID REFERENCES public.spirits(id) ON DELETE SET NULL,
  coffee_id UUID REFERENCES public.coffees(id) ON DELETE SET NULL,
  
  -- User interactions
  match_verified_by UUID REFERENCES auth.users(id),
  match_verified_at TIMESTAMPTZ,
  
  -- Metadata
  is_available BOOLEAN DEFAULT true,
  seasonal BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure only one item type is linked
  CONSTRAINT check_single_item_type CHECK (
    num_nonnulls(wine_id, beer_id, spirit_id, coffee_id) <= 1
  ),
  
  -- Ensure either menu or scan source
  CONSTRAINT check_menu_or_scan_source CHECK (
    num_nonnulls(place_menu_id, menu_scan_id) = 1
  )
);

-- Create item_match_suggestions table for AI suggestions
CREATE TABLE IF NOT EXISTS public.item_match_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_menu_item_id UUID NOT NULL REFERENCES public.place_menu_items(id) ON DELETE CASCADE,
  
  -- Suggested match
  suggested_wine_id UUID REFERENCES public.wines(id),
  suggested_beer_id UUID REFERENCES public.beers(id),
  suggested_spirit_id UUID REFERENCES public.spirits(id),
  suggested_coffee_id UUID REFERENCES public.coffees(id),
  
  -- Match quality
  confidence_score NUMERIC(3,2) NOT NULL,
  match_reasoning TEXT,
  similarity_metrics JSONB,
  
  -- User actions
  accepted BOOLEAN,
  rejected BOOLEAN,
  acted_by UUID REFERENCES auth.users(id),
  acted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT check_single_suggestion CHECK (
    num_nonnulls(suggested_wine_id, suggested_beer_id, suggested_spirit_id, suggested_coffee_id) = 1
  )
);

-- Create user_place_interactions table for user favorites, visits, etc.
CREATE TABLE IF NOT EXISTS public.user_place_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  
  -- Interaction types
  is_favorite BOOLEAN DEFAULT false,
  is_visited BOOLEAN DEFAULT false,
  want_to_visit BOOLEAN DEFAULT false,
  
  -- User data
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  notes TEXT,
  tags TEXT[],
  
  -- Visit tracking
  last_visited_at TIMESTAMPTZ,
  visit_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one interaction per user/place
  CONSTRAINT unique_user_place UNIQUE(user_id, place_id)
);

-- Add source tracking to cellar_items table
ALTER TABLE public.cellar_items ADD COLUMN IF NOT EXISTS source_type text CHECK (source_type IN ('manual', 'menu_discovery', 'menu_scan', 'import'));
ALTER TABLE public.cellar_items ADD COLUMN IF NOT EXISTS source_place_id uuid REFERENCES public.places(id) ON DELETE SET NULL;
ALTER TABLE public.cellar_items ADD COLUMN IF NOT EXISTS source_menu_item_id uuid REFERENCES public.place_menu_items(id) ON DELETE SET NULL;

-- Indexes for place_menus
CREATE INDEX IF NOT EXISTS idx_place_menus_place_id ON public.place_menus(place_id);
CREATE INDEX IF NOT EXISTS idx_place_menus_current ON public.place_menus(place_id, is_current) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_place_menus_type ON public.place_menus(menu_type);

-- Unique constraint for current menus
DROP INDEX IF EXISTS idx_place_menus_current_unique;
CREATE UNIQUE INDEX idx_place_menus_current_unique 
  ON public.place_menus(place_id, menu_type) 
  WHERE is_current = true;

-- Indexes for menu_scans
CREATE INDEX IF NOT EXISTS idx_menu_scans_location ON public.menu_scans USING GIST(scan_location);
CREATE INDEX IF NOT EXISTS idx_menu_scans_user ON public.menu_scans(user_id);
CREATE INDEX IF NOT EXISTS idx_menu_scans_status ON public.menu_scans(processing_status);

-- Indexes for place_menu_items
CREATE INDEX IF NOT EXISTS idx_place_menu_items_place ON public.place_menu_items(place_id);
CREATE INDEX IF NOT EXISTS idx_place_menu_items_menu ON public.place_menu_items(place_menu_id);
CREATE INDEX IF NOT EXISTS idx_place_menu_items_scan ON public.place_menu_items(menu_scan_id);
CREATE INDEX IF NOT EXISTS idx_place_menu_items_type ON public.place_menu_items(detected_item_type);
CREATE INDEX IF NOT EXISTS idx_place_menu_items_unmatched ON public.place_menu_items(wine_id, beer_id, spirit_id, coffee_id) 
  WHERE wine_id IS NULL AND beer_id IS NULL AND spirit_id IS NULL AND coffee_id IS NULL;

-- Indexes for item_match_suggestions
CREATE INDEX IF NOT EXISTS idx_match_suggestions_pending ON public.item_match_suggestions(place_menu_item_id)
  WHERE accepted IS NULL AND rejected IS NULL;

-- Indexes for user_place_interactions
CREATE INDEX IF NOT EXISTS idx_user_place_interactions_user ON public.user_place_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_place_interactions_place ON public.user_place_interactions(place_id);
CREATE INDEX IF NOT EXISTS idx_user_place_interactions_favorites ON public.user_place_interactions(user_id, is_favorite) 
  WHERE is_favorite = true;
CREATE INDEX IF NOT EXISTS idx_user_place_interactions_visited ON public.user_place_interactions(user_id, is_visited) 
  WHERE is_visited = true;
CREATE INDEX IF NOT EXISTS idx_user_place_interactions_want_to_visit ON public.user_place_interactions(user_id, want_to_visit) 
  WHERE want_to_visit = true;

-- Create triggers for updated_at columns
DROP TRIGGER IF EXISTS set_place_menus_updated_at ON public.place_menus;
CREATE TRIGGER set_place_menus_updated_at
  BEFORE UPDATE ON public.place_menus
  FOR EACH ROW
  EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_menu_scans_updated_at ON public.menu_scans;
CREATE TRIGGER set_menu_scans_updated_at
  BEFORE UPDATE ON public.menu_scans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_place_menu_items_updated_at ON public.place_menu_items;
CREATE TRIGGER set_place_menu_items_updated_at
  BEFORE UPDATE ON public.place_menu_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_user_place_interactions_updated_at ON public.user_place_interactions;
CREATE TRIGGER set_user_place_interactions_updated_at
  BEFORE UPDATE ON public.user_place_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Create spatial functions for PostGIS operations with Hasura
CREATE OR REPLACE FUNCTION public.places_within_distance(
    place_location geography,
    center_point geography,
    distance_meters integer
) RETURNS boolean AS $$
BEGIN
    RETURN ST_DWithin(place_location, center_point, distance_meters);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.places_distance(
    place_location geography,
    center_point geography
) RETURNS numeric AS $$
BEGIN
    RETURN ST_Distance(place_location, center_point);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create spatial search and utility functions
CREATE OR REPLACE FUNCTION public.search_cached_places_nearby(
  user_location GEOGRAPHY,
  radius_meters INTEGER DEFAULT 5000,
  category_filter TEXT[] DEFAULT NULL,
  limit_count INTEGER DEFAULT 50
)
RETURNS SETOF public.places AS $$
BEGIN
  RETURN QUERY
  SELECT p.*
  FROM public.places p
  WHERE 
    ST_DWithin(p.location, user_location, radius_meters)
    AND p.is_active = true
    AND (category_filter IS NULL OR p.categories && category_filter)
  ORDER BY 
    p.last_accessed_at DESC NULLS LAST,
    ST_Distance(p.location, user_location)
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.calculate_distance(
  place_row public.places,
  user_location GEOGRAPHY
)
RETURNS NUMERIC AS $$
BEGIN
  RETURN ST_Distance(place_row.location, user_location);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.get_places_in_bounds(
  sw_lat NUMERIC,
  sw_lng NUMERIC,
  ne_lat NUMERIC,
  ne_lng NUMERIC,
  category_filter TEXT[] DEFAULT NULL,
  limit_count INTEGER DEFAULT 200
)
RETURNS SETOF public.places AS $$
DECLARE
  bounds_geom GEOMETRY;
BEGIN
  -- Create bounding box geometry
  bounds_geom := ST_MakeEnvelope(sw_lng, sw_lat, ne_lng, ne_lat, 4326);
  
  RETURN QUERY
  SELECT p.*
  FROM public.places p
  WHERE 
    ST_Within(p.location::geometry, bounds_geom)
    AND p.is_active = true
    AND (category_filter IS NULL OR p.categories && category_filter)
  ORDER BY p.confidence DESC, p.last_accessed_at DESC NULLS LAST
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.update_place_access(
  place_id UUID,
  access_reason TEXT DEFAULT 'view'
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.places 
  SET 
    access_count = COALESCE(access_count, 0) + 1,
    last_accessed_at = NOW(),
    first_cached_reason = COALESCE(first_cached_reason, access_reason)
  WHERE id = place_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.get_user_favorite_places(
  user_id_param UUID,
  limit_count INTEGER DEFAULT 50
)
RETURNS TABLE(
  place public.places,
  interaction public.user_place_interactions
) AS $$
BEGIN
  RETURN QUERY
  SELECT p, upi
  FROM public.places p
  INNER JOIN public.user_place_interactions upi ON p.id = upi.place_id
  WHERE upi.user_id = user_id_param AND upi.is_favorite = true
  ORDER BY upi.updated_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;