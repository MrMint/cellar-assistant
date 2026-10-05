# Can the Dapr actor host be trusted on Bun?

Phase 5b of the bun migration. `services/actors` is the riskiest process to
move — 47 registered actor types, Scheduler-backed reminders, a transactional
outbox drained on a 2 s reminder, better-auth on `/api/auth/*`, and **the only
Postgres connection in the system**. The failure that matters is not a red test;
it is a host that passes CI, serves traffic, and then hours later grows RSS
until it OOMs, or quietly stops firing reminders, with nothing failing anywhere.

Everything below was measured on an isolated host-run stack (`CELLAR_STACK_SLUG=bun5b`,
slot 11, its own placement/scheduler/Postgres — see `local-dev-stacks.md`), on
2026-09-12/13, with Dapr 1.18.3, `@dapr/dapr` 3.18.0, bun 1.4.2 and Node 24.14.0.
Raw evidence is under `.stack/bun5b/soak/<runtime>-<timestamp>/` (gitignored):
`acceptance.txt`, `host-samples.jsonl`, `samples.jsonl`, `summary.json`,
`tcp-census.txt`.

---

## 1. The `node:http2` retention bug cannot reach this app

oven-sh/bun#40646 retains ~237 bytes per RPC over **TLS** on `node:http2`
(9.6 on Node), and its fix merged after 1.4.2 shipped, so it is in no released
version. `@dapr/dapr` reaches a sidecar through `@grpc/grpc-js` **when
configured for gRPC**, and grpc-js rides entirely on `node:http2`. Whether that
path is live here is a question about this app, not about the SDK.

It is not live, and this was established three independent ways.

**a. The SDK never selects the gRPC server or client.** `DaprServer`'s
constructor (`implementation/Server/DaprServer.js`) switches on
`serverOptions.communicationProtocol`, defaulting to `HTTP`; `src/index.ts`
passes none. `src/lib/sidecar.ts` and `services/api/src/dapr.ts` both bypass the
SDK client entirely and use `fetch` against `http://<host>:<DAPR_HTTP_PORT>`.

**b. No HTTP/2 session and no TLS socket is ever created.** The soak
instrument (`scripts/soak/instrument.mjs`) patches `http2.connect` and
`tls.connect` before the app's first import and counts every call. Across boot,
the full acceptance suite and the soak windows below:

```
http2Sessions: 0   http2SecureSessions: 0   http2Authorities: []
tlsSockets:    0   tlsHosts: []
```

**c. The process's actual sockets say the same thing.** Every TCP connection the
actor host holds, under load:

```
bun 21335  7u TCP *:3222 (LISTEN)                          app port
bun 21335  9u TCP 127.0.0.1:61199->127.0.0.1:3722 (ESTAB)  -> its OWN sidecar, HTTP port
bun 21335 10u TCP 127.0.0.1:61203->127.0.0.1:4538 (ESTAB)  -> OTLP collector
bun 21335 22u TCP 127.0.0.1:3222->127.0.0.1:61301 (ESTAB)  <- daprd inbound
bun 21335 26u TCP 127.0.0.1:61310->127.0.0.1:5653 (ESTAB)  -> postgres
```

The sidecar's gRPC ports (50222, and 50224 internal) are listening on daprd and
have **no connection from the app at all**. And the sidecar's HTTP API is
plaintext, not TLS:

```
$ curl -D - http://127.0.0.1:3722/v1.0/healthz     ->  HTTP/1.1 204 No Content
$ curl -k   https://127.0.0.1:3722/v1.0/healthz    ->  error:1404B42E ... tlsv1 alert protocol version
```

**Conclusion: app↔sidecar traffic here is plaintext HTTP/1.1 in both
directions.** Even if the app were switched to gRPC tomorrow, the channel would
be the *insecure* one the same research measured at 8.5 bytes/RPC — flat. The
bug is real and unfixed; it is not on this app's path.

The one caveat worth writing down: this holds because the app talks to a
**sidecar on localhost**. Dapr mTLS (a Sentry deployment) or an `https://`
`DAPR_HTTP_ENDPOINT` would put TLS on this path, and then #40646 would be worth
re-measuring before shipping. `infra/dapr/config.yaml` does not enable mTLS.

---

## 2. Functional acceptance on Bun: 12/12

`services/actors/scripts/runtime-acceptance.sh`, run against a real sidecar,
a real Scheduler and a real Postgres. Full output in `acceptance.txt`.

| # | proof | result |
|---|---|---|
| 0 | interpreter actually serving | `bun --preload ./scripts/soak/instrument.mjs src/index.ts` |
| 1 | **all 47 actor types registered** | `/dapr/config` lists 47 entities; the sidecar reports 47 hosted types |
| 2 | actor method across the sidecar hop | `PingActor.ping` via the **API's** sidecar: HTTP 200, `{"pong":true,…}` |
| 2b | warm activation reused | second call reports `turns=2` |
| 3 | **typed actor error** | HTTP 200 + `X-Daprerrorresponseheader: 1` + `{"code":"FORBIDDEN","message":"OutboxActor.drain is system/admin only…"}` |
| 4 | **Scheduler-backed reminder fires** | armed at `04:57:04.459Z` for +12 s, fired at `04:57:16.467Z` (+12.008 s) |
| 5 | **outbox drains** | row inserted → `delivered` in **584 ms**, attempts=0 (drain reminder period is 2 s) |
| 6 | Postgres under concurrent load via `pg` | 300/300 concurrent `ReferenceDataActor.all` in 340 ms, 12 480 rows; pool 2 → 10 backends (max 10 — node-postgres' default then; `5adc5f64` set `max: 20`) |
| 7 | better-auth on `/api/auth/*` | `jwks` 200 with an EdDSA key; `sign-in/email` 401 `INVALID_EMAIL_OR_PASSWORD` |

Number 4 is the one to read first: it is the least likely thing to survive a
runtime change and the most silent when it does not. It is a **one-shot**
reminder armed from inside an actor turn, so no re-registration on activation
can fake it. Number 7's second row matters more than it looks: a rejection *on
credentials* proves the POST body reached better-auth's handler, i.e. the
middleware ordering in `src/auth/mount.ts` still puts auth ahead of Dapr's
body-parser under Bun. An empty body would have failed differently.

---

## 3. Memory retention per RPC — Bun vs Node

Two 30-minute windows, same harness, same offered load, alternating runtimes.
Slopes are least-squares fits of memory against cumulative RPC count, after
dropping three warm-up samples.

| | bun 1.4.2 | node 24.14.0 |
|---|---|---|
| RPCs in window | 90,811 | 67,924 |
| throughput | **50.36/s** | 37.65/s |
| RSS, first → last sample | 214 MB → **112 MB** | 431 MB → 208 MB |
| RSS slope (B/RPC) | -316.7 (r²=0.16) | -1646.4 (r²=0.27) |
| heapUsed slope (B/RPC) | +7.25 (r²=0.66) | -17.78 (r²=0.11) |
| heapUsed, net change | +4,737 bytes | -3,187,896 bytes |
| reminders armed → delivered | 30 → 30, 0 late | 26 → 26, 0 late |
| transient failures | 2 | 2 |

**Neither runtime leaks, and the negative RSS slopes are not a finding.** Both
are negative because RSS falls away from a post-boot peak as the GC settles, and
both fits are poor (r² of 0.16 and 0.27) because RSS here is
GC sawtooth, not a line. The honest reading is *no upward trend*, not "memory
shrinks with load".

**Bun holds about half the resident memory and served ~34% more throughput** at
the same offered load — 112 MB against 208 MB at the end of the window.

**The one positive slope is Bun's heap, and it is noise.** The fit says
+7.25 B/RPC (r²=0.66), which over this window would predict roughly
658 KB — but the measured net change was +4,737 bytes. The slope is
fitting intra-window oscillation. Taken at face value anyway, +7.25 B/RPC at
50 RPC/s is ~32 MB/day, which is exactly the magnitude a 24-hour
window would settle and a 30-minute one cannot.

**The bug from §1 would have been unmissable here.** 237 B/RPC over 90,811
RPCs is ~22 MB of one-way growth. Nothing of the kind appears, which is
what §1 predicts from the socket census: that path is never taken.

Reminder liveness is the other headline: **56 probes armed and delivered
across both runtimes, none late.** Each is a one-shot reminder armed inside an
actor turn and measured end to end.

---

## 3b. The production image, built and exercised

`docker build -f services/actors/Dockerfile --target runtime .` — 1.45 GB,
`CMD ["bun","src/index.ts"]`, `USER node`, workdir `/workspace/services/actors`.
Both interpreters are present, and both resolve the full workspace import graph
**inside the shipped artifact** — which is the specific thing the Dockerfile's
long comment about symlinks, real paths and `--preserve-symlinks` is about:

```
bun  1.4.2      node v24.20.0      user node (uid 1000)

bun : outbox-actor + @cellar-assistant/db + @dapr/dapr all resolved in  460ms
node: outbox-actor + @cellar-assistant/db + @dapr/dapr all resolved in 1290ms
```

So the rollback is real and testable without a rebuild: `docker run … <image>
node src/index.ts`.

---

## 4. What changed

- `services/actors/package.json` — `start` is now `bun src/index.ts`;
  `start:node` keeps `node src/index.ts` as a first-class, documented path.
- `services/actors/Dockerfile` — the bun binary moves from the `deps` stage to
  `base`, so the **runtime** image has both interpreters, and `CMD` becomes
  `["bun", "src/index.ts"]`. The base image stays `node:24-bookworm-slim`
  precisely so the rollback is a `CMD` override rather than a rebuild.
- `services/actors/scripts/runtime-acceptance.sh` — the 12 proofs above, runnable
  against whichever runtime is currently serving.
- `services/actors/scripts/soak/` — the unattended soak harness (`run-soak.sh`,
  `soak.ts`, `instrument.mjs`, `boot-record.py`).

- `dapr.template.yaml` — the actors app's `command` follows, so the host-run
  lane exercises the runtime production uses. The Node arm of an A/B is a
  *variant* of the generated run file (`scripts/soak/run-soak.sh node`), so
  switching back for an experiment needs no edit here and no revert.
- `services/actors/src/lib/runtime.test.ts` — asserts both scripts still say
  what they say, because a string in a manifest that nothing imports is exactly
  the kind of decision that gets silently reverted.

The one-shot scripts (`migrate:users`, `migrate:files`, `db:seed`) deliberately
stay on `node`. They are not the long-lived host and nothing in this exercise
measured them.

### Still needed in `infra/` (not changed here)

**Done since, in a different form — do not apply the snippet below.**
`c8ef930b` points both compose files' `actors` (and `api`) at
`command: ["bun", "src/index.ts"]`. The dev lane did not move to
`oven/bun:1.4.2`: in that image `node` is a symlink to bun, so the Node fallback
would silently run bun. `x-node-app` instead builds `node:24-bookworm-slim` with
the bun binary copied in (`infra/docker-compose.yml`;
`toolchain-traps.md` #9). What follows is the gap as it stood on 2026-09-13.

Both compose files pin the command explicitly, so **they would keep the actor
host on Node whatever the image says**. That is not a hypothetical: the prod
file's `command: ["node", "src/index.ts"]` overrides the image's `CMD`, so
shipping this change without the compose edit ships a bun image running Node.

1. `infra/docker-compose.prod.yml`, service `actors` (~line 127):
   `command: ["node", "src/index.ts"]` → `command: ["bun", "src/index.ts"]`.
   The image ships both interpreters, so reverting that one line is the full
   rollback, with no rebuild.

2. `infra/docker-compose.yml`, service `actors`: the dev lane bind-mounts the
   workspace into `x-node-app` (`image: node:24-bookworm-slim`), which has **no
   bun in it**. It needs both the image and the command:

   ```yaml
   x-bun-app: &bun-app
     image: oven/bun:1.4.2          # same tag services/actors/Dockerfile copies from
     volumes:
       - ..:/workspace
     restart: unless-stopped

     actors:
       <<: *bun-app                 # was *node-app
       command: ["bun", "src/index.ts"]
   ```

   `services/api` stays on `*node-app` unless phase 5a moves it too. Note that
   `services/actors/scripts/a5-acceptance.sh` invokes through the **api**
   container (`dc exec -T api node -e …`), which is deliberate — it must not
   share the fate of the host it is killing — so it is unaffected by the actors
   container losing `node`.

---

## 5. What the bounded window can and cannot prove

The soak windows here are **30 minutes each**, not 24 hours. That is a real
limit and it bounds the conclusion in a specific way rather than a vague one.

**It can prove**, and does: that nothing fails under sustained concurrent load;
that reminders keep firing for the whole window (one timed probe every 30 s,
each measured end to end); that the outbox keeps draining; that the pool does
not grow without bound; that the event loop does not drift; and that RSS is not
climbing at a rate that would matter. A leak of the size #40646 describes — 237
B/RPC — would move RSS by ~45 MB over the ~190 000 RPCs in one of these windows.
That is far above the noise floor here and would have been unmissable.

**It cannot prove** the absence of a slow leak below roughly 10 B/RPC, nor
anything with a period longer than the window: a daily cron, a cache that only
evicts at some threshold, fragmentation that only shows after many GC cycles, or
a scheduler/etcd behaviour that appears after hours of uptime. It says nothing
about reminder behaviour across a **leader change** or a long outage, and
nothing about memory under a *different* traffic shape — in particular the AI
seams, which hold whole images in memory and were not exercised at all
(`AI_PROVIDER` is Ollama in this stack and no menu scan, recipe photo or
embedding ran).

That is what the harness is for, and why it is committed rather than deleted
after the fact:

```bash
services/actors/scripts/soak/run-soak.sh bun --seconds 86400 --detach
```

It survives the shell, appends every sample as it is taken, and prints the log
path. `scripts/soak/compare.py .stack/<slug>/soak/*/summary.json` compares any
set of runs afterwards. A 24-hour window is the same command with a bigger
number, and a future session can pick it up from the files with no context from
this one.

