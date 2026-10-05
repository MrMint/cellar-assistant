# Dapr JS SDK gaps — why we call actors ourselves and harden the SDK's host

Status: **accepted** (describes the code as of `fcf13233`). Scope: `@dapr/dapr` **3.18.0**
(`services/actors/node_modules/@dapr/dapr/package.json`), daprd **1.18.3**. 3.18.0 is also the
latest js-sdk release (2026-06-10); `main` is two dependency bumps ahead of it and changes nothing
below (`gh api repos/dapr/js-sdk/compare/v3.18.0...main`, checked 2026-09-28). So every gap here is
open in the newest release, not fixed by an upgrade.

This document exists so that a later reader can (a) tell which of our code is compensating for
the SDK and which is our own design, and (b) turn the gaps into upstream issues and PRs. Every
claim cites the installed SDK, the upstream source at the matching tag, or a measurement.

Citation shorthand:

- `sdk:<path>:<line>` — the compiled file under `services/actors/node_modules/@dapr/dapr/`, which
  is what actually runs.
- `upstream:<path>#L<n>` — the TypeScript source at
  `https://github.com/dapr/js-sdk/blob/v3.18.0/<path>#L<n>`.
- "Probe" — `sdkgaps-probe.mjs`, run on 2026-09-28 at 16:16Z inside `cellar-stack-actors-1`
  (Bun, the container's runtime) through its own sidecar `actors-dapr:3502`, using the SDK's own
  `DaprClient` + `ActorProxyBuilder` with stub classes. Read-only calls only. The container had
  been started ~15:25Z; which tree it loaded was not recorded, but every result below depends
  only on the SDK and on host behaviour documented in the files cited next to it.

---

## 1. Context and decision

**Decision.** Callers of actors (`services/api` resolvers, the outbox, actor-to-actor calls) do
**not** use the SDK's client. They call the sidecar's documented HTTP actor API
(<https://docs.dapr.io/reference/api/actors_api/>) with our own transport. The actor host **does**
use the SDK's server (`DaprServer`, `AbstractActor`, `ActorRuntime`), but wraps it in layers that
fix what the SDK leaves open. Nothing inside `@dapr/dapr` is patched; every layer works through
Express's public API on an app we create and hand to `DaprServer` via `serverHttp`
(`sdk:implementation/Server/HTTPServer/HTTPServer.js:42`).

Our components and the gap each one covers:

| our file | what it is | covers |
|---|---|---|
| `packages/contracts/src/invocation.ts` | the one sidecar transport (URL, headers, timeout, response rule) | [G1](#g1-a-typed-actor-error-resolves-as-a-successful-value), [G2](#g2-no-per-call-timeout-or-abortsignal), [G4](#g4-a-new-client-per-builder-each-waiting-on-sidecar-health), [G14](#g14-corrected-misconception-the-sdk-needs-the-concrete-actor-class) |
| `packages/contracts/src/proxy.ts` | typed, `ctx`-bound proxies over that transport | [G3](#g3-the-proxy-traps-every-property-including-then), G14 — plus our own `ctx` binding (§5) |
| `services/api/src/dapr.ts` | the API's invoker: per-method timeout, failure telemetry | G1, G2 |
| `services/actors/src/lib/sidecar.ts` | the host's invoker; reminders registered from outside a turn | G1, G2, [G12](#g12-no-public-way-to-register-a-reminder-from-outside-an-actor-and-duration-munging) |
| `services/actors/src/lib/internal-client.ts` | typed actor-to-actor client over `sidecar.ts` | G2, G14 |
| `services/actors/src/lib/dapr-app-token.ts` | refuses callers without `APP_API_TOKEN` | [G5](#g5-the-host-never-verifies-app_api_token) |
| `services/actors/src/lib/actor-method-allowlist.ts` | only descriptor-declared methods; no timer route; well-formed `ctx` | [G6](#g6-the-host-dispatches-any-function-on-the-actor) (the `ctx` half is ours, §5) |
| `services/actors/src/lib/actor-error-envelope.ts` | typed error → `200` + `X-Daprerrorresponseheader`; opaque 500 otherwise | G1 (host half) |
| `services/actors/src/lib/actor-route-guard.ts` | settles every SDK handler; idempotent deactivate | [G7](#g7-deactivate-timer-and-reminder-handlers-crash-the-process) |
| `services/actors/src/lib/process-guard.ts` | backstop: unhandled rejection is logged, not an exit | G7 (policy is ours) |
| `services/actors/src/lib/app-channel-connections.ts` | server `keepAliveTimeout` above daprd's 90s | [G9](#g9-no-server-keepalivetimeout-daprds-90s-pool-races-nodes-5s) |
| `services/actors/src/lib/host-app.ts` | case-sensitive, strict routing; canonical-path gate | [G10](#g10-case-insensitive-non-strict-routing--ours-not-the-sdks) — **our** bug, not the SDK's |

`index.ts` (`services/actors/src/index.ts:28-125`) installs them in that order; its comments carry
the one-paragraph version of each.

---

## 2. The gaps

Each gap: what the SDK does · why it is wrong for us · a minimal reproduction an upstream
maintainer can run · our workaround · upstream status. Verdicts: **confirmed** (re-checked against
source, and measured where marked), **ours** (not an SDK defect), **corrected** (a claim we used
to make that was false).

Reproductions assume a scratch project with `@dapr/dapr@3.18.0`, run with
`dapr run --app-id repro --app-port 3000 --dapr-http-port 3500 -- npx tsx <file>.ts`. The shared
host for the host-side repros:

```ts
// host.ts — the smallest SDK actor host
import { AbstractActor, DaprServer } from "@dapr/dapr";
export class Counter extends AbstractActor {
  async boom(): Promise<void> { throw new Error("boom"); }
  async slow(): Promise<string> { await new Promise((r) => setTimeout(r, 60_000)); return "done"; }
  async ping(): Promise<string> { return "pong"; }
}
const server = new DaprServer({ serverHost: "127.0.0.1", serverPort: "3000",
  clientOptions: { daprHost: "127.0.0.1", daprPort: "3500" } });
await server.actor.init();
server.actor.registerActor(Counter);
await server.start();
```

### G1. A typed actor error resolves as a successful value

**Verdict: confirmed** (source + probe), with a fairness note.

What the SDK does, in two halves:

- **Client.** `HTTPClient.execute` returns the parsed body for any status 200–399 and never looks
  at a response header (`sdk:implementation/Client/HTTPClient/HTTPClient.js:422-431`;
  `upstream:src/implementation/Client/HTTPClient/HTTPClient.ts#L435`). daprd signals an actor
  failure with `X-Daprerrorresponseheader` on a 200 — the path it keeps for "the .NET SDK
  signals actor failure through a response header instead of a non-2xx status code" (daprd
  1.18.3, `pkg/actors/targets/app/transport/http`, quoted in
  `services/actors/src/lib/actor-error-envelope.ts:22-35`). So a header-signalled failure is
  handed to the caller as its result. **Probe:** `CellarActor.get` on a missing id through
  `ActorProxyBuilder` **resolved** `{"code":"NOT_FOUND","message":"CellarActor(…) has no row"}`.
  A non-2xx becomes `new Error(JSON.stringify({error, error_msg, status}))` — a string to parse,
  not a type (probe: the undeclared-method case threw exactly that).
- **Host.** `handlerMethod` catches, sets 500 **only if** `err instanceof Error`, and
  `res.send(err)` (`sdk:implementation/Server/HTTPServer/actor.js:88-93`;
  `upstream:src/implementation/Server/HTTPServer/actor.ts#L113-L116`). Express JSON-encodes the
  error, and `message`/`stack` are non-enumerable: `JSON.stringify(new Error("boom"))` is `{}`
  (measured, Node 24.14). So the message is dropped, while any *enumerable* fields cross — for a
  `pg` `DatabaseError` that is `detail`, `hint`, `where`, `internalQuery`, … (fragments of SQL).
  A thrown non-`Error` keeps the default status, **200**, and goes out as a success. A `void`
  return is sent as the four-byte text body `undefined` (`handleResult`,
  `sdk:…/HTTPServer/actor.js:109-116`; `upstream:…/actor.ts#L148-L154`), which is not JSON.

Why it is wrong for us: GraphQL maps typed errors (`NotFoundError`, `ConflictError`, …) to
`<Command>Result` unions by `instanceof`; a resolver handed `{code, message}` as a payload, or an
outbox delivery booked as delivered when its target threw, is a correctness bug, not cosmetics
(`packages/contracts/src/invocation.ts:101-113`).

Fairness: with a *stock* SDK host the client half never sees the header, because the stock host
never sends it — the error arrives as a 500 with body `{}` wrapped by daprd, i.e. an opaque
failure. The success-shaped error appears when a JS client calls a host that uses the header
protocol: ours, or any .NET actor.

Reproduction:

```ts
// g1.ts — client half: a header-signalled failure resolves. (Host: any server that answers
// like daprd's .NET convention; a 10-line Express host is enough.)
import express from "express";
import { ActorId, ActorProxyBuilder, DaprClient } from "@dapr/dapr";
const app = express();
app.get("/dapr/config", (_q, r) => r.json({ entities: ["Thrower"] }));
app.put("/actors/Thrower/:id/method/boom", (_q, r) =>
  r.set("X-Daprerrorresponseheader", "1").status(200).json({ error: "boom" }));
app.listen(3000);
const Thrower = class Thrower {};
const proxy = new ActorProxyBuilder<any>(Thrower, new DaprClient()).build(new ActorId("a"));
await new Promise((r) => setTimeout(r, 5000)); // let daprd read /dapr/config and join placement
console.log("resolved:", await proxy.boom()); // resolved: { error: 'boom' }
// Host half: against host.ts instead, `await counter.boom()` rejects with an Error whose
// message is a JSON string containing "(500) {}" — "boom" is gone.
```

Our workaround: `actor-error-envelope.ts` (host: typed error → `200` + header + `{code,message}`;
anything else → `500 {"code":"INTERNAL"}` with the detail logged, not sent) and
`invocation.ts:129-139` (client: `!ok || header present` → typed error or `SidecarError`;
`parseInvocationResult` handles `undefined`).

Upstream: [#357](https://github.com/dapr/js-sdk/issues/357) "Exception from Actor's method is not
surfaced to the caller" — open since 2022-09. Adjacent, not the same:
[#567](https://github.com/dapr/js-sdk/issues/567) (helper for daprd's rich error model, open) and
[PR #695](https://github.com/dapr/js-sdk/pull/695) (that helper, closed unmerged). Nothing found
for the header or the `undefined` body.

### G2. No per-call timeout or AbortSignal

**Verdict: confirmed** (source).

What the SDK does: `execute(url, params, requiresInitialization)` builds `clientOptions` from
`method`, `headers`, `body` and `agent` only (`sdk:…/HTTPClient/HTTPClient.js:388-411`;
`upstream:…/HTTPClient.ts#L382-L422`). No `signal`, no `timeout`, and the proxy method has no
place to pass one (`ActorProxyBuilder.build`'s trap forwards `...args` as the body,
`sdk:actors/client/ActorProxyBuilder.js:37-43`).

Why it is wrong for us: §8.5 sets a bound per method — 15s default, 120s for the two synchronous
AI calls — and the API must stop waiting while the actor may still commit; a caller that cannot
bound a call cannot tell "never heard back" from "slow" (`services/api/src/dapr.ts:33-52`).

Reproduction:

```ts
// g2.ts — against host.ts. There is no argument, option or signal that bounds this call;
// Promise.race only stops *waiting*, the socket and the actor turn carry on.
import { ActorId, ActorProxyBuilder, DaprClient } from "@dapr/dapr";
const Counter = class Counter {};
const c = new ActorProxyBuilder<any>(Counter, new DaprClient()).build(new ActorId("a"));
console.time("slow"); await c.slow(); console.timeEnd("slow"); // ~60s, unboundable
```

Our workaround: `invocation.ts:126` (`signal: AbortSignal.timeout(timeoutMs)`), with
`timeoutMs` from the method's descriptor (`actorMethodTimeout`, read by both `services/api/src/dapr.ts`
and `internal-client.ts`).

Upstream: no issue or PR found (searched titles of all 842 issues/PRs for timeout, abort, cancel).

### G3. The proxy traps every property, including `then`

**Verdict: confirmed** (source + probe).

What the SDK does: `build()` returns `new Proxy(this.actorTypeClass, { get() { return async
(...args) => invoke(name, id, propKey, args) } })` — every property read, of any key, is a remote
method (`sdk:actors/client/ActorProxyBuilder.js:33-50`;
`upstream:src/actors/client/ActorProxyBuilder.ts#L50-L66`). The target is the class itself, so
`typeof proxy === "function"`.

Why it is wrong for us: `await proxy` (or returning the proxy from an `async` function, or a
`Promise.resolve(proxy)`) reads `proxy.then`, gets a function, and calls it — a network call to
a method named `then`, whose returned promise never calls `resolve`, so the `await` never
settles; the failed remote call surfaces as an unhandled rejection. **Probe:** `await proxy`
was still pending after 3s and the process logged `unhandledRejection` for
`…/method/then`; `typeof proxy` was `function` and `proxy.name` a function.

Reproduction:

```ts
// g3.ts — against host.ts
import { ActorId, ActorProxyBuilder, DaprClient } from "@dapr/dapr";
process.on("unhandledRejection", (e) => console.log("unhandled:", String(e).slice(0, 120)));
const Counter = class Counter {};
const c = new ActorProxyBuilder<any>(Counter, new DaprClient()).build(new ActorId("a"));
const r = await Promise.race([(async () => { await c; return "settled"; })(),
  new Promise((ok) => setTimeout(() => ok("never settled"), 3000))]);
console.log(r); // "never settled", after a PUT …/method/then reached daprd
```

Our workaround: `proxy.ts:69,103-105` — `then`, `catch`, `finally`, `constructor` and every
symbol key read as `undefined`; target is a plain object.

Upstream: none found.

### G4. A new client per builder, each waiting on sidecar health

**Verdict: confirmed, low impact while the sidecar is healthy.**

What the SDK does: every `ActorProxyBuilder` constructs its own `ActorClient` → `HTTPClient`
(`sdk:actors/client/ActorProxyBuilder.js:26,30`; `sdk:actors/client/ActorClient/ActorClient.js:43`),
so does every *activated actor instance* (`sdk:actors/runtime/AbstractActor.js:55`;
`upstream:src/actors/runtime/AbstractActor.ts#L56`). Each `HTTPClient` starts
`isInitialized = false` (`sdk:…/HTTPClient.js:165`) and its first `execute` awaits
`awaitSidecarStarted` (`:222-227,306`), which polls up to 60 times before throwing
`DAPR_SIDECAR_COULD_NOT_BE_STARTED` (`sdk:implementation/Client/DaprClient.js:377`;
`upstream:src/implementation/Client/DaprClient.ts#L384,L404`). The agents are static and shared
(`HTTPClient.js:175-180`), so sockets are pooled; the health wait is not. Separately,
`DaprClient.actor.create(cls)` builds on a **random** id (`sdk:implementation/Client/HTTPClient/actor.js:28-30`;
`upstream:src/implementation/Client/HTTPClient/actor.ts#L38`), so it cannot address an existing
actor at all.

Measured (probe): first call on a new builder 33ms, second call on the same builder 3ms, first
call on another new builder 5ms. So with a healthy sidecar it is one extra health round-trip per
builder. With an unreachable sidecar, the first call through each new builder blocks for the full
retry budget instead of failing fast — and with no per-call timeout (G2) the caller cannot cap it.

Reproduction: stop `daprd`, then `new ActorProxyBuilder(Counter, new DaprClient()).build(id).ping()`
three times with three builders; each waits out the retry loop before
`DAPR_SIDECAR_COULD_NOT_BE_STARTED`.

Our workaround: none needed beyond G2 — `invokeActorOverSidecar` is one `fetch` per call.

Upstream: [#349](https://github.com/dapr/js-sdk/issues/349) "Unique DaprClient instance(s) per
host, port and options" (open) is the nearest.

### G5. The host never verifies `APP_API_TOKEN`

**Verdict: confirmed** (source: zero occurrences of `APP_API_TOKEN`, `app-api-token` or
`appApiToken` anywhere under `sdk:`).

What the SDK does: registers `/actors/*`, `/dapr/config`, `/healthz`
(`sdk:…/HTTPServer/actor.js:53-63`) with no authentication. Dapr's docs put the check on the app:
daprd sends `APP_API_TOKEN` as `dapr-api-token` and verifies nothing on the app's behalf
(<https://docs.dapr.io/operations/security/app-api-token/>).

Why it is wrong for us: everything the host serves trusts the `ctx` it is handed, `kind:
"system"` included, so anything that can reach port 3002 can act as the outbox
(`docs/architecture/target-stack.md` §3.1). Port 3002 also carries better-auth, so it cannot
simply be unpublished from the compose network (§5).

Reproduction: start `host.ts` with `APP_API_TOKEN=secret dapr run …`, then
`curl -X PUT localhost:3000/actors/Counter/a/method/ping` — no header — answers `200 pong`.

Our workaround: `dapr-app-token.ts` — deny-by-default (every path but `/api/auth/*` and
`/healthz`), constant-time compare, installed first.

Upstream: [#282](https://github.com/dapr/js-sdk/issues/282) "Add APP_API_TOKEN" — open since
2022-05-31, reopened by a maintainer 2022-09-15, no PR.

### G6. The host dispatches any function on the actor

**Verdict: confirmed** (source + probe). **Security-relevant: report privately first** (§4).

What the SDK does: `callActorMethod` checks only `typeof actorObject[name] === "function"`, then
calls it with the body spread as arguments (`sdk:actors/runtime/ActorManager.js:107-131`;
`upstream:src/actors/runtime/ActorManager.ts#L137,L154`). That admits every inherited method —
`AbstractActor`'s own `registerActorTimer`, `unregisterActorReminder`, `onDeactivateInternal`,
`resetStateInternal`, `saveStateInternal`, `getDaprClient`, …
(`sdk:actors/runtime/AbstractActor.js:86-204`) — and every helper a subclass defines, `protected`
and `#private` being compile-time only / not own-enumerable respectively. The timer route is
wider: `fireTimer` calls whatever method the request body names as `callback`
(`sdk:…/ActorManager.js:101-106`; `upstream:…/ActorManager.ts#L129`).

Why it is wrong for us: our base classes carry `tx` (a write transaction), `writeJob`,
`processBatch`, `setAggregate`, test counters (`actor-method-allowlist.ts:6-15`). A caller
holding `DAPR_API_TOKEN` — or, without G5's fix, anything on the network — could call them with
arguments of its choosing. **Probe:** daprd forwarded `CellarActor.tx` to the host (our allow-list
then refused it: `actor method not found`), i.e. the sidecar does not filter method names either.

Reproduction:

```sh
# against host.ts: an inherited method that is not part of Counter's API, through the sidecar
curl -X POST localhost:3500/v1.0/actors/Counter/a/method/getActorId
# → 200 with the id. Measured on our host before the allow-list:
#   PUT /Actors/PingActor/x/method/getActorId → 200 (services/actors/src/lib/host-app.ts:14).
# The same route reaches AbstractActor.registerActorTimer with caller-chosen arguments —
# a timer name, the callback method to fire, dueTime, period (strings pass the SDK's
# toString() munging, G12):
curl -X POST localhost:3500/v1.0/actors/Counter/a/method/registerActorTimer \
  -H 'content-type: application/json' -d '["t","ping","PT1S","PT10S"]'
```

Our workaround: `actor-method-allowlist.ts` — only names in the actor type's descriptor tables,
checked on the raw path and again on the router's extracted params; the timer route always
refused.

Upstream: none found. [#136](https://github.com/dapr/js-sdk/issues/136) ("Actors: should not allow
state manipulation outside Actor Runtime", closed 2021 by
[PR #137](https://github.com/dapr/js-sdk/pull/137)) removed remote *state* access, not method
dispatch.

### G7. Deactivate, timer and reminder handlers crash the process

**Verdict: confirmed** (source + an incident).

What the SDK does: `handlerDeactivate`, `handlerTimer`, `handlerReminder` are `async` Express 4
handlers with no `try/catch` (`sdk:…/HTTPServer/actor.js:72-77,95-108`;
`upstream:…/actor.ts#L89-L94,L120-L145`). Express 4 ignores a returned promise, so a throw is an
unhandled rejection, which exits Node ≥15 and Bun. `deactivateActor` throws
`ACTOR_NOT_ACTIVATED` for an actor it does not hold (`sdk:…/ActorManager.js:61-67`), and it
records an actor only after `onActivateInternal()` succeeds (`:54-60`) — so "daprd deactivates an
actor this process never finished activating" is an ordinary protocol event (idle timeout after
a failed activation; placement "halt all actors"). `handlerMethod` was given a `catch` in 2023
([#409](https://github.com/dapr/js-sdk/issues/409) → [PR #422](https://github.com/dapr/js-sdk/pull/422));
the other three were not.

Why it is wrong for us: one request with a malformed id took the whole host down ten minutes
later, with every in-flight turn of every actor (`actor-route-guard.ts:6-30`, measured on the
shared stack).

Reproduction:

```sh
# against host.ts: deactivate an actor this process never activated
curl -X DELETE localhost:3000/actors/Counter/never-activated
# → the host process exits on the unhandled rejection {"error":"ACTOR_NOT_ACTIVATED",…}
```

Our workaround: `actor-route-guard.ts` (registers the SDK's routes through wrapped route methods
so every handler's rejection becomes `next(err)`; unheld deactivate → `200`), plus
`process-guard.ts` as the backstop (log, don't exit, on an unhandled rejection — that policy is
ours, not something to push upstream).

Upstream: [#627](https://github.com/dapr/js-sdk/issues/627) "Actor deactivate errors causing app
to crash" (closed by the stale bot), [PR #628](https://github.com/dapr/js-sdk/pull/628) "Adds
error handling around actor deactivation" (**closed unmerged** by the stale bot after a failing
e2e job), [#658](https://github.com/dapr/js-sdk/issues/658) "Uncaught ACTOR_NOT_ACTIVATED …"
(open, 2025-02). Not fixed in 3.18.0.

### G8. `HTTPServer.start` ignores the host

**Verdict: confirmed** (source).

What the SDK does: `start(host, port)` stores `host` and calls `this.server.listen(parseInt(port))`
— all interfaces — then logs and reports `http://${host}:${port}`
(`sdk:implementation/Server/HTTPServer/HTTPServer.js:85-91`;
`upstream:src/implementation/Server/HTTPServer/HTTPServer.ts#L112-L117`). `serverHost:
"127.0.0.1"` therefore does not restrict anything, and says it does.

Why it matters to us: little today — we bind `0.0.0.0` on purpose (`services/actors/src/config.ts:7`)
because daprd reaches the host across the compose network. But our boot line repeats the claim
(`services/actors/src/index.ts:138`), and anyone setting `APP_HOST=127.0.0.1` to narrow exposure
would get none.

Reproduction: start `host.ts` (it passes `serverHost: "127.0.0.1"`), then
`lsof -nP -iTCP:3000 -sTCP:LISTEN` shows `*:3000`.

Our workaround: none (not needed at `0.0.0.0`). Upstream: none found (the open
[PR #721](https://github.com/dapr/js-sdk/pull/721) is about the *client's* host).

### G9. No server `keepAliveTimeout`: daprd's 90s pool races Node's 5s

**Verdict: confirmed** (source + measurement).

What the SDK does: `start()` calls Express's `app.listen`, which creates the `http.Server` with
runtime defaults (`keepAliveTimeout` 5s), and exposes no option or hook before it listens
(`sdk:…/HTTPServer.js:85-94`). The instance is stored only in a private field afterwards.

Why it is wrong for us: daprd's app channel is Go's `net/http` pool — up to 64 idle connections,
closed after 90s idle, the `Keep-Alive: timeout=5` hint ignored. The host closing first means a
request can be written onto a connection in the instant it closes; Go will not replay a `PUT`, so
daprd answers `500 ERR_ACTOR_INVOKE_METHOD … EOF` and the host logs nothing. Measured: 50 failures
in 4 200 calls sweeping across the close tick, 0 with the fix; the same signature as three failed
`CellarActor.get`s in the 2026-09-28 e2e run (`app-channel-connections.ts:6-39`).

Reproduction: against `host.ts`, loop { 100 concurrent `ping`s; sleep `5000 + i*20` ms } for
i = 0…100 and count rejections whose message contains `EOF`. (Throttling daprd's CPU widens the
window.)

Our workaround: `app-channel-connections.ts` replaces `app.listen` with Express's own two lines
plus `keepAliveTimeout` of 5 minutes (> every client's idle timeout).

Upstream: none found. This is the one gap where the SDK has unusually good information: its only
HTTP client is daprd, whose idle timeout is known.

### G10. Case-insensitive, non-strict routing — ours, not the SDK's

**Verdict: ours.** Fixed in `252ec562`.

What happened: Express 4 routes case-insensitively and ignores one trailing slash by default, so
`PUT /ACTORS/PingActor/x/method/ping` reached the SDK's `/actors/:actorTypeName/…` handler while
our token check and allow-list — which compared paths case-sensitively — did not recognise it as
an actor route. An unauthenticated caller got a `200` and an undeclared method ran
(`services/actors/src/lib/host-app.ts:6-22`).

Why it is not upstream's bug: a stock SDK host has no path-reading gate to bypass; Express's
defaults are documented and the SDK's routes behave as Express says. The defect was two parsers
(ours and Express's) disagreeing about what a path names. The lesson for upstream is narrower,
and belongs in the G5/G6 contributions: an SDK-side token check or allow-list must run on
**every** request or on the router's **extracted params**, never on a hand-matched path prefix.
(Express 5 — [#727](https://github.com/dapr/js-sdk/issues/727), open — keeps both defaults off, so
an upgrade would not change this.)

Our workaround: `host-app.ts` (`case sensitive routing` + `strict routing` set before the router
exists; a canonical-path gate; `assertHardenedRouting` at boot) and deny-by-default in
`dapr-app-token.ts`.

### G11. Reentrancy is configurable but not implemented

**Verdict: confirmed** (source).

What the SDK does: `ActorRuntimeOptions.reentrancy` is accepted and forwarded to daprd in
`/dapr/config` (`sdk:types/actors/ActorRuntimeOptions.d.ts:33`; `sdk:utils/Actors.util.js:20-24`),
so daprd enables it — but the host never reads or propagates `Dapr-Reentrancy-Id` (zero
occurrences under `sdk:`), and three TODOs say so (`sdk:…/HTTPServer/actor.js:81`,
`sdk:…/ActorManager.js:117`, `sdk:actors/runtime/ActorStateManager.js:29`). Turning it on
therefore changes nothing except what the sidecar believes.

Why it matters to us: it doesn't, today — §8.5 keeps reentrancy off
(`services/actors/src/index.ts:104-106`) and the outbox is the escape hatch. Recorded so nobody
flips the flag expecting it to work.

Reproduction: [#365](https://github.com/dapr/js-sdk/issues/365) has one.

Upstream: [#365](https://github.com/dapr/js-sdk/issues/365) "reentrancy setting not works" (open,
2022), [#666](https://github.com/dapr/js-sdk/issues/666) "Support actor reentrancy" (open, 2025),
[PR #241](https://github.com/dapr/js-sdk/pull/241) (WIP, closed unmerged).

### G12. No public way to register a reminder from outside an actor, and duration munging

**Verdict: confirmed**, with one correction to our own comment.

What the SDK does:

- Reminder registration exists on `ActorClientHTTP` (`sdk:actors/client/ActorClient/ActorClientHTTP.js:41-54`)
  and on `AbstractActor` — an instance the runtime constructed, i.e. only inside a turn
  (`sdk:actors/runtime/AbstractActor.js:86-93`). `ActorClient` is not exported from the package
  root (`sdk:index.d.ts:33`); a deep import works (there is no `exports` map) but is not API.
- Durations are sent as `d.toString().toLocaleLowerCase().replace("pt", "")`
  (`ActorClientHTTP.js:48-50,71-73`; `upstream:src/actors/client/ActorClient/ActorClientHTTP.ts#L66-L68,L92-L94`).
  Measured with the SDK's own `Temporal`: `PT5M → "5m"`, `PT1H30M → "1h30m"` (fine), but
  `P1D → "p1d"` and `P1DT2H → "p1dt2h"`. daprd parses periods with dapr/kit's `ParseDuration`
  (`pkg/actors/api/period.go:110` at v1.18.3), which requires an upper-case `P` or `R`
  (`dapr/kit` `time/time.go:69-70` on `main`, checked 2026-09-28) and then Go's `time.ParseDuration` — so any duration with a
  day component is rejected, and ISO repetitions (`R5/PT1H`) cannot be expressed.
- Found in passing: `getActors()` requests the literal path `` `replace('/v1.0', '')}/dapr/config` ``
  — a broken template literal (`ActorClientHTTP.js:90`; `upstream:…/ActorClientHTTP.ts#L114`).

Correction: `services/actors/src/lib/sidecar.ts:17-19` said the reminder API "takes a
`Temporal.Duration` from a polyfill that is not a dependency of this app". The SDK re-exports
`Temporal` (`sdk:index.js:20`), so the dependency is not the obstacle; the munging above and the
in-turn-only surface are. **Corrected in `bbcc542a`:** that comment now names the unexported
client and the lower-cased durations, and says the polyfill is not the obstacle.

Why it matters to us: `boot()` arms `OutboxActor`'s and `MaintenanceActor`'s keep-alive reminders
before anything has activated either (`services/actors/src/lib/keep-alive.ts:98-112`).

Reproduction:

```ts
// g12.ts — inside an actor method on host.ts's Counter:
await this.registerActorReminder("daily", Temporal.Duration.from({ days: 1 }));
// → rejects: daprd "unsupported duration format: p1d"
```

Our workaround: `sidecar.ts:111-158` posts `{dueTime, period}` strings straight to
`/v1.0/actors/<type>/<id>/reminders/<name>`.

Upstream: the empty-period bug was fixed ([#535](https://github.com/dapr/js-sdk/issues/535) →
[PR #536](https://github.com/dapr/js-sdk/pull/536), 2023); reminder read/list APIs are open
([#669](https://github.com/dapr/js-sdk/issues/669), [#788](https://github.com/dapr/js-sdk/issues/788),
[#789](https://github.com/dapr/js-sdk/issues/789)); [#722](https://github.com/dapr/js-sdk/issues/722)
tracks a runtime-side overwrite change. Nothing found for the duration munging, the export, or
`getActors`.

### G13. Per-type actor configuration (`entitiesConfig`) is not in the types

**Verdict: confirmed — a typing gap only.**

What the SDK does: `ActorRuntimeOptions` has no `entitiesConfig`
(`sdk:types/actors/ActorRuntimeOptions.d.ts:6-39`), but `/dapr/config` is built as
`{ entities, ...options }` (`sdk:utils/Actors.util.js:20-24`;
`upstream:src/utils/Actors.util.ts#L24`), so an extra property passed through a cast **is**
forwarded to daprd.

Why it matters to us: not yet — every type shares one idle timeout. A singleton like
`OutboxActor` and a per-row `ItemActor` are the obvious candidates for different ones.

Reproduction: `clientOptions.actor = { actorIdleTimeout: "10m", entitiesConfig: [{ entities:
["Counter"], actorIdleTimeout: "1h" }] } as any` → `curl localhost:3000/dapr/config` shows it; the
same object without `as any` does not compile.

Upstream: [#243](https://github.com/dapr/js-sdk/issues/243) "Add Support for Per Actor Type
Configuration" — open since 2022-04.

### G14. Corrected misconception: "the SDK needs the concrete actor class"

**Verdict: corrected.** Four of our comments said the SDK's client "needs the concrete actor
class", which would drag `services/actors` and Drizzle into the API:
`packages/contracts/src/invocation.ts:18-21`, `packages/contracts/src/proxy.ts:18-21`,
`services/api/src/dapr.ts:21-25`, `services/actors/src/lib/sidecar.ts:6-9`.

It is false. `ActorProxyBuilder` reads only `this.actorTypeClass.name`
(`sdk:actors/client/ActorProxyBuilder.js:34`; `upstream:…/ActorProxyBuilder.ts#L50`); any class
with the right name works, and at runtime so does `{ name: "CellarActor" }` — only the
`Class<T>` parameter type objects, which is why an outbox with string targets looked impossible.
**Probe:** a stub `class {}` renamed `PingActor` invoked the real actor successfully.

What *is* true and is the real reason we don't use the client: G1–G4 (errors resolve as values,
no timeout, a thenable proxy, a health wait per builder), plus `DaprClient.actor.create` using a
random id (G4). **Done in `bbcc542a` (2026-09-28):** the comments in all four files
(five comments, by that commit's count) now give G1–G4 as the reason and cite this document.

Upstream: [#417](https://github.com/dapr/js-sdk/issues/417) "Actor client SDK requires actor
implementation" (open, 2022) — which reached the same wrong-looking conclusion from the type, and
notes "the only reason for this is to get the name" — and
[PR #697](https://github.com/dapr/js-sdk/pull/697) "add possibility to create actors without the
implementation" (open, 2025-05, backwards-compatible since 2025-05-21, unmerged).

### Smaller findings, recorded for completeness

- **The API token is logged at debug level.** `execute` logs
  `JSON.stringify(clientOptions.headers)` — which includes `dapr-api-token` — on every call when
  the logger is at `debug` (`sdk:…/HTTPClient.js:394-395,409`; `upstream:…/HTTPClient.ts#L396,L415-L418`).
  We don't run the SDK client at debug, and our transport never logs headers. Report privately.
- **Actor type = class name.** `registerActor` keys by `actorCls.name`
  (`sdk:actors/runtime/ActorRuntime.js:65-66`) and `AbstractActor` uses `this.constructor.name`
  (`AbstractActor.js:61`), so a minifier or a renamed class silently changes the actor type daprd
  routes to. Our descriptors carry the type as a string; `registry.test.ts` pins the pairing.
- **Only the id is URL-encoded** in the client (`ActorClientHTTP.js:22`); type and method are
  interpolated raw. `actorMethodUrl` encodes all three (`invocation.ts:88-96`).
- **`await this.server.listen(...)`** awaits a non-promise (`HTTPServer.js:89`), so a bind error
  (`EADDRINUSE`) is an `error` event nobody listens for, not a rejected `start()`.

---

## 3. What we'd need from upstream to delete our code

LOC are approximate code lines (comments and blanks excluded) at `fcf13233`; tests in brackets.

| gap | proposed upstream change | what it would let us delete |
|---|---|---|
| G7 | Every actor route handler settles; deactivating an unheld actor is a `200` no-op (revive PR #628) | `actor-route-guard.ts` (~159 [603 test]). `process-guard.ts` stays: its log-don't-exit policy is ours |
| G5 | `DaprServer` verifies `APP_API_TOKEN` (env or option) on every request, as middleware ahead of all routes | `dapr-app-token.ts` (~60 [137]), once it can exempt our better-auth mount (an allow-list of public paths) |
| G6 | Dispatch only methods declared by the actor type (an explicit list, or own-prototype methods minus `AbstractActor`'s); timer callbacks restricted to the same list | the refusal half of `actor-method-allowlist.ts` (roughly half of ~225 [465]); the `ctx`-shape guard stays (§5) |
| G1 | Host: serialize errors as `{name, message, code?}` with `X-Daprerrorresponseheader`, never enumerable internals; `void` as an empty body. Client: honour the header and throw a typed `ActorInvocationError` carrying the body | most of `actor-error-envelope.ts` (~140 [377]), if the envelope is extensible enough to carry our five codes; the error branch of `invocation.ts` |
| G2, G3, G4, G14 | `ActorProxyBuilder` by type **name**, per-call `{ timeoutMs, signal }`, `then`/symbol keys not trapped, one shared initialised client | `invocation.ts`'s transport (~87 [158]) could become a thin wrapper; `proxy.ts` stays (it binds `ctx`, §5); `services/api` would take `@dapr/dapr` as a dependency |
| G9 | `DaprServerOptions.keepAliveTimeoutMs` (default above daprd's 90s), or an `onServerCreated(server)` hook | `app-channel-connections.ts` (~16 [145]) |
| G12 | Export an actor client (reminders/timers from outside a turn); send durations unmodified or format them correctly | `registerReminder`/`unregisterReminder` in `sidecar.ts` (~30) |
| G8 | `listen(port, host)` | nothing; fixes a misleading log |
| G13 | `entitiesConfig` in `ActorRuntimeOptions` | nothing today; removes a future `as any` |
| G11 | Reentrancy id propagation | nothing (we keep reentrancy off) |

---

## 4. Candidate upstream contributions

Ranked by value to us × likelihood of acceptance. **G6 and the debug-log token are security
issues: per Dapr's policy they go to `security@dapr.io` first, not to a public issue**
(<https://docs.dapr.io/operations/support/support-security-issues/>).

1. **"Actor host: settle deactivate/timer/reminder handlers; deactivate of an unheld actor is a
   no-op"** — Three `async` Express 4 handlers without `catch` turn a normal daprd event into a
   process exit. Revive PR #628 (closed by the stale bot, not rejected) with an e2e test; closes
   #627 and #658.
2. **"DaprServer: verify APP_API_TOKEN"** — The docs tell apps to check `dapr-api-token`; the SDK
   gives them no way to. A middleware installed before any route, with a public-path allow-list;
   closes #282 (open since 2022).
3. **"Actor host dispatches any function-valued property, including AbstractActor internals and
   body-named timer callbacks"** *(private report first)* — `typeof x === "function"` admits
   `registerActorTimer`, `saveStateInternal`, and any helper. Propose an explicit per-type method
   list, defaulting to own-prototype methods minus the base class.
4. **"Actor errors: preserve the message on the host, honour X-Daprerrorresponseheader on the
   client"** — A thrown `Error` crosses as `{}` (leaking any enumerable fields), a non-`Error`
   throw as a `200`, and a header-signalled failure resolves. Builds on #357.
5. **"ActorProxyBuilder: build by type name, per-call timeout/AbortSignal, don't trap `then`"** —
   Makes the client usable without the implementation (#417, PR #697) and safe to `await`. Could
   be split into three PRs; `then` is the one-line, obviously-acceptable piece.
6. **"DaprServer: keepAliveTimeout longer than daprd's app-channel idle timeout"** — A 5s server
   idle close races daprd's 90s pool and surfaces as `… EOF` 500s under burst. Small, measurable,
   with our repro.
7. **"Reminder/timer durations are lower-cased and mangled (P1D → p1d)"** — Plus the `getActors`
   template-literal bug. Small correctness fixes; pair with exporting an actor client.
8. **"HTTPServer.start ignores serverHost"** — One argument to `listen`. Trivial, low value to us.
9. **"Type entitiesConfig in ActorRuntimeOptions"** — Closes #243; runtime already forwards it.
10. **"HTTPClient logs dapr-api-token at debug level"** *(private report first)* — Redact the
    header in the debug line.

Reentrancy (G11) is deliberately not on the list: large, already tracked (#365, #666), and of no
value while §8.5 keeps it off.

---

## 5. Not upstream's problem: our design choices

Some of the code above exists because of how *we* chose to use actors. Fixing the SDK would not
remove it, and filing it upstream would be wrong.

- **`ctx` as an argument, with a trusted `system` ctx.** Every method takes `ctx` first and
  trusts it, including `kind: "system"` (`docs/architecture/target-stack.md` §3.1). Dapr's ACLs
  do not cover actor calls, so the whole trust model rests on who can reach a sidecar or the host
  port. That is why G5 and G6 are high-severity *for us*, and why `actor-method-allowlist.ts`'s
  `ctx`-shape guard, `proxy.ts`'s `ctx` binding and `assertNotSystemCtx` exist at all. An SDK
  cannot know our `ctx`.
- **better-auth shares the actor port.** `/api/auth/*` and the actor routes are one Express app on
  3002 (`services/actors/src/index.ts:30-40`, `createAppWithAuth` in
  `services/actors/src/auth/mount.ts:71`), reached by browsers via Caddy and by `services/api`
  for JWKS. That is why the port cannot be private to the sidecar, why `dapr-app-token.ts` needs a
  public-path list, and why the keep-alive fix also names Caddy as a client.
- **Actors as CRUD/transaction owners.** Actors load aggregates through Drizzle and write through
  synchronously in the turn; singletons sit on hot paths — `BudgetActor` on every AI/Google call
  (`services/actors/src/lib/budget-reservers.ts:35`), `PlaceCreationActor` running an AI review
  inside its turn (`services/actors/src/actors/place-creation-actor.ts:390`), a serial
  `OutboxActor` drain. The 120s timeouts in G2 and the per-type-config interest in G13 come from
  this shape, not from the SDK. There is also no Dapr `Resiliency` policy in `infra/dapr/`.

The DaprCallingReview (2026-09-28, a session review — not a committed document) raised these as
post-E4 design questions: whether the singletons should be sharded or moved off the request path,
whether `system` ctx should be minted from something a caller cannot forge rather than accepted
as an argument, whether better-auth should move to its own port/process, and whether a Resiliency
policy should replace per-call retry logic. Those are decisions for after the E4 cutover
(`docs/architecture/e4-decisions.md`), and they belong in our architecture docs, not upstream.
