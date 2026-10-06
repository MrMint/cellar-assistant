-- Exact row count for every ordinary table in the schemas the cutover touches.
--
-- Emitted as `schema.table|count`, sorted, so `diff` can compare a source
-- snapshot with a target snapshot. `pg_stat_user_tables.n_live_tup` is NOT used:
-- it is an estimate, and on the local Nhost database it reads 0 for tables that
-- demonstrably hold rows.
--
-- `query_to_xml` runs the count as a scalar subquery per table, which keeps this
-- one statement rather than a DO block that cannot return a result set.
SELECT n.nspname || '.' || c.relname AS "table",
       (xpath(
          '/row/cnt/text()',
          query_to_xml(
            format('SELECT count(*) AS cnt FROM %I.%I', n.nspname, c.relname),
            false, true, '')
        ))[1]::text::bigint AS rows
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE c.relkind = 'r'
   AND n.nspname IN ('public', 'auth', 'storage', 'admin')
   -- PostGIS ships ~8500 SRID rows; it is infrastructure, not application data.
   AND c.relname <> 'spatial_ref_sys'
 ORDER BY 1;
