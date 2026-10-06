/**
 * Which errors a client is told about, and which are masked. The masker in
 * `yoga.ts` and the telemetry plugin both use this, so "masked" and "logged as
 * unexpected" cannot drift apart.
 */
import type { ActorError } from "@cellar-assistant/contracts";
import { isActorError } from "@cellar-assistant/contracts";
import { GraphQLError } from "graphql";

/**
 * The thrown error, or the one graphql-js wrapped. A resolver's error is always
 * wrapped, so the direct `instanceof` alone matched only errors reconstructed
 * from the Dapr envelope (A7c (6), see `yoga.ts`).
 */
export const asActorError = (error: unknown): ActorError | null => {
  if (isActorError(error)) return error;
  const original = (error as { originalError?: unknown } | null)?.originalError;
  return isActorError(original) ? original : null;
};

/**
 * Yoga's own test for "raised on purpose": a `GraphQLError` all the way down
 * its `originalError` chain. Reimplemented, not imported, because
 * graphql-yoga does not export it. It is five lines; the test in
 * `telemetry-wiring.test.ts` would catch a divergence.
 */
const isOriginalGraphQLError = (error: unknown): boolean => {
  if (!(error instanceof GraphQLError)) return false;
  return error.originalError == null
    ? true
    : isOriginalGraphQLError(error.originalError);
};

/**
 * True for exactly the errors the masker replaces with "Unexpected error.":
 * not an `ActorError`, and not a `GraphQLError` something raised deliberately
 * (a validation failure, the 401 from the context factory).
 */
export const isMaskedError = (error: unknown): boolean =>
  asActorError(error) === null && !isOriginalGraphQLError(error);

/**
 * The innermost thrown object's class name. Never its message.
 *
 * `name` first, because most error classes set it (`ActorInvocationError`,
 * `DrizzleQueryError`). A subclass that forgets still reports `Error`, and
 * then its constructor's name is the better answer.
 */
export const errorClassOf = (error: unknown): string => {
  let current: unknown = error;
  while (current instanceof GraphQLError && current.originalError != null) {
    current = current.originalError;
  }
  if (current instanceof Error) {
    if (current.name !== "" && current.name !== "Error") return current.name;
    return current.constructor?.name ?? "Error";
  }
  return current === null ? "null" : typeof current;
};

/**
 * The failing field's name in the schema: from the AST node, so an alias
 * cannot put client text here. `unknown` for an error with no field node.
 */
export const fieldOf = (error: GraphQLError): string => {
  const node = error.nodes?.[0];
  return node !== undefined && node.kind === "Field"
    ? node.name.value
    : "unknown";
};
