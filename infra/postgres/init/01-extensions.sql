-- Runs once, on an empty data directory, as the superuser.
-- target-stack.md §1: postgis, pgvector, pg_trgm, pgcrypto. No RLS.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
