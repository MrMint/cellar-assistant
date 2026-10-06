/**
 * The request id: taken from `x-request-id` only when it is safe, minted
 * otherwise.
 *
 * The header is **client-controlled end to end**. `services/client`'s proxy
 * forwards whatever the browser sent (`FORWARDED_REQUEST_HEADERS` in
 * `services/client/src/lib/api/proxy.ts`). This process used to copy it
 * verbatim into `ctx.requestId`, and from there it reached two places that
 * trusted it:
 *
 * - **Downstream ids, formerly.** Until 12e00c72 `services/actors` read a
 *   request id of the form `outbox:<uuid>` as an outbox delivery and keyed
 *   idempotency on that uuid — `BudgetActor.reserve`'s default
 *   `reservationId` among others — so a client that sent
 *   `x-request-id: outbox:<uuid>` was indistinguishable, downstream, from a
 *   redelivery. That parsing is gone: delivery identity is now `ctx.delivery`,
 *   accepted only on a `system` ctx, and `requestId` is correlation and
 *   nothing else (`services/actors/src/lib/delivery.ts`, whose test fails if
 *   an actor module reads it). The charset below still excludes the colon, so
 *   the old spelling cannot even arrive.
 * - **Logs.** It is an attribute on every event in `events.ts`, and on actor
 *   log lines. An unbounded value there costs Loki storage, and a value with
 *   newlines or control characters can forge log lines.
 *
 * The accepted shape, 1 to 64 characters of `[A-Za-z0-9_-]`, admits a UUID
 * (36), a W3C trace id (32 hex) and every short id a proxy mints. Anything
 * else is **replaced, not trimmed**. A trimmed id would be a different id that
 * still looks like the one the client sent, which is worse for correlation
 * than an obviously fresh one.
 */
import { randomUUID } from "node:crypto";

export const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const sanitizeRequestId = (
  raw: string | readonly string[] | null | undefined,
): string =>
  typeof raw === "string" && REQUEST_ID_PATTERN.test(raw) ? raw : randomUUID();

const memo = new WeakMap<Request, string>();

/**
 * One id per request, however many places ask for it.
 *
 * The context factory asks, and so does the telemetry plugin, which also runs
 * for requests that never reach the context factory (a parse or validation
 * refusal). Without the memo, a request with no usable header would mint two
 * different ids and its events would not join.
 */
export const requestIdFor = (request: Request): string => {
  const known = memo.get(request);
  if (known !== undefined) return known;
  const minted = sanitizeRequestId(request.headers.get("x-request-id"));
  memo.set(request, minted);
  return minted;
};
