/**
 * §1.6 — `ctx.kind === 'system'` is constructed only by `OutboxActor` and job
 * actors, and is not derivable from a request.
 *
 * That sentence is the entire authorization model's floor: `system` bypasses
 * every rule in `@cellar-assistant/policy` (`bypassesPolicy`), so a request path
 * that can manufacture one has no authorization at all. Nothing else enforces
 * it — `systemCtx` is an ordinary exported function and any module could call
 * it — so this test is the fence, in the same spirit as `no-actor-state.test.ts`.
 *
 * **One module may construct one**, `actors/outbox-actor.ts`, and the reason
 * it is allowed is that it is not reachable from a request: the drain reminder
 * fires from Dapr's scheduler, and the ctx it builds is handed to the *target*
 * of a row an actor already committed.
 *
 * Job actors are the other half of §1.6's sentence, and they get their system
 * ctx the same way — a `runBatch` is an outbox delivery. The `JobActor` base
 * used to mint one too (`systemContext()`); that is gone, and so is its
 * allowance here. An allowance that covers nothing is a hole waiting for code,
 * so the list is asserted to be *used* as well as respected.
 *
 * Test files are excluded: driving `runBatch` in a unit test means standing in
 * for the outbox, and that is what a test is for.
 */
import {
  type Finding,
  findCalls,
  findingAt,
  firstLineOf,
  literalValue,
  PROGRAM_TIMEOUT_MS,
  type Project,
  sourceFiles,
} from "@cellar-assistant/analysis";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ACTORS_SRC,
  actorsFixture,
  actorsProject,
  CONTRACTS_SRC,
} from "./analysis-testing.ts";

/** Files, relative to `src`, that may construct a system ctx. Exact paths. */
const ALLOWED: readonly string[] = ["actors/outbox-actor.ts"];

const SYSTEM_CTX = { module: `${CONTRACTS_SRC}/ctx.ts`, name: "systemCtx" };

/**
 * Parsed and resolved, not grepped: this file and the plan quotations in
 * `actor-base.ts`, `policy` and `contracts` all *say* `systemCtx` in prose,
 * and a regex would report every one of them.
 *
 * Three shapes, each a finding outside {@link ALLOWED}:
 *
 *  - a call of `systemCtx` — found by symbol, so a renamed import or a
 *    namespace member is the same call;
 *  - any other reference to it (`.call`, passed as a value, re-exported) —
 *    a constructor handed somewhere the scan cannot follow;
 *  - `kind: "system"` in an object literal — building one by hand — where
 *    the value is anything the checker pins to `"system"`, a `const`
 *    included.
 */
const scanAll = (
  project: Project = actorsProject(),
  root: string = ACTORS_SRC,
): Finding[] => {
  // The harnesses are judged too; only the tests themselves stand in for
  // the outbox.
  const files = sourceFiles(project, { under: root, includeHarness: true });
  const { calls, refusals } = findCalls(project, [SYSTEM_CTX], {
    rule: "system-ctx/reference",
    files,
  });
  const findings: Finding[] = [
    ...calls.map((site) =>
      findingAt(
        project,
        site.call,
        "system-ctx/call",
        `systemCtx() — ${firstLineOf(site.call)}`,
      ),
    ),
    ...refusals,
  ];
  for (const file of files) {
    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyAssignment(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === "kind" &&
        literalValue(project.checker, node.initializer) === "system"
      ) {
        findings.push(
          findingAt(
            project,
            node,
            "system-ctx/literal",
            `kind: "system" — ${firstLineOf(node)}`,
          ),
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return findings;
};

const outsideAllowed = (findings: readonly Finding[]): Finding[] =>
  findings.filter((finding) => !ALLOWED.includes(finding.file));

const scan = (project?: Project, root?: string): Finding[] =>
  outsideAllowed(scanAll(project, root));

describe("system ctx (§1.6)", () => {
  // The host's program and the checker's first pass over it, once, under a
  // timeout sized for CPU (PROGRAM_TIMEOUT_MS says why).
  let tree: Finding[] = [];
  beforeAll(() => {
    tree = scanAll();
  }, PROGRAM_TIMEOUT_MS);

  it("finds sources to scan", () => {
    expect(sourceFiles(actorsProject()).length).toBeGreaterThan(5);
  });

  it("is constructed only by OutboxActor", () => {
    const hits = outsideAllowed(tree);
    const detail = hits
      .map((h) => `  ${h.file}:${h.line}  ${h.message}`)
      .join("\n");

    expect(
      hits,
      hits.length === 0
        ? ""
        : [
            "",
            "A module other than OutboxActor constructed a `system` context:",
            "",
            detail,
            "",
            "Migration plan §1.6: `ctx.kind === 'system'` is only ever",
            "constructed by `OutboxActor` and job actors. It is not derivable",
            "from a request, and `bypassesPolicy` makes it bypass every",
            "visibility rule there is.",
            "",
            "If an actor needs a follow-up done with system authority, commit",
            "an `outbox` row in the same transaction as its write (§1.4) and",
            "let the outbox deliver the call — that is the only supported way",
            "to cross that line. A `JobActor` subclass already has one: its",
            "`processBatch` runs inside a `runBatch` the outbox delivered, so",
            "use the `ctx` it is handed.",
            "",
          ].join("\n"),
    ).toEqual([]);
  });

  it("has no allowance that covers nothing", () => {
    // An allowance nobody uses is a pre-approved hole: the next module to
    // land under that path could mint a system ctx and this test would say
    // nothing. `actors/job-actor/` sat here for a method that had been deleted.
    const found = new Set(tree.map((finding) => finding.file));
    expect(ALLOWED.filter((file) => !found.has(file))).toEqual([]);
  });

  it("sees every way to make one, by symbol (negative control)", () => {
    const project = actorsFixture({
      "direct.ts": `import { systemCtx } from "@cellar-assistant/contracts"; export const c = systemCtx("r");`,
      "renamed.ts": `import { systemCtx as sys } from "@cellar-assistant/contracts"; export const c = sys("r");`,
      "namespace.ts": `import * as c from "@cellar-assistant/contracts"; export const x = c.systemCtx("r");`,
      "value.ts": `import { systemCtx } from "@cellar-assistant/contracts"; export const make = [systemCtx];`,
      "literal.ts": `export const c = { kind: "system", requestId: "r" };`,
      "const.ts": `const SYSTEM = "system"; export const c = { kind: SYSTEM };`,
      "fine.ts": `const systemCtx = (r: string) => r; export const c = [systemCtx("r"), { kind: "user" }];`,
      "actors/outbox-actor.ts": `import { systemCtx } from "@cellar-assistant/contracts"; export const c = systemCtx("r");`,
    });
    const found = scan(project, project.root);
    expect(
      [
        ...new Set(found.map((finding) => `${finding.file} ${finding.rule}`)),
      ].sort(),
    ).toEqual([
      "const.ts system-ctx/literal",
      "direct.ts system-ctx/call",
      "literal.ts system-ctx/literal",
      "namespace.ts system-ctx/call",
      "renamed.ts system-ctx/call",
      "value.ts system-ctx/reference",
    ]);
  });
});
