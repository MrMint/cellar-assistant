/**
 * Every event `services/api` emits — name, severities, attributes — as plain
 * data. `events.ts` emits only these (its `emitCataloged` is typed over this
 * table), and the actor host's `events.test.ts` checks every Grafana rule that
 * selects `{service_name="api"}` against it, the same way it checks the
 * actors' rules against `services/actors/src/lib/events.ts`.
 *
 * Plain data with no imports, on purpose: that test lives in `services/actors`
 * and reads this file, and `services/actors` must not pull in the API's
 * runtime (`telemetry.ts` reads the environment). The severity union is
 * restated here rather than imported for the same reason; `events.ts` checks
 * the two agree.
 *
 * Loki stores every attribute with its dots turned into underscores:
 * `auth.reason` is filtered as `auth_reason`.
 */

type CatalogSeverity = "INFO" | "WARN" | "ERROR";

export type ApiEventSpec = {
  readonly severity: readonly CatalogSeverity[];
  readonly attributes: readonly string[];
};

export const API_EVENTS = {
  "actor.invocation_failed": {
    severity: ["ERROR"],
    attributes: [
      "request.id",
      "actor.type",
      "actor.method",
      "failure.kind",
      "http.status",
      "dapr.error_code",
      "failure.cause",
      "actor.app_status",
    ],
  },
  "api.boot": {
    severity: ["INFO"],
    attributes: [
      "api.version",
      "api.runtime",
      "api.graphiql",
      "api.cors_origins",
      "api.otlp",
      "auth.issuer",
      "auth.jwks_url",
      "dapr.sidecar",
    ],
  },
  "auth.token_rejected": {
    // INFO for `expired`, ERROR for `jwks_unavailable`, WARN otherwise.
    severity: ["INFO", "WARN", "ERROR"],
    attributes: ["request.id", "auth.reason", "error.name", "auth.claim"],
  },
  "graphql.limit_refused": {
    severity: ["WARN"],
    attributes: ["request.id", "limit.code", "graphql.operation_name"],
  },
  "graphql.unexpected_error": {
    severity: ["ERROR"],
    attributes: [
      "request.id",
      "graphql.operation_name",
      "graphql.operation_type",
      "graphql.field",
      "error.name",
      "error.count",
    ],
  },
  "telemetry.suppressed": {
    severity: ["WARN"],
    attributes: [
      "telemetry.event",
      "telemetry.class",
      "telemetry.suppressed",
      "telemetry.window_ms",
    ],
  },
} as const satisfies Record<string, ApiEventSpec>;

export type ApiEventName = keyof typeof API_EVENTS;
