-- Part A: Add ai_model and confidence columns to item_onboardings
ALTER TABLE public.item_onboardings
  ADD COLUMN ai_model text,
  ADD COLUMN confidence float;

-- Part B: Create onboarding_reprocess_jobs table
CREATE TABLE public.onboarding_reprocess_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed', 'cancelled')),
  cursor text,
  filter_ai_model text,
  total_processed integer NOT NULL DEFAULT 0,
  total_updated integer NOT NULL DEFAULT 0,
  total_skipped integer NOT NULL DEFAULT 0,
  total_batches integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
