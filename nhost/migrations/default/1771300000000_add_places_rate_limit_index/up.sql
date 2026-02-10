-- Composite index for rate limiting user-created places.
-- Supports the query: WHERE created_by = $userId AND created_at >= $since
CREATE INDEX IF NOT EXISTS idx_places_created_by_created_at
  ON public.places (created_by, created_at DESC);
