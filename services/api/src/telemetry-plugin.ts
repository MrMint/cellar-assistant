/**
 * The Yoga plugin that turns GraphQL-level failures into events. Two hooks,
 * because the two failures are visible at different moments:
 *
 * - **Unexpected errors** are read in `onExecuteDone`, *before* masking. This
 *   plugin is registered in `plugins`, and Yoga appends its own
 *   `useMaskedErrors` after every user plugin, so the errors here still carry
 *   their original class. By `onExecutionResult` they are all
 *   `GraphQLError: Unexpected error.`.
 * - **Limit refusals** are read in `onExecutionResult`, which runs for every
 *   operation, including those that never execute because parse or validation
 *   refused them. Refusals are deliberate `GraphQLError`s, so masking never
 *   touches them.
 *
 * ## Why limits are recognised by code, not hooked in `limits.ts`
 *
 * `limits.ts` states each refusal as a `GraphQLError` with an
 * `extensions.code` (`QUERY_TOO_DEEP`, `QUERY_TOO_WIDE`, …). That code is the
 * contract a client already reads. Keying on it here means a limit added,
 * moved or rewritten there is logged with no change to this file, as long as
 * its code keeps the `QUERY_TOO_` / `REQUEST_TOO_` shape.
 *
 * One refusal has no limit code of its own: graphql-js's `maxTokens` parse
 * bound, which throws a plain syntax error. Yoga then stamps it
 * `GRAPHQL_PARSE_FAILED` like any other syntax error. It is recognised by
 * graphql-js's exact message and logged as {@link PARSE_TOKEN_LIMIT_CODE}. If
 * `limits.ts` ever gives it a limit code, that code wins.
 */
import type { ExecutionResult } from "graphql";
import { GraphQLError, getOperationAST } from "graphql";
import { Logger, type Plugin } from "graphql-yoga";
import { errorClassOf, fieldOf, isMaskedError } from "./error-class.ts";
import { reportLimitRefused, reportUnexpectedErrors } from "./events.ts";
import { requestIdFor } from "./request-id.ts";

export const LIMIT_CODE_PATTERN = /^(QUERY|REQUEST)_TOO_[A-Z_]+$/;

/**
 * graphql-js's whole message (16 says "more that", sic; 17 says "more than"),
 * anchored at both ends so resolver text that merely quotes it cannot match.
 */
const PARSE_TOKEN_MESSAGE =
  /^Syntax Error: Document contains more tha[nt] \d+ tokens\. Parsing aborted\.$/;

/** What an uncoded `maxTokens` refusal is logged as. Not sent to clients. */
export const PARSE_TOKEN_LIMIT_CODE = "QUERY_TOO_MANY_TOKENS";

/** The limit an error reports, or `null` when it is not a limit refusal. */
export const limitCodeOf = (error: GraphQLError): string | null => {
  const code = error.extensions?.code;
  if (typeof code === "string" && LIMIT_CODE_PATTERN.test(code)) return code;
  const parseError = code === undefined || code === "GRAPHQL_PARSE_FAILED";
  return parseError && PARSE_TOKEN_MESSAGE.test(error.message)
    ? PARSE_TOKEN_LIMIT_CODE
    : null;
};

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
  typeof value === "object" && value !== null && Symbol.asyncIterator in value;

/** Yoga's context always carries the `Request`; the type does not say so here. */
const requestOf = (context: unknown): Request | null => {
  const request = (context as { request?: unknown } | null)?.request;
  return request instanceof Request ? request : null;
};

/* -------------------------------------------------------------------------- */
/* Yoga's own logger                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Errors already reported as `graphql.unexpected_error` with their request's
 * id — by {@link useTelemetry} during execution, or by `yoga.ts` when the
 * context factory throws. Yoga's masker hands the logger the very same
 * objects, so {@link redactingYogaLogger} can tell a duplicate by identity.
 */
const reported = new WeakSet<object>();

export const markReported = (error: unknown): void => {
  if (typeof error === "object" && error !== null) reported.add(error);
};

const fieldOfUnknown = (error: unknown): string =>
  error instanceof GraphQLError ? fieldOf(error) : "unknown";

/** Report a masked error, as the events' rules allow: its class, never its text. */
export const reportMasked = ({
  requestId,
  operationName,
  error,
}: {
  requestId: string;
  operationName: unknown;
  error: unknown;
}): void => {
  markReported(error);
  reportUnexpectedErrors({
    requestId,
    operationName,
    operationType: "unknown",
    errors: [{ errorName: errorClassOf(error), field: fieldOfUnknown(error) }],
  });
};

const reportLogged = (args: readonly unknown[]): void => {
  const fresh = args.filter(
    (arg) =>
      // Yoga logs whatever its masker *replaced*, and `yoga.ts` replaces an
      // `ActorError` too — with a copy that keeps its message and code. That
      // is a deliberate answer, not a failure, and is not reported.
      isMaskedError(arg) &&
      !(typeof arg === "object" && arg !== null && reported.has(arg)),
  );
  if (fresh.length === 0) return;
  reportUnexpectedErrors({
    // Yoga's logger is handed an error and nothing else: no request.
    requestId: "unknown",
    operationName: undefined,
    operationType: "unknown",
    errors: fresh.map((error) => ({
      errorName: errorClassOf(error),
      field: fieldOfUnknown(error),
    })),
  });
};

/**
 * The logger `yoga.ts` gives Yoga in place of its default.
 *
 * Yoga's default prints every error its masker replaces — message and stack —
 * and an `ActorInvocationError`'s message is
 * `<type>/<actor id>.<method> failed (<status>): <daprd body>`. An actor id can
 * be a barcode, a search term or an address, and daprd's body quotes it: the
 * very text `actor.invocation_failed` classifies instead of logging
 * (`events.ts`). So nothing Yoga logs is printed. An error it logs is reported
 * as `graphql.unexpected_error` — class name and field only — unless it was
 * already reported with its request id, which is the common case: the
 * telemetry plugin sees every execution error before the masker does.
 *
 * Since Yoga 6 the logger is a `@graphql-hive/logger` `Logger`, and Yoga's
 * core calls `log.error({ err })` (masked errors, and a thrown non-`Error`)
 * and `log.debug`/`log.info` (request chatter). This is a subclass rather
 * than a `LogWriter` because the base `log` serialises its attributes before
 * any writer sees them: a `GraphQLError` arrives as its `toJSON()` output,
 * with neither its class nor its identity, so neither redaction rule below
 * could be applied. Overriding `log` sees the arguments as Yoga passed them.
 * `warn` goes the same way as `error`, so a plugin's warning cannot print
 * text either; `trace`/`debug`/`info` are dropped. `child` returns this same
 * logger: Yoga's request-id plugin calls it on every request, and the base
 * `child` would build a plain, printing `Logger`.
 */
type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

/** The values a `log` call carries: an attrs object's values, then the rest. */
const loggedValues = (args: readonly unknown[]): unknown[] => {
  const [first, ...rest] = args;
  const head = typeof first === "function" ? (first as () => unknown)() : first;
  const values =
    typeof head === "object" &&
    head !== null &&
    !(head instanceof Error) &&
    Object.getPrototypeOf(head) === Object.prototype
      ? Object.values(head)
      : Array.isArray(head)
        ? head
        : [head];
  return [...values, ...rest];
};

class RedactingYogaLogger extends Logger {
  constructor() {
    super({ level: "warn" });
  }

  override child(): Logger {
    return this;
  }

  override log(level: LogLevel, ...args: unknown[]): void {
    if (level === "warn" || level === "error") reportLogged(loggedValues(args));
  }
}

export const redactingYogaLogger: Logger = new RedactingYogaLogger();

export const useTelemetry = (): Plugin => ({
  onExecute({ args }) {
    return {
      onExecuteDone({ result }) {
        if (isAsyncIterable(result)) return;
        const masked = ((result as ExecutionResult).errors ?? []).filter(
          isMaskedError,
        );
        if (masked.length === 0) return;
        for (const error of masked) markReported(error);
        const request = requestOf(args.contextValue);
        const operation = getOperationAST(
          args.document,
          args.operationName ?? undefined,
        );
        reportUnexpectedErrors({
          requestId: request === null ? "unknown" : requestIdFor(request),
          operationName: operation?.name?.value,
          operationType: operation?.operation ?? "unknown",
          errors: masked.map((error) => ({
            errorName: errorClassOf(error),
            field: fieldOf(error),
          })),
        });
      },
    };
  },

  onExecutionResult({ result, request, context }) {
    if (result === undefined || isAsyncIterable(result)) return;
    const codes = new Set<string>();
    for (const error of result.errors ?? []) {
      const code = limitCodeOf(error);
      if (code !== null) codes.add(code);
    }
    if (codes.size === 0) return;
    const requestId = requestIdFor(request);
    for (const code of codes) {
      reportLimitRefused({
        requestId,
        code,
        // The client's `operationName` parameter: a refused document may never
        // have been parsed, so there is no AST to read a name from.
        operationName: context.params?.operationName,
      });
    }
  },
});
