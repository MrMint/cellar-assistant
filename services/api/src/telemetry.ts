/**
 * Structured events, to stdout and to the stack's OTLP collector.
 *
 * **A mirror of `services/actors/src/lib/telemetry.ts`, on purpose.** Same wire
 * format, same rules, same event shape, so one Grafana query style reads both
 * services and only `service_name` differs:
 *
 * ```logql
 * {service_name="api"} | event_name="graphql.unexpected_error"
 * ```
 *
 * `event_name` goes **after the pipe**. It is an OTLP *log-record* attribute,
 * which Loki stores as structured metadata rather than as an indexed label, so
 * `{service_name="api", event_name="…"}` matches nothing, silently
 * (docs/architecture/target-stack.md §7, and the header of
 * `infra/grafana/provisioning/alerting/outbox-and-actor-alerts.yaml`). The
 * actors module's own header still gives the stream-selector form. Do not copy
 * it. Every attribute's dots become underscores on the way in: `event.name`
 * becomes `event_name`, and `auth.reason` becomes `auth_reason`.
 *
 * The event catalogue, with what each attribute means, is `events.ts`. This file
 * is only the exporter.
 *
 * ## Why a copy and not a shared package
 *
 * The only workspace package both services already depend on is
 * `@cellar-assistant/contracts`, and that is the *wire contract* between them:
 * actor interfaces, `Ctx`, the error envelope. An exporter that reads
 * `process.env` and calls `fetch` is not a contract, and putting it there would
 * be the first thing in that package with a side effect. It is also 60 lines
 * with no dependencies. `services/api` must not import `services/actors`. So
 * each service keeps its own copy until E3 adopts the OpenTelemetry SDK and
 * deletes both. What must stay identical is the wire shape: the resource
 * `service.name`, the `event.name` attribute, and the severity numbers.
 * `telemetry.test.ts` pins those.
 *
 * ## Rules (unchanged from actors)
 *
 * - **Never throws, never awaited on the hot path.** An observability backend
 *   that is down must not fail a request. Every failure is swallowed after the
 *   console line has already been written, so stdout is the durable copy.
 * - **Disabled unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set.** Vitest runs on the
 *   host, where `otel-lgtm` does not resolve. Compose sets it to
 *   `http://otel-lgtm:4318` and `OTEL_SERVICE_NAME` to `api`.
 * - **Attributes are scalars with bounded values.** This process faces the
 *   internet, which the actor host does not. So no attribute here may carry
 *   anything a client chose freely: no variables, no tokens, no error
 *   *messages* (an actor's message can quote user input back), and no raw
 *   header values. `events.ts` is the only caller, and it sanitises.
 */

export type Severity = "INFO" | "WARN" | "ERROR";

/** OTLP `SeverityNumber` (spec: INFO 9, WARN 13, ERROR 17). */
const SEVERITY_NUMBER: Record<Severity, number> = {
  INFO: 9,
  WARN: 13,
  ERROR: 17,
};

export type Event = {
  /** Dotted name, e.g. `graphql.unexpected_error`. Becomes `event_name`. */
  readonly name: string;
  readonly severity: Severity;
  /** The log line itself. Keep it greppable and short, and free of user input. */
  readonly message: string;
  /** Extra attributes. Scalars only, bounded values only. See the rules above. */
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
};

const endpoint = (): string =>
  (process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "").replace(/\/$/, "");

const serviceName = (): string => process.env.OTEL_SERVICE_NAME ?? "api";

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

const body = (event: Event): string =>
  JSON.stringify({
    resourceLogs: [
      {
        resource: { attributes: [attribute("service.name", serviceName())] },
        scopeLogs: [
          {
            scope: { name: "cellar.api" },
            logRecords: [
              {
                timeUnixNano: `${Date.now() * 1_000_000}`,
                severityNumber: SEVERITY_NUMBER[event.severity],
                severityText: event.severity,
                body: { stringValue: event.message },
                attributes: [
                  attribute("event.name", event.name),
                  ...Object.entries(event.attributes ?? {}).map(([k, v]) =>
                    attribute(k, v),
                  ),
                ],
              },
            ],
          },
        ],
      },
    ],
  });

/**
 * Record an event. Returns immediately; the OTLP post is fire-and-forget.
 *
 * The console line goes out first and unconditionally: if the collector is
 * unreachable, `docker compose logs api` is still the record of what happened.
 */
export const emit = (event: Event): void => {
  const detail =
    event.attributes === undefined
      ? ""
      : ` ${JSON.stringify(event.attributes)}`;
  const line = `[${event.name}] ${event.message}${detail}`;
  if (event.severity === "ERROR") console.error(line);
  else if (event.severity === "WARN") console.warn(line);
  else console.log(line);

  const target = endpoint();
  if (target === "") return;
  try {
    void fetch(`${target}/v1/logs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body(event),
      signal: AbortSignal.timeout(2_000),
    }).catch(() => {
      // Deliberately silent: a second console line per dropped event would turn
      // a collector outage into a log flood.
    });
  } catch {
    // A malformed endpoint makes `fetch` throw synchronously in some runtimes
    // rather than reject. The rule is "never throws", not "never rejects".
  }
};
