ALTER TABLE public.onboarding_reprocess_jobs
  ADD COLUMN skip_reasons jsonb NOT NULL DEFAULT '{}'::jsonb;
