/**
 * The one transport to an actor through a Dapr sidecar's HTTP actor API, and
 * the rules for reading what comes back.
 *
 * Both callers use {@link invokeActorOverSidecar}: `services/api/src/dapr.ts`
 * (resolver → actor) and `services/actors/src/lib/sidecar.ts` (outbox and
 * actor → actor). They used to be two hand-written `fetch` calls, and they
 * drifted twice. The actors' transport learned the `void`-body rule below from
 * a measured dead-letter storm while the API's kept `JSON.parse`, so a
 * successful `Mutation.deleteFile` answered "Unexpected error." for a row it
 * had just removed (shared since 1d83efea). And the API built its URL without
 * encoding the actor type or method name while the actors' encoded all three
 * segments — harmless for today's identifiers, and exactly the kind of
 * difference that stays harmless until it is not. There is one URL builder
 * and one response rule now; what each caller adds around them (the API's
 * failure telemetry, the actors' typed client) is its own.
 *
 * Neither caller uses `@dapr/dapr`'s actor client, and the reason is not the
 * one this comment used to give. The client does not need the concrete actor
 * class: `ActorProxyBuilder` reads only `.name` (3.18.0,
 * `actors/client/ActorProxyBuilder.js:34`), so a stub class — or a string
 * target from an outbox row — works. The reasons are the ones
 * `docs/architecture/dapr-sdk-gaps.md` measures: a typed actor error arrives
 * as a 200 with `X-Daprerrorresponseheader` and the client resolves it as the
 * call's result (G1, `HTTPClient.js:422-431`); there is no per-call timeout or
 * `AbortSignal` (G2, `HTTPClient.js:388-411`), which {@link
 * invokeActorOverSidecar}'s `timeoutMs` exists for; the proxy traps every
 * property, so `await proxy` invokes a remote method named `then` (G3); and
 * each builder news a client that waits on sidecar health (G4). The sidecar
 * endpoint is stable and documented
 * (https://docs.dapr.io/reference/api/actors_api/) and is what the SDK calls
 * underneath. Arguments go as a JSON array; Dapr's JS `ActorManager` spreads
 * an array body across the method's parameters, so `ctx` arrives first
 * (§8.2).
 */
import {
  DAPR_ERROR_RESPONSE_HEADER,
  parseActorErrorPayload,
} from "./errors.ts";

/**
 * A failed invocation whose body is not one of the typed `ActorError`s —
 * an infrastructure failure: no such actor type, a crash in the host, a
 * sidecar that could not place the actor.
 */
export class SidecarError extends Error {
  readonly status: number;
  /** The whole response body. The message carries at most 500 characters. */
  readonly body: string;

  constructor(what: string, status: number, body: string) {
    super(`${what} failed (${status}): ${body.slice(0, 500)}`);
    this.name = "SidecarError";
    this.status = status;
    this.body = body;
  }
}

/**
 * The header a caller of a sidecar's HTTP API presents when that sidecar was
 * started with `DAPR_API_TOKEN` (Dapr's "API token authentication"; daprd
 * answers `401 invalid api token` without it, `GET /v1.0/healthz` excepted).
 * The sidecar sends the *app* token to its app under the same name.
 */
export const DAPR_API_TOKEN_HEADER = "dapr-api-token";

export type SidecarInvocation = {
  /** The sidecar's API root, e.g. `http://localhost:3500/v1.0`. */
  readonly baseUrl: string;
  readonly actorType: string;
  readonly actorId: string;
  readonly method: string;
  /** Spread across the method's parameters; `ctx` first (§8.2). */
  readonly args: readonly unknown[];
  /** Bounds the whole call, body included. */
  readonly timeoutMs: number;
  /**
   * The sidecar's API token (`DAPR_API_TOKEN`), sent as
   * {@link DAPR_API_TOKEN_HEADER}. Empty or absent sends no header — the
   * right thing for a sidecar started without one, and a `401` from one
   * started with one.
   */
  readonly apiToken?: string;
};

/** The headers every call to a sidecar's API carries. */
export const sidecarHeaders = (
  apiToken: string | undefined,
  extra: Record<string, string> = {},
): Record<string, string> => ({
  ...extra,
  ...(apiToken === undefined || apiToken === ""
    ? {}
    : { [DAPR_API_TOKEN_HEADER]: apiToken }),
});

/** `…/actors/<type>/<id>/method/<method>`, every segment encoded. */
export const actorMethodUrl = (
  baseUrl: string,
  actorType: string,
  actorId: string,
  method: string,
): string =>
  `${baseUrl}/actors/${encodeURIComponent(actorType)}/` +
  `${encodeURIComponent(actorId)}/method/${encodeURIComponent(method)}`;

/**
 * Invoke `actorType/actorId.method(...args)` and return what it returned.
 *
 * Three ways out, and callers branch on which:
 *
 *  - **a typed `ActorError`** (`NotFoundError`, `ConflictError`, …) when the
 *    actor threw one. Dapr signals an application-level failure with
 *    `DAPR_ERROR_RESPONSE_HEADER` and leaves the status at **200**, so
 *    `response.ok` is not "it worked" — an outbox delivery to a target that
 *    threw `NotFoundError` would otherwise be booked as delivered, and a
 *    resolver would be handed `{ code, message }` as its payload.
 *  - **a {@link SidecarError}** for any other failed response.
 *  - **whatever `fetch` threw** — a network failure, or `AbortSignal.timeout`'s
 *    `TimeoutError` — untouched, so a caller can tell "never heard back" from
 *    "heard back: no".
 */
export const invokeActorOverSidecar = async (
  request: SidecarInvocation,
): Promise<unknown> => {
  const { actorType, actorId, method } = request;
  const response = await fetch(
    actorMethodUrl(request.baseUrl, actorType, actorId, method),
    {
      method: "POST",
      headers: sidecarHeaders(request.apiToken, {
        "content-type": "application/json",
      }),
      body: JSON.stringify(request.args),
      signal: AbortSignal.timeout(request.timeoutMs),
    },
  );
  const text = await response.text();
  if (!response.ok || response.headers.has(DAPR_ERROR_RESPONSE_HEADER)) {
    const typed = parseActorErrorPayload(text);
    if (typed !== null) throw typed;
    throw new SidecarError(
      `${actorType}/${actorId}.${method}`,
      response.status,
      text,
    );
  }
  return parseInvocationResult(text);
};

/**
 * A successful invocation's body, as a value.
 *
 * `JSON.parse(text)` is not enough. Dapr's JS actor host serializes a `void`
 * return as the literal four-letter body `undefined` (with a `text/html`
 * content type), which is not JSON. `FileActor.delete(ctx): Promise<void>` is
 * the method that exposed it, on both transports:
 *
 *  - **outbox** — once `MaintenanceActor` was scheduled and started delivering
 *    `FileActor.delete`, `JSON.parse` threw, `OutboxActor` recorded a
 *    *failure* for a delete that had already committed, and the row was
 *    retried to a dead letter. Measured: 21 `files` rows deleted and every one
 *    of those deliveries booked as failed.
 *  - **API** — `Mutation.deleteFile` threw a `SyntaxError` after the row was
 *    gone, which the masker turns into "Unexpected error.". Measured
 *    2026-09-27 against the shared lane: a 200 with no error header and the
 *    body `undefined`.
 *
 * So the rule is Dapr's own (`BufferSerializer.deserialize`, which is what its
 * client uses on this exact body): try JSON, and if the body is not JSON,
 * return it as-is rather than throwing. A 2xx without the error header means
 * the target method returned; the shape of what it returned is the caller's
 * business, and an unparseable body is never by itself evidence the call
 * failed.
 */
export const parseInvocationResult = (text: string): unknown => {
  if (text === "" || text === "undefined") return undefined;
  if (text === "null") return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};
