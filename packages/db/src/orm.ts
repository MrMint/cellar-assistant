/**
 * Drizzle's query builders and operators, re-exported.
 *
 * **Import `eq`, `and`, `sql`, `desc`, … from here, not from `drizzle-orm`.**
 *
 * The hazard: two physically different `drizzle-orm` files in one type graph.
 * Passing a table built by one to an operator from the other is a type error
 * the size of a screen that says nothing useful.
 *
 * That split was real and unavoidable when each project carried its own
 * lockfile. It is **not** the current state: R1 set
 * `sharedWorkspaceLockfile: true`, and `packages/db` and `services/actors` now
 * both link to the same store entry
 * (`drizzle-orm@1.0.0-rc.4_@types+pg@8.15.6_pg@8.16.3_zod@4.6.1` — one
 * directory, checked).
 *
 * The rule stays anyway, because the mechanism that caused it has not gone
 * away: drizzle-orm's store path encodes its resolved peers, and
 * `services/actors` has `zod` in scope through better-auth while `packages/db`
 * does not. Any future change that gives the two different peer sets splits
 * them again, silently. Routing every operator through one module costs
 * nothing and removes the whole class rather than today's instance of it.
 *
 * Routing every operator through this module makes `@cellar-assistant/db` the
 * one place that knows what Drizzle is. `services/actors` keeps its own direct
 * `drizzle-orm` dependency for better-auth's adapter, which is a self-contained
 * island with its own schema and its own connection; the two never mix values.
 *
 * At runtime two copies are harmless: drizzle's `is()` compares static
 * `entityKind` strings, not constructor identity, precisely so it survives this.
 */
export * from "drizzle-orm";
