-- Add google_place_id column to places table
ALTER TABLE public.places ADD COLUMN google_place_id text;
CREATE UNIQUE INDEX idx_places_google_place_id ON public.places (google_place_id) WHERE google_place_id IS NOT NULL;

-- Create place_google_enrichments table
CREATE TABLE public.place_google_enrichments (
  place_id uuid NOT NULL,
  google_place_id text NOT NULL,
  google_name text,
  google_formatted_address text,
  google_rating real,
  google_user_ratings_total integer,
  google_price_level integer,
  google_website text,
  google_phone text,
  google_opening_hours jsonb,
  google_types text[],
  google_business_status text,
  google_editorial_summary text,
  photo_references jsonb DEFAULT '[]'::jsonb,
  attributions jsonb DEFAULT '[]'::jsonb,
  resolved_via text NOT NULL,
  details_fetched_at timestamptz,
  photos_fetched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (place_id),
  CONSTRAINT place_google_enrichments_place_id_fkey
    FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE,
  CONSTRAINT place_google_enrichments_resolved_via_check
    CHECK (resolved_via = ANY (ARRAY['nearby_search', 'autocomplete', 'text_search']))
);

CREATE UNIQUE INDEX unique_google_place_id ON public.place_google_enrichments (google_place_id);
CREATE INDEX idx_pge_google_place_id ON public.place_google_enrichments (google_place_id);
CREATE INDEX idx_pge_details_fetched_at ON public.place_google_enrichments (details_fetched_at);

CREATE TRIGGER set_place_google_enrichments_updated_at
  BEFORE UPDATE ON public.place_google_enrichments
  FOR EACH ROW EXECUTE FUNCTION set_current_timestamp_updated_at();

-- Create place_google_photos table
CREATE TABLE public.place_google_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL,
  google_photo_name text NOT NULL,
  storage_file_id uuid,
  width integer,
  height integer,
  attributions jsonb NOT NULL DEFAULT '[]'::jsonb,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT place_google_photos_place_id_fkey
    FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE,
  CONSTRAINT place_google_photos_storage_file_id_fkey
    FOREIGN KEY (storage_file_id) REFERENCES storage.files(id)
);

CREATE UNIQUE INDEX unique_place_photo ON public.place_google_photos (place_id, google_photo_name);
CREATE INDEX idx_pgp_place_id ON public.place_google_photos (place_id);
