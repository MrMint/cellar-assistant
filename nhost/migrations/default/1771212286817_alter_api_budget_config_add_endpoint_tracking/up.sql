ALTER TABLE api_budget_config ADD COLUMN endpoint text NOT NULL DEFAULT '';
ALTER TABLE api_budget_config ADD COLUMN free_tier_monthly_requests integer NOT NULL DEFAULT 0;
ALTER TABLE api_budget_config DROP CONSTRAINT api_budget_config_pkey;
ALTER TABLE api_budget_config ADD PRIMARY KEY (service, endpoint);
DELETE FROM api_budget_config WHERE service = 'google_places' AND endpoint = '';
-- Active SKUs (used by our code)
INSERT INTO api_budget_config (service, endpoint, monthly_budget_cents, is_enabled, free_tier_monthly_requests) VALUES
  ('google_places', 'autocomplete', 0, true, 10000),
  ('google_places', 'nearby_search', 0, true, 5000),
  ('google_places', 'text_search', 0, true, 5000),
  ('google_places', 'place_details', 0, true, 1000),
  ('google_places', 'photo', 0, true, 1000);
-- Reference SKUs (all other Google Places API tiers, not currently used)
-- 999999999 = unlimited free tier
INSERT INTO api_budget_config (service, endpoint, monthly_budget_cents, is_enabled, free_tier_monthly_requests) VALUES
  ('google_places', 'autocomplete_session', 0, true, 999999999),
  ('google_places', 'place_details_essentials_ids_only', 0, true, 999999999),
  ('google_places', 'place_details_essentials', 0, true, 10000),
  ('google_places', 'place_details_pro', 0, true, 5000),
  ('google_places', 'place_details_enterprise', 0, true, 1000),
  ('google_places', 'nearby_search_enterprise', 0, true, 1000),
  ('google_places', 'nearby_search_enterprise_atmosphere', 0, true, 1000),
  ('google_places', 'text_search_enterprise', 0, true, 1000),
  ('google_places', 'text_search_essentials_ids_only', 0, true, 999999999),
  ('google_places', 'text_search_enterprise_atmosphere', 0, true, 1000);
