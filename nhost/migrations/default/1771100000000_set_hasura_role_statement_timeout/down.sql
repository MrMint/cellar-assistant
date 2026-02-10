-- Remove the statement timeout from the nhost_hasura role (revert to default: no limit)
ALTER ROLE nhost_hasura RESET statement_timeout;
