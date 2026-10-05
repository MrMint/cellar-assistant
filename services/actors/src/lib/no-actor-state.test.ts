/**
 * §1.3 — Postgres is the only truth.
 *
 * This test is the *only* thing that enforces that rule, and the reason is
 * worth knowing before you touch it:
 *
 * A2 discovered that Dapr refuses to host actors at all unless an
 * `actorStateStore` component is declared, so it had to declare one
 * (`state.in-memory`, in `infra/dapr/components/`). Before that, the rule was
 * enforced by physics — there was no state store, so `saveState()` had nowhere
 * to go. Now there is one, it is in-memory, and it is a lie: it survives no
 * restart, no rebalance and no eviction, and it is invisible to every other
 * process. Anything that comes to rely on it will work in development and lose
 * data in production.
 *
 * So: actors load from Postgres on activate and write through synchronously
 * inside the turn. An in-memory copy is a cache and an eviction loses nothing.
 */
import {
  type Finding,
  findingAt,
  firstLineOf,
  PROGRAM_TIMEOUT_MS,
  type Project,
  referencedSymbol,
  sourceFiles,
} from "@cellar-assistant/analysis";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ACTORS_SRC,
  actorsFixture,
  actorsProject,
} from "./analysis-testing.ts";

/** `ActorStateManager`'s entire surface. */
const FORBIDDEN = ["getState", "setState", "removeState", "saveState"] as const;

/** Where Dapr declares the state manager and the accessor that returns it. */
const DAPR_STATE =
  /\/@dapr\/dapr\/actors\/runtime\/(ActorStateManager|StateManager|StateProvider|ActorStateChange)\.d\.ts$/;
const DAPR_ACTOR = /\/@dapr\/dapr\/actors\/runtime\/AbstractActor\.d\.ts$/;

/**
 * Parsed and resolved, not grepped. A regex over the source flags this file's
 * own prose and the explanation in `actor-base.ts`; the AST sees only
 * identifiers, so a comment explaining why the rule exists never trips it.
 *
 * Two readings, either one a finding — every file under `actors/`, tests
 * included:
 *
 *  - by **name**: an identifier, member or method declaration named like the
 *    state manager's surface (`setState`), whatever it resolves to;
 *  - by **symbol**: anything the checker resolves into Dapr's state manager
 *    (`m["setState"]`, a destructured `getState`), or `getStateManager` itself.
 */
const scan = (project: Project, under: string): Finding[] => {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const record = (node: ts.Node, method: string): void => {
    const finding = findingAt(
      project,
      node,
      "no-actor-state",
      `${method} — ${firstLineOf(node)}`,
    );
    // `a.setState` matches twice — the property access and the identifier
    // under it. One report per site.
    const key = `${finding.file}:${finding.line}:${method}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(finding);
  };
  const daprState = (node: ts.Node): string | undefined => {
    const symbol = referencedSymbol(project.checker, node);
    for (const declaration of symbol?.declarations ?? []) {
      const file = declaration.getSourceFile().fileName;
      if (DAPR_STATE.test(file)) return symbol?.name;
      if (DAPR_ACTOR.test(file) && symbol?.name === "getStateManager") {
        return symbol.name;
      }
    }
    return undefined;
  };
  for (const file of sourceFiles(project, { under, includeTests: true })) {
    const visit = (node: ts.Node): void => {
      const name =
        ts.isPropertyAccessExpression(node) || ts.isMethodDeclaration(node)
          ? node.name.getText()
          : ts.isIdentifier(node)
            ? node.text
            : undefined;
      if (
        name !== undefined &&
        (FORBIDDEN as readonly string[]).includes(name)
      ) {
        record(node, name);
      } else if (
        ts.isIdentifier(node) ||
        (ts.isStringLiteralLike(node) &&
          ts.isElementAccessExpression(node.parent) &&
          node.parent.argumentExpression === node)
      ) {
        const resolved = daprState(node);
        if (resolved !== undefined) record(node, resolved);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return findings;
};

describe("no actor state (§1.3)", () => {
  // The full program (Dapr's own types are what the symbol reading resolves
  // into) and the checker's pass over every identifier under `actors/` are
  // this file's cost — ≈2 s alone, twice that under load. Both happen here,
  // once, under a timeout sized for CPU rather than for waiting.
  let project: Project;
  let hits: Finding[] = [];
  beforeAll(() => {
    project = actorsProject({ includeTests: true, scope: "full" });
    hits = scan(project, `${ACTORS_SRC}/actors`);
  }, PROGRAM_TIMEOUT_MS);

  it("finds actor sources to scan, tests included", () => {
    const files = sourceFiles(project, {
      under: `${ACTORS_SRC}/actors`,
      includeTests: true,
    });
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((file) => file.fileName.endsWith(".test.ts"))).toBe(true);
  });

  it("no actor touches the Dapr state manager", () => {
    const detail = hits
      .map((h) => `  ${h.file}:${h.line}  ${h.message}`)
      .join("\n");

    expect(
      hits,
      hits.length === 0
        ? ""
        : [
            "",
            "An actor referenced Dapr's actor state manager:",
            "",
            detail,
            "",
            "Migration plan §1.3: Postgres is the only truth. Actors load on",
            "activate, cache in memory, and write through synchronously inside",
            "the turn; an eviction loses nothing because the in-memory copy is",
            "only a cache.",
            "",
            "This test is the only thing enforcing that. Dapr will not host",
            "actors unless an `actorStateStore` component exists, so A2 had to",
            "declare one — `state.in-memory` in infra/dapr/components/. Its",
            "absence used to make this rule unbreakable; now it is declared,",
            "the store is reachable, and it is in-memory: it survives no",
            "restart, no rebalance and no actor eviction, and no other process",
            "can see it. State written there will look fine in development and",
            "silently vanish in production.",
            "",
            "Persist to Postgres inside the actor's transaction instead, and",
            "reload it in `load()`. If the write needs a follow-up, add an",
            "`outbox` row in the same transaction (§1.4).",
            "",
          ].join("\n"),
    ).toEqual([]);
  });

  it("sees the state manager by name and by symbol (negative control)", () => {
    const fixture = actorsFixture(
      {
        "actors/stateful.ts": `
        import { AbstractActor } from "@dapr/dapr";
        export class Stateful extends AbstractActor {
          async byName() { await this.getStateManager<number>().setState("k", 1); }
          async bySymbol() {
            const m = this.getStateManager<number>();
            const { getState: read } = m;
            return [await m["removeState"]("k"), read];
          }
        }
      `,
        "actors/fine.ts": `export const state = { count: 0 };`,
      },
      "full",
    );
    const found = scan(fixture, `${fixture.root}/actors`);
    // `m["removeState"]` and both `getStateManager` calls are what the name
    // reading alone never saw.
    expect(found.map((f) => f.message.split(" — ")[0]).sort()).toEqual([
      "getState",
      "getStateManager",
      "getStateManager",
      "removeState",
      "setState",
    ]);
    expect(found.every((f) => f.file === "actors/stateful.ts")).toBe(true);
  });
});
