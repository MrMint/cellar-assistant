import { defineConfig } from "drizzle-kit";

/**
 * Baseline config for the post-Nhost database (migration-plan §6 A3).
 *
 * `schemaFilter` is `["public"]` alone, as of X2. A3 had to widen it to
 * `["public", "auth", "storage"]` — not because the baseline wanted those
 * schemas, but because 31 application tables had a foreign key into
 * `auth.users` and 6 into `storage.files`, and `pull` emits a `.references()`
 * for a foreign key whose target it was told not to pull. The generated
 * `relations.ts` then named `usersInAuth` / `filesInStorage`, which were absent,
 * and threw at import.
 *
 * Both causes are gone. A8 copied `storage.files` into `public.files` and
 * `transform/09`, `10` and `12` repointed all six of those foreign keys; X2
 * created better-auth's `user` in `public` (`transform/13`), repointed the 31
 * (`transform/14`) and dropped the `auth` schema outright (`transform/15`). No
 * `public` table references anything outside `public` any more, so the narrow
 * filter is now the correct one rather than a wish.
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
 * `admin` is not pulled: `admin.credentials` has no FK to or from the app and
 * migration-plan §9 defers the decision to drop it. `storage` is not pulled
 * either — nothing points at it now, and E1 owns dropping it once the file
 * migration is verified against production.
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
