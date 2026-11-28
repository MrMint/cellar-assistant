import { defineConfig } from "drizzle-kit";

/**
 * Drizzle config for the application database (migration-plan §6 A3).
 *
 * `schemaFilter` is `["public"]` alone. `pull` emits a `.references()` for a
 * foreign key whose target it was told not to pull, and the generated
 * `relations.ts` then names a table that is absent and throws at import. So
 * the narrow filter is correct only because no `public` table references
 * anything outside `public`; keep it that way.
 *
 * better-auth's five tables (`user`, `session`, `account`, `verification`,
 * `jwks`) are pulled like every other `public` table and land in
 * `src/schema/tables.ts`. That is deliberate: their column names are a contract
 * with better-auth's Drizzle adapter, which addresses a column by the JS
 * property name Drizzle derives from it, and a hand-maintained second copy of
 * those definitions would be a contract with no way to notice it had drifted.
 * `services/actors/src/auth/auth-schema.test.ts` checks the generated definitions
 * against better-auth's own `getAuthTables()` instead.
 *
 * `extensionsFilters: ["postgis"]` keeps PostGIS's own `spatial_ref_sys` table
 * (~8500 SRID rows) and its `geography_columns` / `geometry_columns` views out
 * of the baseline.
 *
 * `admin` and `storage` are not pulled: both are leftover schemas in
 * `baseline/schema.sql` that nothing in `public` references, kept until a
 * migration drops them.
 */
export default defineConfig({
  dialect: "postgresql",
  // Points at the table definitions alone, not the directory. drizzle-kit rc.4
  // crashes ("Cannot read properties of undefined (reading 'config')") when the
  // schema glob also picks up `relations.ts` — RQB v2 relations are not DDL and
  // the generator has no place for them.
  schema: "./src/schema/tables.ts",
  out: "./migrations",
  schemaFilter: ["public"],
  extensionsFilters: ["postgis"],
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://cellar:cellar@localhost:5433/cellar",
  },
});
