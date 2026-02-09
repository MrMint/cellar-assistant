-- Set a 10-second statement timeout on the nhost_hasura role.
-- This caps all queries Hasura runs on behalf of users, preventing
-- runaway map/search queries from exhausting PostgreSQL shared memory.
-- Admin and maintenance operations use different roles and are unaffected.
ALTER ROLE nhost_hasura SET statement_timeout = '10s';
