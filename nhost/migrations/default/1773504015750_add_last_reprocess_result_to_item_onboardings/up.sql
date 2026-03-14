ALTER TABLE public.item_onboardings
  ADD COLUMN last_reprocess_result jsonb NULL DEFAULT NULL;

COMMENT ON COLUMN public.item_onboardings.last_reprocess_result
  IS 'Stores the outcome of the last reprocess attempt. Example: {"status": "skipped", "reason": "confidence_regression", "detail": "0.70 → 0.45", "job_id": "...", "at": "2026-03-14T..."}';
