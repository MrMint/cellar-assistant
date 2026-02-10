-- REVERTED: Role-level statement timeout was too blunt — it caused DDL
-- migrations to fail and doesn't allow per-query granularity.
-- The timeout is now reset (undone by migration 1770656365000).
-- This migration is kept as a no-op so Hasura's migration history stays consistent.
SELECT 1;
