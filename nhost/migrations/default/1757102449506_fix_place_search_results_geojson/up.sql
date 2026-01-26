-- Create new type with text-based geometry fields
DROP TYPE IF EXISTS place_search_results_new CASCADE;

CREATE TYPE place_search_results_new AS (
  is_cluster boolean,
  cluster_id integer,
  cluster_count integer,
  cluster_center text, -- GeoJSON text instead of geography
  cluster_bounds text, -- GeoJSON text instead of geometry
  id uuid,
  name text,
  location text, -- GeoJSON text instead of geography
  primary_category text,
  categories text[],
  confidence numeric(3,2),
  street_address text,
  locality text,
  region text,
  postcode text,
  country_code char(2),
  phone text,
  website text,
  email text,
  hours jsonb,
  price_level integer,
  rating numeric(2,1),
  review_count integer,
  is_verified boolean,
  viewport_area_km2 float8,
  density_per_km2 float8,
  clustering_applied boolean
);
