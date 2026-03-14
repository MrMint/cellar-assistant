-- Reverse Part B: Drop onboarding_reprocess_jobs table
DROP TABLE public.onboarding_reprocess_jobs;

-- Reverse Part A: Remove ai_model and confidence columns from item_onboardings
ALTER TABLE public.item_onboardings
  DROP COLUMN ai_model,
  DROP COLUMN confidence;
