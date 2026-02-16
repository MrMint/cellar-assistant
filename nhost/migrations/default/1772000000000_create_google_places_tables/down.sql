DROP TABLE IF EXISTS public.place_google_photos;
DROP TABLE IF EXISTS public.place_google_enrichments;
DROP INDEX IF EXISTS idx_places_google_place_id;
ALTER TABLE public.places DROP COLUMN IF EXISTS google_place_id;
