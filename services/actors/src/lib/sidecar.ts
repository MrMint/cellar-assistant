/**
 * The actor host's own Dapr sidecar, over HTTP.
 *
 * Three things need it, and none uses the `@dapr/dapr` client:
 *
 *  1. **`OutboxActor` invoking a target actor.** The outbox knows
 *     `target_actor` only as a string in a row. The SDK's `ActorProxyBuilder`
 *     could carry that — it reads only the class's `.name` (3.18.0,
 *     `actors/client/ActorProxyBuilder.js:34`; the "needs the concrete class"
 *     this comment used to claim is false, docs/architecture/dapr-sdk-gaps.md
 *     G14). What rules it out is that a typed actor error comes back as a
 *     *resolved* value (G1), the delivery timeout cannot be passed (G2), and
 *     each builder waits on sidecar health (G4).
 *  1a. **Every other actor-to-actor call**, through `internal(ctx)`
 *     (`./internal-client.ts`), which types it from the target's descriptor
 *     and lands here with the descriptor's actor type and timeout.
 *     `./invoke-sites.test.ts` keeps `invokeActorMethod` to those two callers.
 *  2. **Registering a reminder from outside an actor turn.** `boot()` arms
 *     `OutboxActor`'s and `MaintenanceActor`'s keep-alives at boot, before
 *     anything has activated either (`src/lib/keep-alive.ts`).
 *     `AbstractActor.registerActorReminder` exists only on an instance Dapr
 *     itself constructed, the client class that has it is not exported, and
 *     it lower-cases a `Temporal.Duration` on the way out, so any period with
 *     a day in it (`p1d`) is refused by daprd — docs/architecture/dapr-sdk-gaps.md
 *     G12. (The polyfill is not the obstacle: `@dapr/dapr` re-exports
 *     `Temporal`, `index.js:20`.)
 *
 * `services/api/src/dapr.ts` reached the same conclusion for the same reasons;
 * the sidecar HTTP API is stable and documented
 * (https://docs.dapr.io/reference/api/actors_api/) and is exactly what the SDK
 * calls underneath.
 *
 * Arguments are sent as a JSON array. Dapr's `ActorManager` spreads an array
 * body across the method's parameters, so `ctx` arrives first (§8.2).
 */
import {
  invokeActorOverSidecar,
  parseInvocationResult,
  SidecarError,
  sidecarHeaders,
} from "@cellar-assistant/contracts";
import { config } from "../config.ts";

const api = (): string => `http://${config.daprHost}:${config.daprPort}/v1.0`;
const base = (): string => `${api()}/actors`;

/**
 * Moved to `@cellar-assistant/contracts` with the transport itself;
 * re-exported so `instanceof SidecarError` and existing importers keep
 * working.
 */
export { SidecarError };

/**
 * Invoke `actorType/actorId.method(...args)` through the sidecar — the shared
 * transport (`invokeActorOverSidecar` in `@cellar-assistant/contracts`),
 * addressed at this host's own sidecar.
 *
 * `timeoutMs` bounds the whole call. Outbox deliveries are expected to be
 * short: §8.5's two 120-second exceptions are request-driven, not
 * outbox-driven, and long work is chunked by a `JobActor` into one outbox row
 * per batch rather than held open in a single turn.
 *
 * A failure re-raises the *typed* `ActorError` when the body is one of the
 * five, falling back to `SidecarError` only for a genuinely opaque failure.
 * `OutboxActor` never branches on the error's type (any failure is a retry or
 * a dead-letter); a *synchronous* caller does: `BrandRegistryActor` calls
 * `BrandActor(newId).create` this way (§8.5, "registry → entity") and has to
 * tell "someone already created this name" (`ConflictError` — the
 * `brands_unique_lower_name` tripwire, §2.1) apart from every other failure.
 * And `response.ok` alone is not "it worked": Dapr answers a typed actor error
 * with a 200 plus `DAPR_ERROR_RESPONSE_HEADER` (see `./actor-error-envelope.ts`),
 * which the shared transport reads before the status.
 */
export const invokeActorMethod = async (
  actorType: string,
  actorId: string,
  method: string,
  args: readonly unknown[],
  timeoutMs: number,
): Promise<unknown> =>
  invokeActorOverSidecar({
    baseUrl: api(),
    actorType,
    actorId,
    method,
    args,
    timeoutMs,
    apiToken: config.daprApiToken,
  });

/**
 * Moved to `@cellar-assistant/contracts` so the API's transport
 * (`services/api/src/dapr.ts`) reads a successful body by the same rule;
 * re-exported so existing importers keep working.
 */
export { parseInvocationResult };

export type ReminderSpec = {
  /** Delay before the first firing, as a Dapr duration: `2s`, `1m30s`. */
  readonly dueTime: string;
  /** Interval between firings. Omit for a one-shot reminder. */
  readonly period?: string;
  /** Deleted this long after registration. Omit for "until unregistered". */
  readonly ttl?: string;
  /** Handed back to the actor's `receiveReminder`. An object, never an array. */
  readonly data?: Record<string, unknown>;
};

/**
 * Register (or replace) a reminder. Re-registering the same name overwrites,
 * so this is idempotent and safe to call on every boot.
 *
 * Reminders live in the Scheduler service's etcd volume (Dapr ≥ 1.15), not in
 * the actor state store, and survive a restart of the app *and* its sidecar —
 * `docs/architecture/target-stack.md` §7 records the measurement.
 */
export const registerReminder = async (
  actorType: string,
  actorId: string,
  name: string,
  spec: ReminderSpec,
): Promise<void> => {
  const url = `${base()}/${encodeURIComponent(actorType)}/${encodeURIComponent(actorId)}/reminders/${encodeURIComponent(name)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: sidecarHeaders(config.daprApiToken, {
      "content-type": "application/json",
    }),
    body: JSON.stringify({
      dueTime: spec.dueTime,
      period: spec.period,
      ttl: spec.ttl,
      data: spec.data,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new SidecarError(
      `register reminder ${actorType}/${actorId}/${name}`,
      response.status,
      await response.text(),
    );
  }
};

export const unregisterReminder = async (
  actorType: string,
  actorId: string,
  name: string,
): Promise<void> => {
  const url = `${base()}/${encodeURIComponent(actorType)}/${encodeURIComponent(actorId)}/reminders/${encodeURIComponent(name)}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: sidecarHeaders(config.daprApiToken),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok && response.status !== 404) {
    throw new SidecarError(
      `unregister reminder ${actorType}/${actorId}/${name}`,
      response.status,
      await response.text(),
    );
  }
};
