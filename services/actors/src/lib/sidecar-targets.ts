/**
 * Which actor types a module reaches through the sidecar — read from the
 * actor host's program, for the static §8.5 call-graph tests
 * (`no-external-calls.test.ts`, the job actors' and `RecipeActor`'s own
 * fences).
 *
 * Test support only; nothing in the host imports it. It exists so the four
 * fences that used to carry their own copy of "first string argument of every
 * `invokeActorMethod(...)`" read the typed client the same way:
 *
 *  - `internal(ctx)(XActorDescriptor, id)` — the argument is resolved by
 *    symbol to the descriptor `@cellar-assistant/contracts` exports, whatever
 *    it is called here (a renamed import, a namespace member), and the actor
 *    type is that descriptor's own `actorType`; a descriptor whose *type*
 *    pins `actorType` to literals is read from the type;
 *  - `invokeActorMethod("XActor", …)` — the outbox's dynamic hop, kept so a
 *    literal target is still read if one ever comes back.
 *
 * Both functions are found by symbol (`@cellar-assistant/analysis`), not by
 * name. Anything the scan cannot read — a descriptor whose `actorType` is not
 * a literal, `internal(ctx)` stored before it is called, either function
 * passed as a value — is reported as `<…>` rather than dropped, so an
 * unreadable target fails a fence instead of vanishing from it.
 */

import {
  callOf,
  findCalls,
  firstLineOf,
  literalValues,
  type Project,
  propertyLiterals,
  referencedSymbol,
  unwrapExpression,
} from "@cellar-assistant/analysis";
import * as contracts from "@cellar-assistant/contracts";
import ts from "typescript";
import {
  ACTORS_SRC,
  actorsProject,
  CONTRACTS_SRC,
} from "./analysis-testing.ts";

const INTERNAL = {
  module: `${ACTORS_SRC}/lib/internal-client.ts`,
  name: "internal",
};
const INVOKE = {
  module: `${ACTORS_SRC}/lib/sidecar.ts`,
  name: "invokeActorMethod",
};

/** The contracts descriptor `node` names, by symbol, and its `actorType`. */
const descriptorActorType = (
  checker: ts.TypeChecker,
  node: ts.Expression,
): string | undefined => {
  const expression = unwrapExpression(node);
  const name = ts.isPropertyAccessExpression(expression)
    ? expression.name
    : expression;
  if (!ts.isIdentifier(name)) return undefined;
  const symbol = referencedSymbol(checker, name);
  const declaration = symbol?.valueDeclaration;
  if (
    symbol === undefined ||
    declaration === undefined ||
    !declaration.getSourceFile().fileName.startsWith(`${CONTRACTS_SRC}/`)
  ) {
    return undefined;
  }
  const value = (contracts as Record<string, unknown>)[symbol.name];
  const actorType = (value as { actorType?: unknown } | undefined)?.actorType;
  return typeof actorType === "string" ? actorType : undefined;
};

const stringsOr = (
  values: readonly unknown[] | null,
  fallback: string,
): string[] =>
  values !== null &&
  values.length > 0 &&
  values.every((value) => typeof value === "string")
    ? (values as string[])
    : [fallback];

/**
 * The actor types `source` reaches, one entry per call site (a union-typed
 * descriptor contributes each of its types). `source` must be a file of
 * `project` — the actor host's by default.
 */
export const sidecarTargetsOf = (
  source: ts.SourceFile,
  project: Project = actorsProject(),
): string[] => {
  const { checker } = project;
  const { calls, refusals } = findCalls(project, [INTERNAL, INVOKE], {
    rule: "sidecar/unreadable",
    files: [source],
    allowReexports: true,
  });
  const targets: string[] = [];
  for (const site of calls) {
    const first = site.args[0];
    if (site.target === INVOKE.name) {
      targets.push(
        ...stringsOr(
          first === undefined ? null : literalValues(checker, first),
          `<not a literal: ${firstLineOf(first)}>`,
        ),
      );
      continue;
    }
    // `internal(ctx)` returns the client; the hop is the call of *that*.
    const hop = callOf(site.call as ts.Expression);
    const descriptor =
      hop !== undefined && "arguments" in hop ? hop.arguments?.[0] : undefined;
    if (hop === undefined) {
      targets.push(`<not called directly: ${firstLineOf(site.call)}>`);
      continue;
    }
    const byContract =
      descriptor === undefined
        ? undefined
        : descriptorActorType(checker, descriptor);
    if (byContract !== undefined) {
      targets.push(byContract);
      continue;
    }
    targets.push(
      ...stringsOr(
        descriptor === undefined
          ? null
          : propertyLiterals(
              checker,
              checker.getTypeAtLocation(unwrapExpression(descriptor)),
              "actorType",
            ),
        `<not a descriptor: ${firstLineOf(descriptor)}>`,
      ),
    );
  }
  for (const refusal of refusals) {
    targets.push(`<unreadable: ${refusal.message}>`);
  }
  return targets;
};
