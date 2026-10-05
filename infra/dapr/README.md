# Dapr resources

`config.yaml` is the runtime Configuration (tracing to `otel-lgtm`, reentrancy
off per §8.5). `components/` is passed to both sidecars as `--resources-path`.
Keep non-YAML files out of `components/` — daprd logs a warning for each one it
finds and cannot parse.

## components/

- `actor-state.yaml` — `state.in-memory`, marked `actorStateStore`. **The plan
  says there is no state store; the runtime disagrees.** Read the comment at the
  top of that file before touching it: daprd 1.18.3 disables actor *hosting*
  without one, so this is a precondition for any actor being reachable at all,
  not a place where actor state lives.
- `secrets.yaml` — local env secret store, so credentials stay out of this
  directory and come from `infra/.env`.
- `files-binding.yaml` — the S3 output binding used by `FileActor` (A8).
  `presign` / `presignTTL` is what makes direct browser *fetch* work. It cannot
  presign a PUT (A8 read `bindings.aws.s3`: `PresignGetObject` only), so upload
  URLs are signed in-process by `services/actors/src/lib/s3-presign.ts`; the
  file's own header has the detail. `prod/files-binding.yaml` overrides it in
  production.

Still deliberately absent:

- **No pub/sub.** Cross-actor work goes through the `outbox` table (A5), not a
  broker.

## The app channel: daprd → actor host

daprd reaches `services/actors` over pooled keep-alive HTTP/1.1 connections.
Measured on daprd 1.18.3: at most **64 idle** connections, each closed by
daprd after **90s** idle (a 100-call burst opened more than 64 and kept 64).
No `--app-max-concurrency` is set, so daprd does not bound concurrent calls
to the host itself. daprd does not retry a failed actor `PUT`, so the actor host must never be the side
that closes an idle connection: it holds one for 5m
(`services/actors/src/lib/app-channel-connections.ts`). With the Node/Bun
default of 5s it was, and a request that met a connection at the instant it
closed came back as a 500 — `ERR_ACTOR_INVOKE_METHOD … EOF` — that the actor
host never saw. `services/api` reports that shape as `actor.invocation_failed`
with `failure_cause=app_channel_closed`. Raising daprd's idle time past 5m, or
putting anything with a longer idle timeout in front of port 3002, reopens
the race: raise the host's timeout with it.

## The reminder question (plan §6.4)

Partly answered by A2: reminders no longer live in the actor state store at all.
Dapr 1.15 moved them to the Scheduler service, and 1.18.3 logs
`Using Scheduler service for reminders.` at startup. The in-memory state store
above therefore does not make reminders volatile — the scheduler's etcd volume
does that job. A5 has since confirmed it end to end: a one-shot reminder armed
before `docker compose restart actors actors-dapr` fired on schedule into the
new process (`docs/architecture/target-stack.md` §7).
