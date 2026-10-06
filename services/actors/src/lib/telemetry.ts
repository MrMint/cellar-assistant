/**
 * Structured events, to stdout and to the stack's OTLP collector.
 *
 * The compose stack runs `grafana/otel-lgtm`, whose collector accepts OTLP over
 * HTTP on 4318 and routes logs into Loki. `service.name` is a *resource*
 * attribute and becomes the indexed label `service_name`; every other
 * attribute, `event.name` included, is a *log-record* attribute, which Loki
 * stores as **structured metadata**, not as a label. So the query goes after
 * the pipe:
 *
 * ```logql
 * {service_name="actors"} | event_name="outbox.dead_letter"
 * ```
 *
 * The stream-selector form, `{service_name="actors", event_name="…"}`, matches
 * nothing, silently — the header of
 * `infra/grafana/provisioning/alerting/outbox-and-actor-alerts.yaml` has the
 * measurement. Dots become underscores on the way in: `event.name` is queried
 * as `event_name`, `actor.type` as `actor_type`. That query is what makes A5's
 * "dead-letter is observable in Grafana" acceptance criterion a query rather
 * than a screenshot of a log tail.
 *
 * ## Why hand-rolled OTLP rather than the OpenTelemetry SDK
 *
 * One `fetch` of a JSON body against a documented, stable wire format, versus
 * five packages and a provider lifecycle to shut down cleanly on SIGTERM. When
 * `services/actors` wants real traces and metrics (E3), adopt the SDK and delete
 * this; the event names are what Grafana dashboards key on and they do not have
 * to change.
 *
 * ## Rules
 *
 * - **Never throws, never awaited on the hot path.** An observability backend
 *   that is down must not fail a delivery. Every failure is swallowed after the
 *   console line has already been written, so stdout is the durable copy.
 * - **Disabled unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set.** Vitest runs on the
 *   host, where `otel-lgtm` does not resolve; the console half still works.
 * - **No user input in an event.** Not in `message`, not in an attribute. The
 *   same rule as `services/api/src/events.ts`, for the same reason: an error's
 *   *message* quotes whatever failed, and for a `DrizzleQueryError` that is the
 *   whole SQL statement plus `params: <the value the client sent>`. Actor ids
 *   are user input too — an entity key is whatever id a client asked for, and
 *   a registry key is a brand name somebody typed. Use {@link errorAttributes}
 *   for a thrown value, and {@link boundedName} for anything else that has to
 *   name something.
 */

import type { Ctx } from "@cellar-assistant/contracts";
import type { EventAttributeKey, EventName, EventSeverity } from "./events.ts";

export type Severity = "INFO" | "WARN" | "ERROR";

/**
 * `ctx.requestId`, for a log line or for carrying one correlation id across a
 * hop — **the one sanctioned read of it in actor code** (`delivery.test.ts`
 * refuses any other under `src/actors`). It is correlation: an id to join log
 * lines on. It is not a delivery's identity (that is `ctx.delivery`,
 * `./delivery.ts`) and nothing may derive a key or a decision from it.
 */
export const correlationId = (ctx: Ctx): string => ctx.requestId;

/** OTLP `SeverityNumber` (spec: INFO 9, WARN 13, ERROR 17). */
const SEVERITY_NUMBER: Record<Severity, number> = {
  INFO: 9,
  WARN: 13,
  ERROR: 17,
};

/** An attribute value: a scalar, from a bounded set (see {@link Event}). */
export type AttributeValue = string | number | boolean;

/**
 * One event. `N` is a key of `EVENTS` (`./events.ts`) — **the catalog is the
 * only source of names** — and the severity and attribute keys are that
 * entry's. A name chosen at runtime between two literals (`terminal ?
 * "outbox.dead_letter" : "outbox.retry"`) is the union of both entries.
 */
export type Event<N extends EventName = EventName> = {
  /** Dotted name, e.g. `outbox.dead_letter`. Becomes the `event_name` label. */
  readonly name: N;
  readonly severity: EventSeverity<N>;
  /** The log line itself. Keep it greppable and short. */
  readonly message: string;
  /**
   * Extra attributes. Scalars only, from bounded sets — they become Loki
   * structured metadata, one entry per attribute per line, and an unbounded
   * value (a payload, a stack trace, an id a client chose) is paid for on
   * every line that carries it. Keys are the catalog entry's; an alert rule
   * filters on them, so `events.test.ts` holds both to it.
   */
  readonly attributes?: Readonly<
    Partial<Record<EventAttributeKey<N>, AttributeValue>>
  >;
  /**
   * Written to stdout after the line, and **never exported**. For a thrown
   * value's stack frames (see {@link stackFrames}): code locations, which are
   * what makes an `actor.unexpected_error` fixable, but multi-line and long,
   * which makes them the wrong shape for a Loki line. Holds no message text.
   */
  readonly localDetail?: string;
};

/* -------------------------------------------------------------------------- */
/* Sanitising                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A class name, method name or code, or `fallback` if `value` does not look
 * like one. The same shape `services/api/src/events.ts` accepts, so the two
 * services' attributes join.
 */
export const boundedName = (value: unknown, fallback = "unknown"): string =>
  typeof value === "string" && /^[A-Za-z0-9_.$-]{1,64}$/.test(value)
    ? value
    : fallback;

/**
 * A code as the thrower meant it: a Postgres SQLSTATE (`22P02`, `57P01`), a
 * Node system error (`ECONNREFUSED`) — never free text. Read off the error or,
 * for a wrapper such as `DrizzleQueryError`, off its `cause`, which is where
 * the `pg` error carrying the SQLSTATE sits.
 */
const errorCode = (error: unknown): string | null => {
  for (const candidate of [error, (error as { cause?: unknown })?.cause]) {
    const code = (candidate as { code?: unknown } | null)?.code;
    if (typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code)) return code;
  }
  return null;
};

const className = (value: unknown): string | null => {
  if (value instanceof Error) return boundedName(value.name);
  if (value === undefined || value === null) return null;
  return typeof value === "object" ? "object" : typeof value;
};

/**
 * What an event may say about a thrown value: its class, its code, and its
 * cause's class. **Never its message** — see the module rules.
 *
 * For the query that took the actor host down (`DrizzleQueryError` around a
 * `pg` `DatabaseError`, SQLSTATE `22P02`, "invalid input syntax for type
 * uuid") that is `{ error.name: DrizzleQueryError, error.code: 22P02,
 * error.cause: error }` — enough to name the fault, with none of the SQL and
 * none of the value the client sent.
 */
export type ErrorAttributes = {
  readonly "error.name": string;
  readonly "error.code"?: string;
  readonly "error.cause"?: string;
};

export const errorAttributes = (error: unknown): ErrorAttributes => {
  const code = errorCode(error);
  const cause = className((error as { cause?: unknown } | null)?.cause);
  return {
    "error.name": className(error) ?? "unknown",
    ...(code === null ? {} : { "error.code": code }),
    ...(cause === null ? {} : { "error.cause": cause }),
  };
};

/**
 * A thrown value's stack frames, and nothing else: the `at …` lines, without
 * the message that heads `error.stack` (and can run to several lines — a
 * Drizzle message is the SQL, then `params: …`). For {@link Event.localDetail}.
 */
export const stackFrames = (error: unknown): string | undefined => {
  const stack = (error as { stack?: unknown } | null)?.stack;
  if (typeof stack !== "string") return undefined;
  const frames = stack
    .split("\n")
    .filter((line) => /^\s+at /.test(line))
    .slice(0, 12);
  return frames.length === 0 ? undefined : frames.join("\n");
};

const endpoint = (): string =>
  (process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "").replace(/\/$/, "");

const serviceName = (): string => process.env.OTEL_SERVICE_NAME ?? "actors";

const attribute = (
  key: string,
  value: string | number | boolean,
): Record<string, unknown> => {
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { key, value: { intValue: value } }
      : { key, value: { doubleValue: value } };
  }
  if (typeof value === "boolean") return { key, value: { boolValue: value } };
  return { key, value: { stringValue: value } };
};

const body = <N extends EventName>(event: Event<N>): string =>
  JSON.stringify({
    resourceLogs: [
      {
        resource: { attributes: [attribute("service.name", serviceName())] },
        scopeLogs: [
          {
            scope: { name: "cellar.actors" },
            logRecords: [
              {
                timeUnixNano: `${Date.now() * 1_000_000}`,
                severityNumber: SEVERITY_NUMBER[event.severity],
                severityText: event.severity,
                body: { stringValue: event.message },
                attributes: [
                  attribute("event.name", event.name),
                  ...Object.entries(
                    (event.attributes ?? {}) as Record<
                      string,
                      AttributeValue | undefined
                    >,
                  ).flatMap(([k, v]) =>
                    v === undefined ? [] : [attribute(k, v)],
                  ),
                ],
              },
            ],
          },
        ],
      },
    ],
  });

/** Write the console line, then post; the promise settles when the post does. */
const send = <N extends EventName>(event: Event<N>): Promise<void> => {
  const detail =
    event.attributes === undefined
      ? ""
      : ` ${JSON.stringify(event.attributes)}`;
  const local = event.localDetail === undefined ? "" : `\n${event.localDetail}`;
  const line = `[${event.name}] ${event.message}${detail}${local}`;
  if (event.severity === "ERROR") console.error(line);
  else if (event.severity === "WARN") console.warn(line);
  else console.log(line);

  const target = endpoint();
  if (target === "") return Promise.resolve();
  return fetch(`${target}/v1/logs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body(event),
    signal: AbortSignal.timeout(2_000),
  }).then(
    () => undefined,
    () => {
      // Deliberately silent: a second console line per dropped event would
      // turn a collector outage into a log flood.
    },
  );
};

/**
 * Record an event. Returns immediately; the OTLP post is fire-and-forget.
 *
 * The console line goes out first and unconditionally: if the collector is
 * unreachable, `docker compose logs actors` is still the record of what
 * happened.
 */
export const emit = <N extends EventName>(event: Event<N>): void => {
  void send(event);
};

/**
 * {@link emit}, but resolves once the OTLP post has finished or given up (2s at
 * most). Never rejects. For the one caller that is about to `process.exit`,
 * which would otherwise kill the post in flight and leave Grafana blind to
 * exactly the event that most needs seeing: why the host went down.
 */
export const emitAndFlush = <N extends EventName>(
  event: Event<N>,
): Promise<void> => send(event);
