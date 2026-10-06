# services/api

The GraphQL API (graphql-yoga + Pothos). It holds no database credentials and
reaches the domain only through Dapr actor invocations. The code comments in
`src/` carry the detail; this file only lists what an operator needs from
outside.

## Telemetry

Structured events go to stdout always, and to the stack's OTLP collector
(`otel-lgtm` → Loki) when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Compose sets it
to `http://otel-lgtm:4318`, with `OTEL_SERVICE_NAME=api`. The exporter
(`src/telemetry.ts`) mirrors `services/actors/src/lib/telemetry.ts`, so both
services are queried the same way. `event_name` goes **after the pipe**,
because it is structured metadata and not a stream label:

```logql
{service_name="api"} | event_name="auth.token_rejected" | auth_reason="jwks_unavailable"
```

Attribute dots become underscores in Loki (`request.id` → `request_id`). No
event carries GraphQL variables, tokens, header values, actor ids or error
messages. Error *classes* and codes only. The catalogue, with the reasoning, is
`src/events.ts`.

| `event_name` | Severity | Attributes | Fires when |
| --- | --- | --- | --- |
| `api.boot` | INFO | `api.version`, `api.runtime`, `api.graphiql`, `api.cors_origins`, `api.otlp`, `auth.issuer`, `auth.jwks_url`, `dapr.sidecar` | Once per process, when the server is listening. `api.version` is the root `package.json` version, or `unknown` in the production image, which does not copy that file. |
| `graphql.unexpected_error` | ERROR | `request.id`, `graphql.operation_name`, `graphql.operation_type`, `graphql.field`, `error.name`, `error.count` | A resolver error that the client sees as "Unexpected error.". One event per `(error.name, graphql.field)` in a response. Also emitted when the **context factory** throws something unexpected: that fails before any resolver runs, so it is reported from `createApiYoga`'s context wrapper while the request id is still in hand, with `graphql.field` = `unknown`. And any other error Yoga's masker replaced and would have logged itself is reported here instead of printed — class and field only, never its message, since an `ActorInvocationError`'s message quotes the actor id and daprd's body — with `request.id` = `unknown`, because Yoga hands its logger the error alone (`yoga.ts`, `telemetry-plugin.ts`). |
| `auth.token_rejected` | by reason | `request.id`, `auth.reason`, `error.name`, and `auth.claim` when the reason is `claim_invalid` | A token was presented and refused (the 401). `auth.reason` is one of `expired` (INFO), `bad_signature`, `unknown_kid`, `claim_invalid`, `malformed`, `alg_not_allowed`, `no_subject`, `other` (WARN), or `jwks_unavailable` (ERROR: the key set could not be fetched, so every signed-in request is failing). A missing token is anonymous and is not logged. |
| `graphql.limit_refused` | WARN | `request.id`, `limit.code`, `graphql.operation_name` | A request refused by a cost limit. `limit.code` is the refusal's `extensions.code` (`QUERY_TOO_DEEP`, `QUERY_TOO_WIDE`, `QUERY_TOO_COMPLEX`, `QUERY_TOO_LARGE`, `QUERY_TOO_EXPENSIVE`, `REQUEST_TOO_LARGE`), or `QUERY_TOO_MANY_TOKENS` for the parser's token bound, which has no code of its own. One event per distinct code. |
| `actor.invocation_failed` | ERROR | `request.id`, `actor.type`, `actor.method`, `failure.kind`; for a `status` failure also `http.status`, `dapr.error_code`, `failure.cause`, and `actor.app_status` when the cause is `app_error` | A sidecar call failed with something other than a typed actor error. `failure.kind` is `status`, `timeout` or `network`. For `status`, the body is classified, never logged (daprd quotes the actor id in it): `dapr.error_code` is daprd's `errorCode` (`ERR_ACTOR_INVOKE_METHOD`, …) or `none`, and `failure.cause` is one of `app_error` (the actor host answered non-2xx — a 500 is its opaque envelope, logged there as `actor.unexpected_error` under the same `request_id`), `app_channel_closed` (daprd lost its connection to the host mid-call; the host logged nothing), `app_unreachable`, `method_not_found`, `placement`, `deadline`, `unrecognised`. The same request normally also produces a `graphql.unexpected_error`, which you can join on `request_id`. |
| `telemetry.suppressed` | WARN | `telemetry.event`, `telemetry.class`, `telemetry.suppressed`, `telemetry.window_ms` | Every event except `api.boot` is capped at 50 per minute per `(event, class)`. The class is the reason, code, error name or actor method. This event reports how many were dropped, just before the next one that goes through. |

`request.id` is the client's `x-request-id` when it is 1–64 characters of
`[A-Za-z0-9_-]`, and a fresh UUID otherwise (`src/request-id.ts`). The same
value is passed to the actors as `ctx.requestId`.
