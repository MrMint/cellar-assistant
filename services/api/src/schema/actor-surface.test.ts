/**
 * **Every registered actor is reachable, or is on the list of ones that are
 * deliberately not.** (A7f)
 *
 * ## The failure this exists to stop
 *
 * A7 wrote the API skeleton before most of the B and C actors existed, and
 * nothing came back to wire the later ones in. So actors were built, tested,
 * registered — and stayed unreachable from the API. It happened at least four
 * times:
 *
 *  - `FileActor` (A8) was invisible until A7c exposed it two days later, so
 *    images could be neither uploaded nor displayed;
 *  - `MapActor` (C2) was built specifically for viewport browse and had no
 *    `Query.mapBrowse`, no `MapPlace` and no `MapCluster` in the schema at
 *    all — so `/map` had no unfiltered browse and no clusters, because
 *    `placeSearch` was the only viewport field and its `query` is required;
 *  - `RankingsActor` (C2) had no `Query.rankings`, so `/rankings` had nothing
 *    to call;
 *  - `RecipePhotoJobActor` (C4) had no mutation, so D6 shipped an explicit
 *    "not available" page for `/recipes/ai-generator`.
 *
 * Each was found by a *frontend* workstream running into a wall. Fixing the
 * four instances leaves the fifth to be found the same way, so this test is
 * the actual fix: it fails the moment an actor is registered without either a
 * GraphQL surface or an explicit, justified entry in `NO_SURFACE` below.
 *
 * ## What counts as "exposed"
 *
 * A resolver reaches an actor by naming it — either through its
 * `ActorDescriptor` (`context.actor(MapActorDescriptor, …)`) or, for the job
 * actors that have no descriptor, through its `*_ACTOR_TYPE` constant. So the
 * check is: does any non-test module under `src/schema/` mention an identifier
 * that resolves to this actor's type string? Identifiers are read from the
 * TypeScript AST rather than grepped, so a doc comment naming an actor does
 * not count as exposing it — which matters, because these modules discuss
 * actors they do not call constantly.
 *
 * ## Adding to `NO_SURFACE`
 *
 * The reason string is the point. "Internal" is not a reason; say who calls it
 * instead, and if the answer is "a user, eventually", the entry is wrong and
 * the actor needs a field.
 */
import { fileURLToPath } from "node:url";
import {
  FIXTURE_OPTIONS,
  fixtureProject,
  inTypePosition,
  loadProject,
  normalizePath,
  PROGRAM_TIMEOUT_MS,
  type Project,
  referencedSymbol,
  sourceFileAt,
  sourceFiles,
} from "@cellar-assistant/analysis";
import * as contracts from "@cellar-assistant/contracts";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";

const ACTORS_SRC = normalizePath(
  fileURLToPath(new URL("../../../actors/src", import.meta.url)),
);
const CONTRACTS_SRC = normalizePath(
  fileURLToPath(new URL("../../../../packages/contracts/src", import.meta.url)),
);
const REGISTRY = `${ACTORS_SRC}/actors/registry.ts`;
const SCHEMA_DIR = normalizePath(fileURLToPath(new URL(".", import.meta.url)));

/**
 * The API, the actor host's sources and the contracts as one repo-only
 * program (`@cellar-assistant/analysis`) — read, never imported: importing
 * the registry would drag every actor module and Drizzle into this process,
 * which is the dependency `services/api` exists not to have.
 */
const PROJECT: Project = loadProject(
  fileURLToPath(new URL("../../tsconfig.json", import.meta.url)),
  { repoOnly: true, extraRoots: [ACTORS_SRC, CONTRACTS_SRC] },
);

/* -------------------------------------------------------------------------- */
/* The allow-list                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Actors that correctly have no GraphQL surface, and why.
 *
 * Every one of these is called by another actor, by the outbox, or by a
 * scheduled reminder — never by a request. Several would be actively harmful
 * to expose, and those say so.
 */
const NO_SURFACE: Readonly<Record<string, string>> = {
  OutboxActor:
    "§2.7 infrastructure. Nothing invokes it; the keep-alive its registry " +
    "entry declares, armed by the actors' boot(), runs it. A field to " +
    "trigger a drain would be an anti-feature.",
  ProbeJobActor:
    "A5's job-actor smoke probe, the `PingActor` of §2.6. Referenced only by " +
    "its own registration and one outbox test fixture; deletable now that " +
    "C4's real job actors exist.",
  MaintenanceActor:
    "Unbounded scheduled singleton (§2.6). It re-enqueues its own next run " +
    "through the outbox and reaches `FileActor.delete` that way, because " +
    "§1.6 forbids it minting a `system` ctx.",
  CategoryVectorsActor:
    "Reference data (§2.5). `seed` is admin-only and must be handed " +
    "pre-computed vectors, and the table is read through the " +
    "`search_category_vectors` SQL function rather than through the actor.",
  BudgetActor:
    "The gate every paid external call reserves through (§1.5). Called by " +
    "`PlaceActor`, `GooglePlacesActor` and `PlaceRefreshJobActor`; a denial " +
    "already reaches clients as `BudgetExceededError`. `setBudget` is " +
    "admin-only and wants an operator console, not a public field.",
  EmbeddingActor:
    "Reached only by synchronous sidecar invokes from seven other actors " +
    "(§2.3). Exposing it would reopen target-stack §7's client-reachable " +
    "`create_search_vector` hole, which §5 closed by moving it here.",
  MenuMatchJobActor:
    "Started by one outbox row from `MenuScanActor.match` with a " +
    "deterministic job id (§8.5). Its methods are `system`-only, so a " +
    "resolver could not call them even if a field existed.",
  PlaceRefreshJobActor:
    "Operator tooling. `start` is admin-only and its Hasura predecessor " +
    "(`refresh_places`) was `role: admin` too, so no user page needs it. " +
    "Nothing starts it today — see this file's outcome note; when an admin " +
    "console exists, this entry should become a field instead.",
  OnboardingReprocessJobActor:
    "Operator tooling, and the strongest case for staying unexposed: it " +
    "re-runs a vision model over *other users'* onboardings, and its " +
    "predecessor `reprocessOnboardingBatch` had no Hasura action at all.",
  OvertureReloadJobActor:
    "Operator tooling (C4b). `start` is admin-only and additionally refuses " +
    "unless a BigQuery source is installed at boot; its predecessor " +
    "`refreshPlaces` was an admin-secret HTTP function with no Hasura " +
    "action. It rewrites the reference half of every place row, so it wants " +
    "an operator console rather than a public field — the same conclusion " +
    "`PlaceRefreshJobActor` reached.",
  VectorReembedJobActor:
    "Operator tooling. `start` is admin-only and spends an embedding call " +
    "on every item/recipe vector whose `embedding_model` is not the " +
    "configured one; it is the cutover step after the switch to " +
    "gemini-embedding-2 (every migrated vector's model is NULL). Like " +
    "`PlaceRefreshJobActor`, it wants an operator console, not a public field.",
};

/* -------------------------------------------------------------------------- */
/* Reading the registry                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The class of every `entry(X, XDescriptor)` in the actors' registry
 * (`services/actors/src/actors/registry.ts`, the list its `index.ts` registers
 * by looping over), in registration order.
 *
 * Read from the program rather than imported (see {@link PROJECT}), and
 * parsed rather than grepped so that a
 * commented-out entry — or the `JobActor` base class named in the prose
 * around them — is not counted. `registry.test.ts` over there asserts each
 * class's name is the actor type Dapr registers it under, which is what makes
 * a class name usable as an actor type here.
 */
const registeredActors = (): string[] => {
  const source = sourceFileAt(PROJECT, REGISTRY);
  const names: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "entry"
    ) {
      const [argument] = node.arguments;
      if (argument !== undefined && ts.isIdentifier(argument)) {
        names.push(argument.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
};

/* -------------------------------------------------------------------------- */
/* Reading the schema                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Every contracts export *used* anywhere under `src/schema/` (tests aside: a
 * test may name an actor it stubs), by the name it is exported under — read
 * by symbol, so `import { CellarActorDescriptor as Cellars }` then `Cellars`
 * is a use of `CellarActorDescriptor`, while an import nobody uses, a type
 * position or a local that shares the name is not.
 */
const schemaIdentifiers = (
  project: Project = PROJECT,
  under: string = SCHEMA_DIR,
): ReadonlySet<string> => {
  const seen = new Set<string>();
  for (const file of sourceFiles(project, { under })) {
    const visit = (node: ts.Node): void => {
      if (
        ts.isIdentifier(node) &&
        !ts.isImportSpecifier(node.parent) &&
        !ts.isImportClause(node.parent) &&
        !ts.isNamespaceImport(node.parent) &&
        !inTypePosition(node)
      ) {
        const symbol = referencedSymbol(project.checker, node);
        if (
          symbol !== undefined &&
          (symbol.declarations ?? []).some((declaration) =>
            declaration
              .getSourceFile()
              .fileName.startsWith(`${CONTRACTS_SRC}/`),
          )
        ) {
          seen.add(symbol.name);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return seen;
};

/* -------------------------------------------------------------------------- */
/* Actor type -> the identifiers that would expose it                          */
/* -------------------------------------------------------------------------- */

/**
 * The contracts barrel, inverted: actor type string → every exported name that
 * denotes it.
 *
 * Two shapes, because the codebase has two. Most actors export an
 * `ActorDescriptor` whose `actorType` is the string; the job actors that
 * `services/api` addresses without a typed proxy export a bare
 * `*_ACTOR_TYPE` constant instead (`packages/contracts/src/jobs.ts`).
 */
const exposingIdentifiers = (): ReadonlyMap<string, readonly string[]> => {
  const byActorType = new Map<string, string[]>();
  const add = (actorType: string, exportName: string): void => {
    const names = byActorType.get(actorType) ?? [];
    names.push(exportName);
    byActorType.set(actorType, names);
  };

  for (const [exportName, value] of Object.entries(contracts)) {
    if (typeof value === "string" && /Actor$/.test(value)) {
      add(value, exportName);
      continue;
    }
    const actorType = (value as { actorType?: unknown } | null)?.actorType;
    if (typeof actorType === "string") add(actorType, exportName);
  }
  return byActorType;
};

/* -------------------------------------------------------------------------- */
/* The guards                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The schema's uses, read once: loading {@link PROJECT} paid for parsing, and
 * resolving every identifier under `src/schema` pays for the checker — under
 * a timeout sized for CPU, rather than inside whichever test asks first
 * (PROGRAM_TIMEOUT_MS says why).
 */
let identifiers: ReadonlySet<string> = new Set();
beforeAll(() => {
  identifiers = schemaIdentifiers();
}, PROGRAM_TIMEOUT_MS);

describe("every registered actor is reachable (A7f)", () => {
  const registered = registeredActors();

  it("finds the registry", () => {
    // If this drops, the parse above silently stopped seeing registrations and
    // every other assertion in this file would pass vacuously.
    expect(registered.length).toBeGreaterThan(40);
    expect(new Set(registered).size).toBe(registered.length);
  });

  it("exposes every actor that is not explicitly allow-listed", () => {
    const exposing = exposingIdentifiers();

    const unreachable = registered.filter((actorType) => {
      if (Object.hasOwn(NO_SURFACE, actorType)) return false;
      const names = exposing.get(actorType) ?? [];
      // A descriptor-less actor with no constant either cannot be named by a
      // resolver at all, so it is unreachable by construction.
      return !names.some((name) => identifiers.has(name));
    });

    expect(
      unreachable,
      [
        "These actors are registered but nothing in services/api/src/schema names",
        "them, so no client can reach them. Either add a field, or add an entry",
        "to NO_SURFACE in this file saying who calls the actor instead.",
        "See this file's header for the four times this has already happened.",
      ].join(" "),
    ).toEqual([]);
  });

  it("keeps the allow-list free of actors that are actually exposed", () => {
    const exposing = exposingIdentifiers();

    // The other direction: an allow-listed actor that *has* gained a field is
    // a stale entry, and leaving it hides the next real gap behind it.
    const stale = Object.keys(NO_SURFACE).filter((actorType) =>
      (exposing.get(actorType) ?? []).some((name) => identifiers.has(name)),
    );
    expect(stale).toEqual([]);
  });

  it("keeps the allow-list free of actors that are not registered", () => {
    const known = new Set(registered);
    const unknown = Object.keys(NO_SURFACE).filter((name) => !known.has(name));
    expect(
      unknown,
      "NO_SURFACE names actors that are no longer registered",
    ).toEqual([]);
  });

  /**
   * The third direction, and the one the two above cannot see.
   *
   * They both start from the registry: "everything registered is reachable"
   * and "nothing allow-listed is reachable". Neither notices an actor that a
   * resolver *names* and the registry does not carry — delete
   * `entry(CellarActor, CellarActorDescriptor)` and both stay green, because an unregistered
   * actor is simply absent from the list they iterate. Found by hand-mutation;
   * the whole of `/cellars` would 404 at the sidecar while this file, the 274
   * other api tests and the 1100 actor tests all passed.
   *
   * The allow-listed actors are already covered from the other side by "keeps
   * the allow-list free of actors that are not registered". This closes the
   * same hole for the ~30 actors that do have a field, which is the set with
   * a user-visible page behind it.
   */
  it("registers every actor a resolver names", () => {
    const known = new Set(registered);

    const missing = [...exposingIdentifiers()]
      .filter(([actorType, names]) => {
        if (known.has(actorType)) return false;
        return names.some((name) => identifiers.has(name));
      })
      .map(([actorType]) => actorType);

    expect(
      missing,
      [
        "services/api/src/schema names these actors, but",
        "services/actors/src/actors/registry.ts does not register them, so",
        "every field that reaches one fails at the sidecar with no such actor",
        "type. Add the entry(Class, Descriptor), or stop naming the actor.",
      ].join(" "),
    ).toEqual([]);
  });

  it("gives every allow-list entry a real reason", () => {
    const lazy = Object.entries(NO_SURFACE).filter(
      ([, reason]) => reason.trim().length < 40,
    );
    expect(lazy.map(([name]) => name)).toEqual([]);
  });
});

/**
 * The three actors A7f exposed, named individually.
 *
 * The general guard above would go green again if someone deleted a field and
 * added an allow-list entry for it. These three have pages depending on them
 * (`/map`, `/rankings`, `/recipes/ai-generator`), so they are pinned.
 */
describe("reading the schema's uses", () => {
  it("counts a renamed use, and not an unused import, a type or a namesake (negative control)", () => {
    const project = fixtureProject({
      root: `${SCHEMA_DIR}/__fixture__`,
      files: {
        "a.ts": [
          'import { CellarActorDescriptor as Cellars, ItemActorDescriptor, TierListActorDescriptor } from "@cellar-assistant/contracts";',
          "const BudgetActorDescriptor = 1;",
          "export const used = [Cellars, BudgetActorDescriptor];",
          "export type T = typeof ItemActorDescriptor;",
        ].join("\n"),
      },
      options: { ...FIXTURE_OPTIONS, noResolve: true },
      extraRoots: [CONTRACTS_SRC],
    });
    expect([...schemaIdentifiers(project, project.root)]).toEqual([
      "CellarActorDescriptor",
    ]);
  });
});

describe("A7f's three fields exist", () => {
  it("names MapActor, RankingsActor and RecipePhotoJobActor", () => {
    expect({
      map: identifiers.has("MapActorDescriptor"),
      rankings: identifiers.has("RankingsActorDescriptor"),
      recipePhoto: identifiers.has("RecipePhotoJobActorDescriptor"),
    }).toEqual({ map: true, rankings: true, recipePhoto: true });
  });
});
