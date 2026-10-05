/**
 * **Actor-to-actor calls go through the typed client.** The raw transport is
 * named in exactly the files that have to name it.
 *
 * There used to be ~29 `invokeActorMethod("BarcodeActor", code, "ensure",
 * [ctx, …], 15_000) as { code: string }` sites: the actor and method as
 * strings, the timeout restated, the result cast back to whatever the caller
 * hoped. A renamed method, a changed argument or a changed result compiled at
 * every one of them. `internal(ctx)(Descriptor, id).method(…)` checks all
 * three against the descriptor's interfaces and takes the timeout from the
 * descriptor. This file keeps the old shape from coming back.
 *
 * Read by symbol, not grepped: the prose around these modules names
 * `invokeActorMethod` constantly, and a comment is not a use — and a renamed
 * import (`import { invokeActorMethod as send }`), a namespace member or a
 * re-export *is* one, which a name match would miss.
 */
import {
  type ExportTarget,
  findReferences,
  PROGRAM_TIMEOUT_MS,
  type Project,
  relativePath,
  sourceFiles,
} from "@cellar-assistant/analysis";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ACTORS_SRC,
  actorsFixture,
  actorsProject,
  CONTRACTS_SRC,
} from "./analysis-testing.ts";

/** Where each raw transport is defined. */
const TRANSPORTS = {
  invokeActorMethod: {
    module: `${ACTORS_SRC}/lib/sidecar.ts`,
    name: "invokeActorMethod",
  },
  invokeActorOverSidecar: {
    module: `${CONTRACTS_SRC}/invocation.ts`,
    name: "invokeActorOverSidecar",
  },
} satisfies Record<string, ExportTarget>;

/**
 * The files allowed to name each raw transport, and why. The reason is the
 * point; "it was convenient" is not one.
 */
const ALLOWED: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  invokeActorMethod: {
    "lib/sidecar.ts":
      "Its definition: the shared transport addressed at this host's sidecar.",
    "lib/internal-client.ts":
      "The typed client's own transport — every `internal(ctx)(…)` call " +
      "arrives here with the descriptor's actor type and timeout.",
    "actors/outbox-actor.ts":
      "An outbox row names its target as data (`target_actor`, `method`), " +
      "which is the point of a row; there is no typed call site to have. " +
      "The allow-list and delivery identity guard it instead " +
      "(`services/actors/src/lib/outbox-targets.ts`).",
  },
  invokeActorOverSidecar: {
    "lib/sidecar.ts":
      "The host's one binding of the shared transport to its own sidecar.",
  },
};

const PROJECT = actorsProject();
const FILES = sourceFiles(PROJECT, { under: ACTORS_SRC, includeHarness: true });

/** Files (relative to `root`) that name the transport, by symbol. */
const filesNaming = (
  target: ExportTarget,
  project: Project = PROJECT,
  root: string = ACTORS_SRC,
): string[] => [
  ...new Set(
    findReferences(project, [target], {
      files: sourceFiles(project, { under: root, includeHarness: true }),
    }).map((ref) => relativePath(root, ref.node.getSourceFile().fileName)),
  ),
];

describe("raw sidecar transports are named only where they must be", () => {
  // The checker's pass over the tree is the cost here, not the load above:
  // done once, under a timeout sized for CPU (PROGRAM_TIMEOUT_MS says why).
  const namingByTransport = new Map<string, string[]>();
  let namingInternal: string[] = [];
  beforeAll(() => {
    namingInternal = filesNaming({
      module: `${ACTORS_SRC}/lib/internal-client.ts`,
      name: "internal",
    });
    for (const [name, target] of Object.entries(TRANSPORTS)) {
      namingByTransport.set(name, filesNaming(target));
    }
  }, PROGRAM_TIMEOUT_MS);

  it("scans the tree at all", () => {
    expect(FILES.length).toBeGreaterThan(80);
    expect(namingInternal.length).toBeGreaterThan(10);
  });

  for (const name of Object.keys(TRANSPORTS)) {
    const allowed = ALLOWED[name] ?? {};
    it(`names ${name} only in its justified files`, () => {
      const naming = namingByTransport.get(name) ?? [];
      expect(
        naming.filter((file) => !Object.hasOwn(allowed, file)),
        `Reach another actor with internal(ctx)(Descriptor, id).method(…) ` +
          `(src/lib/internal-client.ts), not ${name}: the typed client checks ` +
          "the method, its arguments and its result against the contract.",
      ).toEqual([]);
      // And the other direction: a justification for a file that no longer
      // needs one hides the next real exception behind it.
      expect(
        Object.keys(allowed).filter((file) => !naming.includes(file)),
      ).toEqual([]);
    });
  }

  it("sees a renamed import and a namespace member, not a look-alike (negative control)", () => {
    const project = actorsFixture({
      "renamed.ts": `import { invokeActorMethod as send } from "../lib/sidecar.ts"; export const go = send;`,
      "namespace.ts": `import * as sidecar from "../lib/sidecar.ts"; export const go = sidecar.invokeActorMethod;`,
      "lookalike.ts": `const invokeActorMethod = () => 0; export const go = invokeActorMethod();`,
    });
    expect(
      filesNaming(TRANSPORTS.invokeActorMethod, project, project.root),
    ).toEqual(["namespace.ts", "renamed.ts"]);
  });
});
