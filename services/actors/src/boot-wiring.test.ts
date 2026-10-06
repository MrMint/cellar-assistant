/**
 * The actor host's entrypoint is wired, not merely importable.
 *
 * ## Why this file exists
 *
 * `src/index.ts` is the one module in this service that cannot be imported by
 * a test: it calls `server.start()` and `listen()` at module scope, so
 * importing it binds a port. Everything it does is therefore invisible to the
 * tests around it, and everything it does is a seam — a line that connects a
 * component nobody doubts to the runtime that has to call it.
 *
 * This branch paid for that twice: `MaintenanceActor` was registered, which
 * made it *callable*, and its reminder was never armed, which is what makes it
 * *run* — nine days, 49 unverified files, 11 unreported dead letters. Deleting
 * the arming call left every suite green.
 *
 * Most of what `index.ts` did is now `boot()` (`src/boot.ts`), which *can* be
 * imported, and `src/boot.test.ts` runs it against a fake server and sidecar:
 * every actor registered, every declared keep-alive armed, AI and Overture
 * installed first. What this file still guards is the part that has to stay
 * in `index.ts` because it is about the process — and that `index.ts` hands
 * the server to `boot()` at all, since a `boot()` nobody calls fails exactly
 * like one nobody wrote.
 *
 * ## Parsed, not grepped, and not imported
 *
 * The same technique as `src/lib/overture.test.ts`'s "boot wiring (B5b's
 * lesson)", for the same reason it gives: the prose above each of these calls
 * names the function, and a comment is not a call. A call expression in the
 * AST is.
 */
import {
  type Project,
  referencedSymbol,
  sourceFileAt,
} from "@cellar-assistant/analysis";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  ACTORS_SRC,
  actorsFixture,
  actorsProject,
} from "./lib/analysis-testing.ts";

const ENTRYPOINT = `${ACTORS_SRC}/index.ts`;
const PROJECT = actorsProject();
const SOURCE = sourceFileAt(PROJECT, ENTRYPOINT);

/**
 * The name a callee *is*: for an identifier, the name its symbol was declared
 * with — so `import { boot as start }` then `start()` is a call of `boot` —
 * and for `a.b.f()`, `f`.
 */
const calleeNameIn =
  (project: Project) =>
  (node: ts.CallExpression): string | null => {
    const callee = node.expression;
    const name = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
    if (!ts.isIdentifier(name)) return null;
    const symbol = referencedSymbol(project.checker, name);
    return symbol !== undefined && symbol.name !== "default"
      ? symbol.name
      : name.text;
  };

/**
 * Every call in `source`, by the name its callee resolves to. Bare identifiers
 * are what the three seams below use; the property form is only here to give
 * the canary something to count.
 */
const calledFunctions = (
  project: Project = PROJECT,
  source: ts.SourceFile = SOURCE,
): ReadonlyMap<string, number> => {
  const calleeName = calleeNameIn(project);
  const called = new Map<string, number>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node);
      if (name !== null) called.set(name, (called.get(name) ?? 0) + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return called;
};

describe("services/actors/src/index.ts hands the server to boot()", () => {
  const called = calledFunctions();
  const calls = (name: string): boolean => called.has(name);

  it("finds the entrypoint's calls at all", () => {
    // The canary: if the parse silently stopped seeing call expressions,
    // every assertion below would report a missing call rather than a broken
    // parse.
    expect(called.size).toBeGreaterThan(10);
  });

  it("calls boot(): otherwise nothing is registered, installed or armed", () => {
    expect(
      called.get("boot"),
      "boot() registers every actor, installs AI and Overture, starts the " +
        "server and arms the outbox's and the watchdog's keep-alives. " +
        "src/boot.test.ts proves boot() does all of that; only this proves " +
        "the entrypoint calls it, exactly once.",
    ).toBe(1);
  });

  it("leaves registration, installation and arming to boot()", () => {
    // A second copy here would be the drift boot() exists to remove: a list
    // in index.ts that boot.test.ts cannot see.
    for (const name of [
      "registerActor",
      "installAI",
      "installOverture",
      "armKeepAlive",
      "registerReminder",
    ]) {
      expect(calls(name), `index.ts calls ${name}() itself`).toBe(false);
    }
  });

  it("counts a call by what the callee resolves to (negative control)", () => {
    const project = actorsFixture({
      "entry.ts": `
        import { boot as start } from "../boot.ts";
        import { installAI as ai } from "../lib/ai/install.ts";
        const installOverture = () => 0;
        export const go = () => [start, ai, installOverture()];
        start({} as never);
        ai({} as never);
      `,
    });
    const counted = calledFunctions(
      project,
      sourceFileAt(project, `${project.root}/entry.ts`),
    );
    expect(counted.get("boot")).toBe(1);
    expect(counted.get("installAI")).toBe(1);
    // A local that shares a seam's name is still counted under it — the
    // declared name is the name — which is the strict direction here.
    expect(counted.get("installOverture")).toBe(1);
    expect(counted.has("start")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */

/**
 * The crash seams. `src/lib/actor-route-guard.test.ts` and
 * `src/lib/process-guard.test.ts` prove each guard works; nothing proves the
 * entrypoint installs them except this. A guard installed nowhere fails
 * exactly like one nobody wrote — here, by the host exiting on the next
 * idle-timeout DELETE for an actor it does not hold.
 */
describe("services/actors/src/index.ts installs the crash guards", () => {
  const source = SOURCE;
  const calleeName = calleeNameIn(PROJECT);

  const callsNamed = (name: string): ts.CallExpression[] => {
    const found: ts.CallExpression[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && calleeName(node) === name) {
        found.push(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return found;
  };

  const insideCallTo = (node: ts.Node, name: string): boolean => {
    for (let at = node.parent; at !== undefined; at = at.parent) {
      if (ts.isCallExpression(at) && calleeName(at) === name) return true;
    }
    return false;
  };

  it("installs the process guards as the first statement after the imports", () => {
    const first = source.statements.find(
      (statement) => !ts.isImportDeclaration(statement),
    );
    expect(
      first !== undefined &&
        ts.isExpressionStatement(first) &&
        ts.isCallExpression(first.expression) &&
        calleeName(first.expression) === "installProcessGuards",
      "installProcessGuards() must run before anything that can reject or " +
        "throw — otherwise Bun's default (exit, and nothing in Grafana) " +
        "applies to exactly the failures that happen first.",
    ).toBe(true);
  });

  it("registers the SDK's actor routes only through installActorRouteGuard", () => {
    const inits = callsNamed("init");
    expect(inits.length, "no server.actor.init() call found").toBeGreaterThan(
      0,
    );
    for (const init of inits) {
      expect(
        insideCallTo(init, "installActorRouteGuard"),
        "server.actor.init() registers deactivate/timer/reminder handlers " +
          "with no catch; called outside installActorRouteGuard, a throw in " +
          "any of them is an unhandled rejection and the host exits.",
      ).toBe(true);
    }
  });

  it("installs the route guard before boot() registers anything", () => {
    // The guard wraps `server.actor.init()`, which adds the routes Dapr calls
    // on every actor this host serves; `boot()` then registers and starts.
    const [guard] = callsNamed("installActorRouteGuard");
    const [booted] = callsNamed("boot");
    expect(guard, "no installActorRouteGuard() call").toBeDefined();
    expect(booted, "no boot() call").toBeDefined();
    expect((guard?.getStart() ?? 0) < (booted?.getStart() ?? 0)).toBe(true);
  });

  it("installs the method allow-list before DaprServer adds its body parsers and routes", () => {
    // `new DaprServer` registers the body parsers on this app, and
    // `server.actor.init()` the actor routes; Express matches in order. After
    // either, an undeclared method would be parsed — or dispatched — first.
    const [allowlist] = callsNamed("installActorMethodAllowlist");
    let daprServer: ts.NewExpression | undefined;
    const visit = (node: ts.Node): void => {
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "DaprServer"
      ) {
        daprServer = node;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(allowlist, "no installActorMethodAllowlist() call").toBeDefined();
    expect(daprServer, "no new DaprServer(...)").toBeDefined();
    expect(
      (allowlist?.getStart() ?? Number.POSITIVE_INFINITY) <
        (daprServer?.getStart() ?? 0),
    ).toBe(true);
    const [registry] = allowlist?.arguments.slice(1) ?? [];
    expect(registry?.getText(source)).toBe("ACTOR_REGISTRY");
  });

  it("checks the sidecar's app token first of all the gates", () => {
    // Before the allow-list, so a caller without the token learns nothing —
    // not even which method names exist — and before DaprServer's parsers.
    const [token] = callsNamed("installDaprAppTokenCheck");
    const [allowlist] = callsNamed("installActorMethodAllowlist");
    expect(token, "no installDaprAppTokenCheck() call").toBeDefined();
    expect(
      (token?.getStart() ?? Number.POSITIVE_INFINITY) <
        (allowlist?.getStart() ?? 0),
    ).toBe(true);
    expect(token?.arguments[1]?.getText(source)).toBe("config.appApiToken");
  });

  it("asserts hardened routing after the SDK's routes exist and before boot() listens", () => {
    // Express 4 routes case-insensitively and ignores a trailing slash unless
    // told otherwise, and the gates above read paths strictly; `/ACTORS/…`
    // walked past both (src/lib/host-app.ts). The assertion has to see the
    // SDK's routes, so it runs after installActorRouteGuard(); and it has to
    // stop a mis-built host before it serves, so before boot().
    const [assertion] = callsNamed("assertHardenedRouting");
    const [guard] = callsNamed("installActorRouteGuard");
    const [booted] = callsNamed("boot");
    expect(assertion, "no assertHardenedRouting() call").toBeDefined();
    expect(assertion?.arguments[0]?.getText(source)).toBe("app");
    expect(
      (guard?.getStart() ?? Number.POSITIVE_INFINITY) <
        (assertion?.getStart() ?? 0),
    ).toBe(true);
    expect(
      (assertion?.getStart() ?? Number.POSITIVE_INFINITY) <
        (booted?.getStart() ?? 0),
    ).toBe(true);
  });

  it("holds the app channel's idle connections open before boot() listens", () => {
    // `boot()` calls `server.start()`, which calls `app.listen`; replaced
    // after that, the server would already exist with the runtime's 5s idle
    // timeout, and every idle connection daprd reuses as it closes is a 500
    // this host never logs (src/lib/app-channel-connections.ts).
    const [hold] = callsNamed("holdIdleConnections");
    const [booted] = callsNamed("boot");
    expect(hold, "no holdIdleConnections() call").toBeDefined();
    expect(hold?.arguments[0]?.getText(source)).toBe("app");
    expect(
      (hold?.getStart() ?? Number.POSITIVE_INFINITY) <
        (booted?.getStart() ?? 0),
    ).toBe(true);
  });

  it("runs the boot preflight, awaited, on the actor pool and the real environment, before boot()", () => {
    // Otherwise a database db:migrate never reached boots fine and fails at
    // query time, and a published dev token serves in production
    // (src/lib/boot-preflight.ts). A call nobody awaits would not stop the
    // host starting, so it is awaited at the top level.
    const [preflight] = callsNamed("bootPreflight");
    const [booted] = callsNamed("boot");
    const [envelope] = callsNamed("installActorErrorEnvelope");
    expect(preflight, "no bootPreflight() call").toBeDefined();
    expect(preflight?.arguments.map((a) => a.getText(source))).toEqual([
      "actorDb()",
      "process.env",
    ]);
    expect(
      preflight !== undefined && ts.isAwaitExpression(preflight.parent),
      "bootPreflight() must be awaited",
    ).toBe(true);
    expect(
      preflight?.parent.parent !== undefined &&
        ts.isExpressionStatement(preflight.parent.parent) &&
        preflight.parent.parent.parent === source,
      "bootPreflight() must be a top-level statement",
    ).toBe(true);
    expect(
      (preflight?.getStart() ?? Number.POSITIVE_INFINITY) <
        (envelope?.getStart() ?? 0),
    ).toBe(true);
    expect(
      (preflight?.getStart() ?? Number.POSITIVE_INFINITY) <
        (booted?.getStart() ?? 0),
    ).toBe(true);
  });

  it("listens for the pool's idle-client errors", () => {
    const listeners = callsNamed("on").filter((call) => {
      const [event] = call.arguments;
      return (
        event !== undefined &&
        ts.isStringLiteral(event) &&
        event.text === "error" &&
        call.expression.getText(source).includes("$client")
      );
    });
    expect(
      listeners,
      "pg-pool emits an idle client's failure as an `error` event; with no " +
        "listener that is thrown, and the host exits.",
    ).toHaveLength(1);
  });
});
