DELETE FROM api_budget_config WHERE service = 'google_places';
ALTER TABLE api_budget_config DROP CONSTRAINT api_budget_config_pkey;
ALTER TABLE api_budget_config DROP COLUMN endpoint;
ALTER TABLE api_budget_config DROP COLUMN free_tier_monthly_requests;
ALTER TABLE api_budget_config ADD PRIMARY KEY (service);
INSERT INTO api_budget_config (service, monthly_budget_cents, is_enabled) VALUES ('google_places', 20000, true);
