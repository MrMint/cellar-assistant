CREATE TRIGGER set_public_place_refresh_jobs_updated_at
  BEFORE UPDATE ON public.place_refresh_jobs
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_current_timestamp_updated_at();
