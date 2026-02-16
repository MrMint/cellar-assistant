CREATE TABLE api_budget_config (
  service text NOT NULL,
  monthly_budget_cents integer NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (service)
);

INSERT INTO api_budget_config (service, monthly_budget_cents, is_enabled) VALUES
  ('google_places', 20000, true);

CREATE TABLE api_usage_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  service text NOT NULL,
  endpoint text NOT NULL,
  estimated_cost_cents integer NOT NULL,
  entity_id uuid,
  entity_type text,
  triggered_by uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE INDEX idx_api_usage_log_created_at ON api_usage_log (created_at);
CREATE INDEX idx_api_usage_log_service_created ON api_usage_log (service, created_at);
