/**
 * The actor host as a `ts.Program`, for the architecture scans
 * (`@cellar-assistant/analysis`). Test support; its name ends in `testing.ts`,
 * so no scan judges it and nothing in the host imports it.
 */
import { fileURLToPath } from "node:url";
import {
  FIXTURE_OPTIONS,
  fixtureProject,
  loadProject,
  normalizePath,
  type Project,
} from "@cellar-assistant/analysis";

/** `services/actors/src`. */
export const ACTORS_SRC = normalizePath(
  fileURLToPath(new URL("..", import.meta.url)),
);

/** `packages/contracts/src`. */
export const CONTRACTS_SRC = normalizePath(
  fileURLToPath(new URL("../../../../packages/contracts/src", import.meta.url)),
);

/** `packages/policy/src`. */
export const POLICY_SRC = normalizePath(
  fileURLToPath(new URL("../../../../packages/policy/src", import.meta.url)),
);

/** `packages/db/src`. */
export const DB_SRC = normalizePath(
  fileURLToPath(new URL("../../../../packages/db/src", import.meta.url)),
);

/** The workspace packages the host imports, loaded as roots of a repo-only program. */
const SIBLINGS = [CONTRACTS_SRC, POLICY_SRC, DB_SRC];

/**
 * How much of the world a scan's program holds.
 *
 * - `"repo"` (the default): the host's sources and its sibling packages'
 *   (`contracts`, `policy`, `db`), nothing from `node_modules`. Every rule
 *   about this repo's own symbols — which module calls what, under which
 *   name, with which literal — needs no more, and it builds in a fraction of
 *   the time, which matters because each test file builds its own.
 * - `"full"`: every import resolved, libraries included, for a rule that
 *   reads a library's types (Drizzle's `sql`, Dapr's state manager).
 */
export type Scope = "repo" | "full";

/**
 * The actor host's program, built once per process per shape; findings
 * relative to `src/`. `includeTests` adds the test files as roots, for a rule
 * that judges them.
 */
export const actorsProject = (
  options: { readonly includeTests?: boolean; readonly scope?: Scope } = {},
): Project =>
  loadProject(`${ACTORS_SRC}/../tsconfig.json`, {
    root: ACTORS_SRC,
    includeTests: options.includeTests === true,
    ...(options.scope === "full"
      ? {}
      : { repoOnly: true, extraRoots: SIBLINGS }),
  });

/** Where {@link actorsFixture} files appear: inside `src/`, but not in it. */
export const FIXTURE_ROOT = `${ACTORS_SRC}/__fixture__`;

/**
 * A negative control's program: `files` (paths relative to
 * {@link FIXTURE_ROOT}) in memory, importing the real host modules as
 * `../lib/…` and the real packages by name, judged by the same checker.
 */
export const actorsFixture = (
  files: Readonly<Record<string, string>>,
  scope: Scope = "repo",
): Project =>
  scope === "full"
    ? fixtureProject({
        root: FIXTURE_ROOT,
        files,
        options: { ...FIXTURE_OPTIONS, types: ["node"] },
      })
    : fixtureProject({
        root: FIXTURE_ROOT,
        files,
        options: { ...FIXTURE_OPTIONS, types: [], noResolve: true },
        extraRoots: [ACTORS_SRC, ...SIBLINGS],
      });
