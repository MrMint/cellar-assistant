# Local development stacks, one per worktree

Two people — or two agents, in two git worktrees — need to run this stack at the
same time without one debugging session answering the other's actor calls. This
document is how.

There are **two lanes**, and they are both supported:

| | **all-compose** | **host-run** (this document) |
|---|---|---|
| command | `bun run stack:up` | `bun run dev:up` |
| apps + sidecars | containers | host processes under `dapr run -f` |
| the Next client | a container, built into its image (3003) | `bun run dev` on the host (`WEB_PORT`: 3000 + your offset), yours to start |
| compose project | `cellar-stack` (shared) | `cellar-<worktree>` (yours) |
| ports | the familiar ones | derived, offset per worktree |
| concurrent stacks | one | as many as there are worktrees |
| used by | CI (`docker compose config`), the Playwright e2e suite | interactive and agent development |
| presigned image URLs | signed for `minio:9000` | signed for `localhost:<your port>` |

`infra/docker-compose.yml` still hardcodes `name: cellar-stack` and the familiar
3001 / 3002 / 5433 / 9100 / 3010, and nothing in the host-run lane touches it.
One thing has been **added** to that lane since: a `client` container on **3003**,
so the whole app is servable with no host process at all. See "The containerised
client" below — it is what lets the Playwright suite run without `bun run dev`.

---

## Quick start

From a fresh worktree, one command:

```bash
bun run dev:bootstrap                 # preflight, stack, schema, seed, signed in
bun run dev:bootstrap -- --tests      # ...and then the whole unit suite
```

It is a sequence of seven steps, each of which used to be a separate command
with its own way of failing quietly:

```
1/7  preflight            everything in `dev:doctor` below; stops here on a FAIL
2/7  infra containers     compose up, wait for postgres healthy AND the MinIO
                          bucket (minio-init is a one-shot container, so `up -d`
                          re-runs it — a deleted bucket heals here)
3/7  database schema      clone from a running cellar-* stack, or build from the
                          checked-in Nhost baseline (transform/run.sh) if there
                          is nothing to clone from
4/7  apps + sidecars      `dev:up --detach`
5/7  readiness            `dev:wait` — a real PingActor call, not a port probe
6/7  seed + sign-in       `dev:seed`, then a real better-auth sign-in as
                          test@test.com, asserted
7/7  image path           `dev:check:images` end to end
```

Every step is idempotent, so re-running it on a working stack is a no-op that
re-checks. Flags: `--tests`, `--no-seed`, `--no-images`, `--from <project>`
(clone source), `--skip-doctor`, `--no-fix`, `--reset`.

The individual commands still exist and still work:

```bash
bun run dev:up --detach     # infra + both apps + both sidecars
bun run dev:wait            # block until they answer
bun run dev:ports           # what are my ports?
bun run dev:seed            # db:seed pointed at THIS stack (see below)
```

### Preflight: `bun run dev:doctor`

```bash
bun run dev:doctor            # report; exit 1 if anything blocks
bun run dev:doctor -- --fix   # ...and remediate what can be remediated safely
```

`bootstrap` runs this first; run it by hand when something is behaving oddly.
Every line it prints is a failure somebody has already paid for here, and the
severities are calibrated so the output stays worth reading:

| | meaning |
|---|---|
| **FAIL** | bootstrap cannot proceed, or a green run would be a lie |
| **WARN** | real, but bootstrap fixes it, or it only bites a command the line names |
| **INFO** | a supported state that has been mistaken for a fault before |

What it knows, and why each one is in there:

- **The `node` on PATH — by capability, not version.** It runs a one-line `.ts`
  file to see whether type stripping works, because that is what
  `node scripts/seed.ts` and the `node "$SEED"` step inside
  `packages/db/transform/test-db.sh` depend on. fnm's `--use-on-cd` does not
  fire in a non-interactive shell, so an agent shell here gets whatever the
  machine default is. It then **resolves** a satisfying Node out of
  fnm/nvm/volta/asdf and puts it in front of PATH for those steps only — no
  machine-wide `fnm default` change, and no human in the loop. The report also
  says what a wrong Node does *not* break: the test suites, which run under
  `bun run --bun vitest run` where `process.execPath` is bun.
- **bun** against the `packageManager` pin, with `bun upgrade` as the remedy —
  Homebrew's formula lags, and `brew upgrade bun` will not fix a mismatch.
- **Blocked dependency build scripts**, via `scripts/check-blocked-builds.mjs`.
  That is the only trustworthy check here: `bun pm untrusted` reports "Found 0"
  while the isolated linker skips them.
- **daprd**, its version against the compose image, and the `dapr` CLI.
- **The port plan**: `selftest`'s exhaustive collision proof, the derivation for
  this slug, and every one of this slot's 19 ports — free, served by this stack
  (containers *and* host processes), or held by something else, named.
- **Other `cellar-*` stacks**, split into a sibling worktree's live stack (leave
  it alone) and leftovers whose worktree is gone. `dev:prune` cannot see the
  second kind: its test is "compose file gone", and a stack started from this
  checkout under another slug keeps a valid compose file forever.
- **Ghost containers**: a container carries the config hash and bind mounts it
  was *created* with, so it can answer every health probe while serving a shape
  the repo no longer has.
- **Anything serving stale source.** `api` and `actors` mount the worktree and
  run `bun src/index.ts` with no watcher, so they serve the tree as of
  `docker start`; `client` has no mount at all, so its source is frozen at
  *build* time. Both are compared against the mtimes of what they read — scoped
  per service, tests excluded — and both remedies differ (restart vs rebuild).
  See "Which services run your working tree, and which run an image" for the
  per-service semantics.
- **`.env`**: a missing or secret-less `infra/.env` (`--fix` creates it with a
  generated `BETTER_AUTH_SECRET`), one still holding the value
  `infra/.env.example` used to publish, which the actor host now refuses at
  boot by digest (`8aad88da`; `--fix` rewrites it, then delete the `jwks` rows),
  and every stray `.env` in the workspace,
  because **bun auto-loads `.env` from the process cwd** where Node did not.
  Values are never read or printed — names only, here and everywhere.
- **Credentials already in your shell**, read from the same list
  `services/api`'s `assertNoDatabaseCredentials` enforces. `dapr run` hands its
  environment to both apps, so a `DATABASE_URL` in your shell stops the API
  booting.
- **An empty or half-built database** — counted honestly, see below.
- **The MinIO bucket**, and whether `minio-init` finished or failed.
- **The AI provider, as three states**, because only one of them is a problem.
- **Image embeddings**: whether a `llama-server` that embeds images is
  configured, reachable and has its vision tower — see below.
- **Test-suite prerequisites that live outside this stack**, see below.

### A fresh worktree's Postgres is empty — and "empty" is not zero tables

`bootstrap` gives it a schema for you. By hand:

```bash
bun run dev:db:clone                       # data + schema from cellar-stack
bun run dev:db:clone -- --schema-only      # structure only
bun run dev:db:clone -- --from cellar-other-worktree
```

This repository's schema comes from the cutover transform of an Nhost dump
(`packages/db/transform/run.sh`), not from a replayable migration chain, so the
quickest working database is a copy of one that already works.

One measured trap, now handled in both `bootstrap` and `db:clone`: **a
brand-new Postgres here reports three "tables", not zero.**
`infra/postgres/init/01-extensions.sql` installs postgis, which brings
`spatial_ref_sys` plus the `geometry_columns` / `geography_columns` views, and
`information_schema.tables` counts views. The first version of `bootstrap`
therefore decided an empty database "already has 3 tables — leaving it alone",
and failed four steps later with `relation "beer_style" does not exist`. Both
commands now count base tables with postgis's excluded, **and** check five
sentinel tables (`beer_style country cellars user account`), because a clone
that copied half the schema is worse than one that copied none. `db:clone`'s own
success assertion had the same hole.

### Seeding: `bun run dev:seed`, not `bun run db:seed`

```bash
bun run dev:seed     # test@test.com / test2@test.com, password 123456789
```

`db:seed` defaults to `postgres://…@localhost:5433/cellar` and
`http://localhost:3002` — the **shared** lane's ports. Run it bare in a
worktree and it seeds somebody else's database through somebody else's actor
host, reports success, and leaves this stack empty. Three things have to line
up, and the third is the one that bites: better-auth refuses a state-changing
request whose `Origin` is not trusted, so the script's `AUTH_TRUSTED_ORIGIN`
has to be this stack's `http://localhost:<WEB_PORT>`, not the compose default
of `:3000`. `dev:seed` sets all three, and resolves a Node that can run a `.ts`
file. (Root `db:seed` now runs `scripts/check-node-version.mjs` first, so on the
wrong Node it fails with that script's message instead of an ESM loader error.)

### The AI provider is three states, and only one is a fault

```
not configured           intentional and fine. AI_PROVIDER unset means
                         `installAI()` installs nothing and every AI seam
                         throws a named error on first use rather than
                         silently degrading. Nothing to chase.
configured + reachable   working.
configured + nothing     the actual misconfiguration.
  listening
```

`doctor` prints which one you are in, and for an OpenAI-compatible server it
defers to `scripts/ai/local-model.sh status` rather than reimplementing the
probe. Two things it will also tell you: every `halfvec` column in this schema
is **768** wide, so a non-768 `AI_EMBEDDING_DIMENSIONS` is a FAIL before
anything is written; and a running vLLM without `--no-enable-prefix-caching` is
called out, because with caching on 3 of 6 embeddings came back silently
corrupted — unit-norm, no NaN, no error.

There is a fourth state peculiar to *this* lane, and it has been read as the
first: `export_passthrough` **defaults `AI_PROVIDER` to `ollama`**, so "I never
set it" does not mean "unset" here. That default is deliberate — a local model
that needs no credentials — and `doctor` says so rather than letting you
conclude the seam is broken.

### Image embeddings: text-only is the default, and that is fine

Image search, the onboarding photo match and item vectors fused with their
label photos need an embedding that takes images. Locally that is one setup:
llama.cpp's `llama-server` serving Qwen3-VL-Embedding-2B, with chat staying on
Ollama, selected by `OPENAI_COMPAT_EMBEDDING_INPUT=llamacpp-multimodal`
(`services/actors/README.md`, "Local image embeddings (llama-server)"). It is
**opt-in**: this lane's default stays `ollama`, which embeds text only, so a
photo search answers `IMAGE_SEARCH_UNAVAILABLE` — the client's "photo search
isn't available", by design. `doctor` reports that as INFO, and also notices a
vision-capable llama-server already listening on `:8091`.

Opted in, it reports one of: reachable and embeds images (OK); no answer at the
configured endpoint; no vision tower (`--mmproj` missing); a build too old to
publish `media_marker`; or an API key the lane lacks. None of these stops the
actor host booting — the provider does no network at boot — but a configured
llama-server that is down fails **every** embedding at call time, text search
included, which is why it is a WARN.

```bash
scripts/ai/local-model.sh embed-install    # pinned GGUF pair, outside the repo
scripts/ai/local-model.sh embed-up         # 127.0.0.1:8091
eval "$(scripts/ai/local-model.sh env llama)"
bun run dev:down && bun run dev:up --detach   # the apps read env at start
```

Every variable involved is on `PASSTHROUGH_ENV` and in the compose actors
`environment:` — `src/lib/ai/env-passthrough.test.ts` fails if one is missing —
because an unlisted name reaches neither lane and the feature silently stays
off. On the compose lane llama-server must listen beyond loopback, so start it
with `LLAMA_EMBED_HOST=0.0.0.0 OPENAI_COMPAT_API_KEY=<k>` and put the same key
in `infra/.env`. Switching either way is a re-embed (`scripts/operator.ts
reembed`): the stored identity names the dialect, its template version and the
image budget.

### Running the tests from a fresh worktree

```bash
bun run dev:bootstrap -- --tests
```

Three prerequisites of `bun run test` live outside this stack entirely, and
`doctor` reports each:

1. `packages/db/transform/test-db.sh` builds `cellar_test_template` in
   **`cellar-stack-postgres-1`** by default — the shared lane, not your
   worktree. Concurrent runs are safe there: the build is serialised on a
   Postgres advisory lock and each run clones its own `_run_<pid>_<epoch>`
   database (`services/actors/src/lib/test-db-setup.ts`). This used to say
   every run DROPs and re-CREATEs a shared `cellar_test`; the per-run databases
   had already replaced that when this file landed in `4e067928`. What is still
   shared is the template's fingerprint, so worktrees whose transform files
   differ rebuild it when they alternate — which is why `--tests` uses this
   worktree's own Postgres.
2. Building the *template* restores the checked-in
   `packages/db/transform/nhost-schema.sql` (X4) and needs no Nhost stack —
   the same input CI uses. It used to re-dump the legacy Nhost container by
   default; that container, and the local Nhost stack, are gone since
   2026-10-05 (AGENTS.md, "Nhost: retired, and how rollback works").
3. One client test file, `src/lib/api/round-trip.test.ts` (the auth proxy's
   end-to-end steps), **skips itself** unless a sign-in as `test@test.com`
   succeeds against `:3002`, so a green suite with its skips proves less than it
   looks. (The D2 document tests used to skip the same way and were the only
   check that catches an invalid GraphQL field; they now validate offline
   against `packages/schema/schema.graphql` in `src/lib/api/documents.test.ts`
   and never skip.) `doctor` performs that sign-in rather than merely pinging
   the port, because an actor host one second into a restart answers `/healthz`
   and refuses the sign-in.

`--tests` passes `--force` to Turbo on purpose: `test` is cached on file hashes,
and a test that depends on a live stack (round-trip above) is not in the hash, so
without it a "test run" can replay a pass from when the stack was up (measured:
11 of 12 tasks came from cache).

`dev:up` without `--detach` runs `dapr run -f` in the foreground and streams both
apps' logs, prefixed `== APP - actors-<slug> ==`. Ctrl-C stops both apps and both
sidecars. With `--detach` the log goes to `.stack/<slug>/logs/dapr-run.log` and
`bun run dev:logs` tails it.

The Next dev server is **not** started by `dev:up` — it is the one process this
lane leaves to you. Your ports are in `dev:ports`; point the app at them:

```bash
PORT=<WEB_PORT> GRAPHQL_API_URL=http://localhost:<API_PORT>/graphql \
  BETTER_AUTH_ORIGIN=http://localhost:<ACTORS_PORT> MINIO_PORT=<MINIO_PORT> \
  bun run dev
```

That is still true of *this* lane, and deliberately: an edit-reload loop wants a
dev server. If what you need is a **served app rather than a dev server** — an
agent that cannot start `bun run dev`, or a browser suite — use the all-compose
lane's `client` container instead ("The containerised client" below).

The command above used to name `NEXT_PUBLIC_API_URL`, which nothing in
`services/client` reads. The Next server's upstream origins are `GRAPHQL_API_URL` and
`BETTER_AUTH_ORIGIN` (`services/client/src/lib/api/config.ts`), and unset they
default to the shared lane's 3001/3002, not to this stack. `MINIO_PORT` is what
the dev CSP's `connect-src` allows for uploads (`next.config.mjs`). Derived from
the code, not run: agents may not start `bun run dev`.

### One-time: the runtime binary

The host-run lane runs the sidecars as host processes, so it needs the `daprd`
binary. It does **not** need `dapr init`'s shared control plane — placement and
scheduler are per-stack containers in your own compose project. Install the
binaries only:

```bash
dapr init --slim --runtime-version 1.18.3
```

That writes `daprd`, `placement` and `scheduler` to `~/.dapr/bin` and **starts
nothing** (verified: no containers created, no processes left running). Match the
runtime version to the images in `infra/docker-compose.yml`. `dev:up` fails with
this instruction if the binary is missing; set `DAPRD_BIN` to override the path.

---

## Why each stack has its own placement service

This is the whole reason the design is shaped the way it is, so it is worth being
precise about.

Actor calls in this repo do **not** use app-id service invocation. They go to the
calling app's *own* sidecar, at `/v1.0/actors/<Type>/<id>/method/<method>` —
`services/api/src/dapr.ts` for the API's hop and `services/actors/src/lib/sidecar.ts` for
the outbox's. Dapr placement routes those calls **by actor type**: each actor host
reports the types it hosts, placement builds one consistent-hash table per type,
and a caller's sidecar looks up `<Type>/<id>` in that table and dials whichever
host owns the partition.

So two actor hosts that both register `ItemActor` **against the same placement
service** are one virtual-actor cluster. Worktree A's API can have its call served
by worktree B's process, reading B's database, and nothing in the request looks
wrong. **Distinct app-ids do not help** — the app-id is not what placement keys on.

Therefore: placement and scheduler are per-stack containers, in the per-worktree
compose project, on per-worktree ports, and each stack's `dapr.yaml` points its
two sidecars at its own pair.

`scripts/stack/isolation-proof.sh` demonstrates both halves — that the isolated
configuration holds, and that removing only the separate placement breaks it.
Measured output is in "The proof" below.

### Actor namespacing — it works, and it is still not the mechanism here

Dapr has namespaced actors: set `NAMESPACE` on `daprd` in self-hosted mode and
the placement service becomes multi-tenant, so sidecars in one namespace receive
no placement information for another. The per-stack placement log already shows
the namespace in play — `unlocking disseminator default/actors-<slug>`.

**It was measured, not assumed.** `scripts/stack/namespace-experiment.sh` puts
both stacks' apps on **one** placement service — stack A's — changing nothing
else, and runs the same census twice:

```
  RUN / CALLER                               A serves   B serves   unknown
  control (no NAMESPACE), A's API            6/10       4/10       0/10
  control (no NAMESPACE), B's API            6/10       4/10       0/10
  NAMESPACE=proof-a/proof-b, A's API         10/10      0/10       0/10
  NAMESPACE=proof-a/proof-b, B's API         0/10       10/10      0/10

  namespace as placement saw it:
    A: unlocking disseminator proof-a/actors-proof-a
    B: unlocking disseminator proof-b/actors-proof-b
```

So actor namespacing **does** isolate two stacks on a shared placement, in this
version, on this path. It is a legitimate alternative and worth knowing. This
lane still does not use it:

- It isolates placement and nothing else. Postgres, MinIO, the collector and
  every app port still have to be per-worktree, so a shared control plane saves
  two containers out of six and adds a second isolation mechanism to reason
  about — and to get wrong.
- The failure mode is silent. A `NAMESPACE` that is unset, misspelled or
  inherited from the wrong shell puts a stack back in `default` with everyone
  else, and it looks exactly like working until an actor id lands on the wrong
  host. A placement address that is wrong, by contrast, fails loudly: `did not
  find address for actor '<Type>/<id>'`.
- The documentation requires a **separate actor state store per namespace**,
  because no namespace information is written into an actor record. This stack's
  store is `state.in-memory` per sidecar (see
  `infra/dapr/components/actor-state.yaml` for why it exists at all), so the
  condition is met by accident rather than by design — fragile if that store ever
  becomes `state.postgresql`.
- A shared placement is a shared failure and a shared restart. Per-stack
  containers cost nothing and make "tear my stack down" mean exactly that.

One sharp edge found while measuring, worth writing down: **`NAMESPACE=""` is not
the same as leaving `NAMESPACE` unset.** daprd 1.18.3 treats the empty value as
set, and its scheduler client then tight-loops on `rpc error: code =
InvalidArgument desc = missing namespace or appID in request` — 50,000 log lines
a minute, measured. If you script this, use `env -u NAMESPACE`, not
`NAMESPACE=`.

---

## How ports are derived

Every port is `base + slot × 20`.

**Slot 0 is the shared `cellar-stack` project** — the familiar numbers — and is
never handed to a worktree. Slots 1–24 belong to worktrees.

The slot comes from `sha256(<worktree directory name>) mod 24 + 1`. Deterministic
on purpose: the same worktree gets the same ports on every restart, which makes
them predictable in a log and removes any allocation race between two agents
starting at once.

| variable | base | slot 12 example |
|---|---|---|
| `WEB_PORT` (Next, not started here) | 3000 | 3240 |
| `API_PORT` | 3001 | 3241 |
| `ACTORS_PORT` | 3002 | 3242 |
| `GRAFANA_PORT` | 3010 | 3250 |
| `API_DAPR_HTTP_PORT` | 3501 | 3741 |
| `ACTORS_DAPR_HTTP_PORT` | 3502 | 3742 |
| `OTLP_GRPC_PORT` | 4317 | 4557 |
| `OTLP_HTTP_PORT` | 4318 | 4558 |
| `POSTGRES_PORT` | 5433 | 5673 |
| `API_DAPR_METRICS_PORT` | 9095 | 9335 |
| `ACTORS_DAPR_METRICS_PORT` | 9096 | 9336 |
| `MINIO_PORT` | 9100 | 9340 |
| `MINIO_CONSOLE_PORT` | 9101 | 9341 |
| `API_DAPR_GRPC_PORT` | 50001 | 50241 |
| `ACTORS_DAPR_GRPC_PORT` | 50002 | 50242 |
| `API_DAPR_INTERNAL_GRPC_PORT` | 50003 | 50243 |
| `ACTORS_DAPR_INTERNAL_GRPC_PORT` | 50004 | 50244 |
| `PLACEMENT_PORT` | 50005 | 50245 |
| `SCHEDULER_PORT` | 50006 | 50246 |

The stride of 20 and the cap of 24 slots are not decoration. With these bases, no
port from one slot can equal a port from another — `bun run dev:selftest`
checks every (slot, base) pair exhaustively and fails if a base is ever added
that breaks it. Two of the gaps are tight: `GRAFANA_PORT` (3010) and
`API_DAPR_HTTP_PORT` (3501) are 491 apart, so the maximum offset must stay under
500, which is where "24 slots × 20" comes from. Add a base, run `dev:selftest`.

### Finding your ports

```bash
bun run dev:ports      # human table, with URLs
bun run dev:env        # shell `export` lines, for `eval "$(...)"`
bun run dev:status     # containers, host sidecars, endpoint probes
```

`dev:env` deliberately does **not** print `DATABASE_URL` as an export.
`services/api` refuses to start if it can see a database credential
(`assertNoDatabaseCredentials`), and `dapr run` hands its own environment to both
apps — so the connection string reaches `services/actors` only, through the generated
run file. This was not theoretical: the first version of `stack.sh` exported it
and `services/api` died on boot with *"must not hold database credentials, but found:
DATABASE_URL"*. `dev:selftest` now cross-checks the export list against the
forbidden list read out of `services/api/src/config.ts`.

### Slot collisions

Two worktree names can hash to the same slot. `dev:up` handles it rather than
hoping: before pinning, it lists every listening TCP port on the machine and, if
any of the slot's 19 ports is taken, walks to the next free slot. The result is
written to `.stack/<slug>/slot` and reused from then on, so it is stable too.

```
==> stack my-worktree — slot 7, offset +140 (derived 5, moved to 7 (ports in use))
```

Overrides, in order of precedence:

```bash
CELLAR_STACK_SLOT=19 bun run dev:up    # force a slot
CELLAR_STACK_SLUG=scratch bun run dev:up   # force an identity (two stacks in one worktree)
bun run dev:up -- --reset              # forget the pin and re-derive
```

If all 24 slots are occupied, `dev:up` says so and points at `dev:prune`.

---

## Tearing down

```bash
bun run dev:down                  # stop the apps, remove this project's containers
bun run dev:down -- --volumes     # ...and its Postgres/MinIO/scheduler/otel-lgtm volumes
```

`--volumes` also removes the project's `otel-lgtm-data` volume: every log,
metric and trace, and Grafana's alert state and silences. Without it they
survive `dev:down` and any recreate of `otel-lgtm` (since 2026-09-27; see
"Grafana in the local lanes" below).

`dev:down` refuses to take down the shared `cellar-stack` project unless you pass
`--force`; use `bun run stack:down` for that lane.

### Stale stacks from a deleted worktree

Deleting a worktree does not delete its containers or its named volumes. Compose
records the file a project was created from, so an orphan is a `cellar-*` project
whose compose file is gone:

```bash
bun run dev:prune             # list: live vs ORPHAN
bun run dev:prune -- --apply  # `docker compose -p <name> down --volumes --remove-orphans` each orphan
```

`cellar-stack` is excluded by name and never pruned. Projects that are not
`cellar-*` — such as a legacy Nhost stack brought up from a `82450ad1`
checkout, named after its directory — are not considered at all.

---

## What differs between the two lanes

Both lanes run the same code from the same workspace. Seven things differ, and each
one is a consequence of the apps being host processes:

1. **Hostnames.** Compose-lane environment uses service names (`postgres`,
   `minio`, `actors`, `otel-lgtm`); the host lane uses `127.0.0.1` / `localhost`
   with the derived port.
2. **The Dapr resources directory.** The component-schema reference for 1.18
   lists exactly four templated metadata values — `{uuid}`, `{podName}`,
   `{namespace}`, `{appID}` — and no environment interpolation, so a component
   file cannot carry a per-worktree port. The host lane's copies are therefore
   **generated** into `.stack/<slug>/dapr/` from `infra/dapr/components/` and
   `infra/dapr/config.yaml` on every `dev:up`, rewriting `minio:9000` and
   `otel-lgtm:4318`. One source of truth, regenerated rather than duplicated —
   and `stack.sh` **asserts** the rewrite landed and fails the run if it did not,
   so this does not depend on the claim staying true.
3. **The scheduler's broadcast address.** The scheduler does not merely accept the
   address a client dialled — it answers with the address daprd should use from
   then on, and by default that is its own container IP. A host sidecar told to
   use `172.30.0.4:50006` fails every reminder with `rpc error: code = Canceled
   ... while waiting for connections to become ready`.
   `infra/docker-compose.hostrun.yml` passes
   `--override-broadcast-host-port=127.0.0.1:<SCHEDULER_PORT>` for exactly this.
4. **Ollama.** `host.docker.internal:11434` on compose, `localhost:11434` on the
   host. Shared between stacks on purpose: it holds no per-stack state. The same
   goes for an opt-in `llama-server` on `:8091` (image embeddings), with one
   difference: on compose it must listen beyond loopback, so it needs
   `--api-key` (`scripts/ai/local-model.sh embed-up` with `LLAMA_EMBED_HOST`).
5. **Presigned URLs.** See below.
6. **The apps are not restarted by `docker compose restart`.** Use `dev:down` then
   `dev:up`, or Ctrl-C and re-run in the foreground. **After registering a new
   actor type you must restart both the app and its sidecar** — the sidecar
   reports its hosted types to placement once, at startup. `dapr run -f` restarts
   them together, so "stop and start the stack" is the whole procedure in this
   lane.

7. **Dapr runtime metrics.** `otel-lgtm`'s Prometheus scrapes `actors-dapr:9090`
   and `api-dapr:9090` by compose service name
   (`infra/grafana/otel-lgtm/prometheus.yaml`). In this lane those sidecars are
   host processes serving metrics on `ACTORS_DAPR_METRICS_PORT` /
   `API_DAPR_METRICS_PORT`, so — same move as item 2 — `stack.sh` generates
   `.stack/<slug>/prometheus.yaml` from the committed file with those two
   targets rewritten to `host.docker.internal:<port>`, asserts the rewrite, and
   `infra/docker-compose.hostrun.yml` mounts it over the base file's (compose
   merges `volumes` by container path). The `up` panel's legend therefore reads
   `host.docker.internal:<port>` here rather than `actors-dapr:9090`; the
   series' `app_id` label says which sidecar. Before this, both targets sat at
   `up == 0` and the dashboard's Dapr row showed only placement and scheduler.
   Measured 2026-09-27 on this worktree's lane (slot 12): all four targets
   `up == 1`, and `dapr_runtime_component_loaded` answered for both
   `actors-<slug>` and `api-<slug>`.

CI is unaffected by the host-run lane: `.github/workflows/stack-ci.yaml` uses
`infra/docker-compose.yml` for two things only — `up -d --build --wait postgres`
for the actors suite and `config --quiet` — and
`infra/docker-compose.hostrun.yml` is an addition that no CI job loads. The
Playwright suite drives the all-compose stack — `localhost:3003`, the
containerised client, by default (next section); point `E2E_BASE_URL` at
`localhost:3000` to drive a host dev server instead. The `baseURL` default in
`packages/e2e/playwright.config.ts` is authoritative.

---

## Which services run your working tree, and which run an image

Nothing said this before, and it has already misled an agent, so:

| service (all-compose lane) | source | picks up an edit |
|---|---|---|
| `api` | **bind mount** `..:/workspace`, `bun src/index.ts` | on restart — `docker compose … restart api` |
| `actors` | **bind mount** `..:/workspace`, `bun src/index.ts` | on restart (and a NEW actor type needs its sidecar restarted too) |
| `client` | **built into its image** (`services/client/Dockerfile`) | only after `bun run stack:client:build` |
| `postgres` | built from `infra/postgres` | image rebuild |
| `otel-lgtm` | pinned image `grafana/otel-lgtm:0.32.1`; **config** bind-mounted from `infra/grafana/` (provisioning directory, `otel-lgtm/prometheus.yaml`); data on the `otel-lgtm-data` volume | alert rules and dashboards: the admin reload API (below) or a recreate; Prometheus config: recreate |
| everything else | pinned upstream images | n/a |

`api` and `actors` are mounted because both runtimes execute TypeScript
directly, so there is nothing to build; `client` is built because Next has a
real build and because that is what makes the app servable with no host process.

**Neither mounted service watches the filesystem.** A bind mount invites you to
expect `next dev`-style reload; there is none. `api` and `actors` serve whatever
the tree contained when the container last started and never pick an edit up on
their own — which is why the "picks up an edit" column says *on restart*, and it
means restart, not save. Measured 2026-09-17: `cellar-stack-actors-1` went on
serving a broken mid-refactor snapshot for **nine minutes** after the source on
disk was already correct. The client container is the opposite failure mode: no
bind mount at all, so it serves its image and an edit needs
`bun run stack:client:build`, which rebuilds the image and recreates the
running client together with `client-files-loopback` (`scripts/stack/client.sh`
— a bare `up -d client` orphans that sidecar). The two behave in
opposite ways and neither is obvious from the outside; when a change seems not
to have taken, check which of the two you are looking at before debugging the
code.

### Grafana in the local lanes

`otel-lgtm` (Grafana on `GRAFANA_PORT`, 3010 on the shared lane) keeps the
image's **anonymous Admin** access in both local lanes, on purpose: it is
published on `BIND_ADDR`, loopback by default, and every check in this repo is a
bare `curl localhost:3010/api/…`. Production turns it off
(`deploy-loki.md` §9.1). Set `BIND_ADDR=0.0.0.0` and this Grafana is an
unauthenticated admin console for your LAN.

One thing anonymous Admin cannot do, because it needs Grafana's *server*
admin rather than org admin: the provisioning reload endpoints answer 403
(`provisioning:reload`). Use the local admin account, `admin:admin` unless you
changed it:

```bash
curl -s -u admin:admin -X POST http://localhost:3010/api/admin/provisioning/alerting/reload
curl -s -u admin:admin -X POST http://localhost:3010/api/admin/provisioning/dashboards/reload
```

That is how an edited alert rule goes live without recreating the container.
A recreate works too and, since the `otel-lgtm-data` volume, loses nothing: on
`cellar-stack` (2026-09-27) three recreates kept Loki lines, Grafana's
annotations, silences and firing-alert state, and Prometheus history back to
2026-09-20. The `docker compose` project, file and `--no-deps` rule from
AGENTS.md still apply — recreate `otel-lgtm` alone.

**The hazard that follows from the mount, stated plainly: the shared
`cellar-stack` lane executes whatever is in the working tree right now,
uncommitted changes included, from every agent sharing the worktree.** Measured
cost, 2026-09-17: a mid-refactor `paged()` in
`services/actors/src/lib/collection-actor-base.ts` left three collection actors
throwing `TypeError: scope is not a function`, which produced 500s on
`/discoveries` and `Unexpected error` on `/cellars/add`, `/rankings` and
`/friends` — 6 of 9 failures in a Playwright run, plus the skips that cascaded
from them. Nothing was wrong with the app as committed.

So **evidence from this lane must be qualified with the tree state it was taken
against.** `git rev-parse --short HEAD` plus `git status --porcelain` at the
start of a run is the whole of it; a result quoted without them is not a
measurement of anything durable.

**And the restart itself is shared, which is the inverse hazard.** Everything
above describes the container running *behind* the tree; a restart fired by
somebody else catches you *ahead* of it. `docker restart cellar-stack-actors-1`
reloads from disk, so it publishes whatever every agent's files happen to say at
that instant — including a file one of them is halfway through writing. The
table above reads as though you restart to pick up your own edit. You do not
control when it happens: any agent may restart for their own reasons, at any
moment, and your unfinished work becomes the running system.

Measured 2026-09-19: two agents were fixing separate authorization holes in
`services/actors`, and one announced a restart while the other was mid-edit in
`place-actor.ts`. Both would have been misled, in opposite directions — the
restarter's own e2e gate would have been running a stranger's half-applied
change, and the editor would have been measuring code it had not finished
writing. It was caught only because the restart was announced first.

Two habits follow, and the first is cheap enough to be unconditional:

- **Announce a restart of a shared container before you fire it**, and check
  `git status --porcelain -- <the files anyone else is likely in>` immediately
  beforehand. A clean path means nobody is mid-edit there.
- **Get to a coherent state before you go idle**, not just before you commit.
  In a shared worktree there is no moment at which a half-written file is
  private; `services/actors` is one `docker restart` away from production for
  everyone sharing the stack.

This is the same rule as the git index, the stash stack and the test-database
template, reached from a fourth direction: the thing that looked per-agent is
the *timing* of the reload, and it is not yours either.

**And since `9b5de517` a restart can fail to come back at all.** Before it
serves anything, the actor host compares `cellar_meta.schema_migrations` with
the migrations in `packages/db/migrations` — which, on this lane, is the
*working tree's* directory, bind-mounted like the rest — and refuses to boot if
any is missing or was recorded from a different `migration.sql`, printing each
(`missing: <name>`) with the command to run
(`services/actors/src/lib/boot-preflight.ts`). A migration somebody committed
(or merely wrote) since the database was last migrated is therefore enough to
keep `cellar-stack-actors-1` down on its next restart. So **run `db:migrate`
against the shared database before restarting `actors`**, `--status` first
(read-only; exit 3 means pending):

```bash
node packages/db/src/migrate/cli.ts --url postgres://cellar:cellar@localhost:5433/cellar --status
node packages/db/src/migrate/cli.ts --url postgres://cellar:cellar@localhost:5433/cellar
```

with the pinned Node on `PATH` — under Node 20 the CLI dies on
`ERR_UNKNOWN_FILE_EXTENSION ".ts"` before it reads anything. There is no
default database: the CLI does not read `DATABASE_URL` (`cli.ts`, on purpose).
Measured 2026-09-28: the shared database was 4 migrations behind the tree
(`20260928161441_recipe_vectors_one_per_recipe` through
`20260928164656_display_names_are_not_emails`) while its actor host was still
serving the pre-restart snapshot. The per-worktree lane's equivalent is
`bun run dev:migrate`, which `dev:bootstrap` already runs. Under
`NODE_ENV=production` the same preflight also refuses `DAPR_API_TOKEN`,
`APP_API_TOKEN` or `MINIO_ROOT_PASSWORD` at their published development
defaults; neither local lane sets `NODE_ENV=production`, so that half never
fires here.

### Why the mount stays, for now

Two corrections to the obvious fix, both of which change the answer:

1. **An image build would give *snapshot* semantics, not git parity.**
   `docker build` copies the **working tree** into the context, uncommitted
   changes and all — it does not read `HEAD`. So "build it instead" buys "the
   running stack stops changing mid-run", which is worth having, and does *not*
   buy "anchored to a SHA". Getting that needs a clean-tree assertion or a
   `git archive` context, which is a third thing.
2. **"So it matches CI" is empty here, because CI does not run these
   containers.** `.github/workflows/stack-ci.yaml` uses this compose file for
   exactly two things: `up -d --build --wait postgres` (Postgres alone, for the
   unit suites) and `config --quiet` (a lint of the file). No CI job starts
   `api`, `actors` or the Playwright suite. There is no CI parity to preserve in
   this lane; the property it actually needs is snapshot stability during a run.

And one measured-by-reading obstacle to swapping the mount for the existing
images: `services/{api,actors}/Dockerfile` build **production** images
(`ENV NODE_ENV=production`), and `assertPublicAuthOrigins` in
`services/actors/src/auth/config.ts` *refuses to start* in production with a
loopback `BETTER_AUTH_URL` ("must be the public https origin in production") or
a loopback entry in `AUTH_TRUSTED_ORIGINS` — both of which this lane sets by
design. So `volumes: !reset []` plus the built image does not boot as-is; a
correct version needs a dev-mode target or an explicit `NODE_ENV` override, and
then needs measuring.

That obstacle was read out of `config.ts`, **not** measured live, and the reason
is itself worth recording: a second actor host that *did* boot would register
all of its actor types with this project's shared placement service and
immediately start serving a fraction of any running suite's actor calls — the exact
cross-stack hazard "Why each stack has its own placement service" above exists
to prevent. Not a thing to try while someone else's run is in flight.

The decision, therefore: **keep the bind mount, document the hazard (above), and
treat "freeze the shared lane" as a deliberate change of its own** — an overlay
in the shape of `infra/docker-compose.prod.yml`'s `volumes: !reset []`, plus the
`NODE_ENV` question, plus a measurement, landed when no suite is running against
the lane. The per-worktree lane is the right place for iterating on
`api`/`actors` source in the meantime; that is what it is for.

## The containerised client

`infra/docker-compose.yml` has a `client` service: **services/client, built into
its image and served by `next start`, on host port 3003.**

It exists because of a structural gap. `bun run test:e2e` needs a browser
pointed at a running Next app, and `AGENTS.md` forbids agents from starting
`bun run dev` — the user owns that process. Before this service the only app on
the machine was the user's own dev server, so "run the e2e suite" was not
something an agent could do at all. Now it is:

```bash
bun run stack:up                 # builds the image on first run, then starts it
bun run test:e2e                 # no override needed: the suite's default IS 3003
```

The suite's `baseURL` default moved to `http://localhost:3003` once this service
existed (`packages/e2e/playwright.config.ts`, which is authoritative — read the
port there rather than trusting one quoted in prose, including here). There was
briefly a `test:e2e:stack` script pinning that URL; it was collapsed into the
default and is gone. To drive a host dev server instead:

```bash
E2E_BASE_URL=http://localhost:3000 bun run test:e2e
```

### Why 3003 and not 3000

3000 belongs to `bun run dev`, all day, on the host. Publishing the container
there would mean exactly one of the two could be up — and the failure would be a
port-binding error at the *worst* time, in the middle of someone's debugging
session. So the container takes **3003**, next in the 3001/3002 sequence, and
both lanes coexist. Consequences worth knowing:

- The variable is `CLIENT_PORT`, **not** `WEB_PORT`. `bun run dev:env` exports
  `WEB_PORT` for the host-run lane's own derived Next port; reusing that name
  would make `eval "$(bun run dev:env)"; bun run stack:up` publish this
  container on the port that shell's dev server is about to want.
- 3003 is not in any per-worktree slot's range — those start at `base + 20` —
  so no worktree stack can collide with it, and no new base was added to
  `scripts/stack/stack.sh` (nothing for `dev:selftest` to re-derive).
- `AUTH_TRUSTED_ORIGINS` has to contain the origin the app is *served on*,
  because the Next auth proxy forwards the browser's `Origin` verbatim and
  better-auth CSRF-checks it. The compose file **appends**
  `http://localhost:${CLIENT_PORT:-3003}` to whatever the variable holds rather
  than folding it into the default, so an `infra/.env` that overrides
  `AUTH_TRUSTED_ORIGINS` cannot silently un-trust a service in its own compose
  project. Changing it needs the actor host recreated —
  `docker compose -f infra/docker-compose.yml up -d actors` — since the list is
  read once, at startup.

### It is a build, not a mount

Unlike `api` and `actors`, this service has **no `..:/workspace` volume**. Those
two run TypeScript straight off the mount because both runtimes execute `.ts`
directly and there is nothing to build; Next has a real build, and it happens in
`docker compose build`. The mount would shadow the image's `.next` and its
`node_modules` — the same trap `infra/docker-compose.prod.yml` needs `!reset`
for on the other two services.

So source edits are not live here. After changing client code:

```bash
bun run stack:client:build       # build client, then recreate client + client-files-loopback
bun run stack:client:up          # recreate both without rebuilding
```

Never `docker compose … up -d client` on its own: `client-files-loopback`
joins the client's network namespace by container id, so recreating the client
alone leaves the sidecar running in a namespace that no longer exists, and
`/_next/image` stops reaching MinIO with nothing in any log. `bun run dev:doctor`
fails on that state.

A full cold build measured ~2 min; the `next build` step inside it, 14s. The
image is ~2.2 GB because it keeps the whole install (devDependencies included)
rather than doing a second `--production` pass — see the comment on the runtime
stage in `services/client/Dockerfile` for why, and what to revisit if the image
ever ships.

Two things about that Dockerfile are load-bearing rather than incidental:

1. **The base is `node:24-bookworm-slim` with the bun binary copied in**, like
   `services/{api,actors}/Dockerfile`. In the `oven/bun` images `node` is a
   symlink to bun, so on that base the Node fallback would *look* like it
   worked while running bun twice. Measured in the built image:
   `node -e 'process.versions'` reports `node: 24.20.0` with
   `bun: undefined`, and PID 1 is `bun run --bun next start`. The A/B is one
   command and no rebuild:
   `docker compose … run --rm client node node_modules/.bin/next start`.
2. **The service sets no compose `command:`.** The image's `CMD` decides the
   interpreter, in one place. `api` and `actors` must set one because their
   `dockerfile_inline` base has no `CMD` at all; here a `command:` would
   silently override the `CMD` — which is how this project once ran a runtime
   migration on the wrong interpreter with every dashboard green.

It also carries its own **`services/client/Dockerfile.dockerignore`**. The root
`.dockerignore` excludes `services/client` outright so the two backend images do
not drag the repo's largest dependency tree through their contexts, and a
root-level exclusion cannot be re-included from inside a Dockerfile; BuildKit
prefers a `<dockerfile>.dockerignore` when one exists, and *replaces* the root
file with it rather than merging. It is the mirror image: client and schema in,
backend source out, every `package.json` kept (one root lockfile means
`--frozen-lockfile` validates against every member it can see).

### What it does not fix

**Image uploads.** In the all-compose lane `FileActor` and the `files` binding
sign URLs for `minio:9000`, which no browser can resolve — the limitation
"Images in development" below describes, unchanged by this service. The image's
CSP is built with `FILES_S3_PUBLIC_URL=http://localhost:9100` so `connect-src`
*allows* the published MinIO port, but a URL signed for `minio:9000` still
cannot be fixed by an allowlist: SigV4 covers the `Host` header. Use the
host-run lane (`bun run dev:check:images`) for anything upload-shaped.

### Production does not use it

`infra/docker-compose.prod.yml` gates this service behind a profile nothing
enables, because production serves the frontend from **Vercel**
(`docs/architecture/deploy-loki.md` §2.5). That is not decoration: the deploy
workflow runs a bare `docker compose … up -d --remove-orphans` with no service
list, so without the gate a merge to `main` would build Next on Loki and publish
it. Verified with `docker compose -f … -f infra/docker-compose.prod.yml config`:
`client` is absent from the merged service list and `3003` appears nowhere in it.

---

## Images in development

`FileActor` hands the browser two signed URLs: an upload PUT it signs itself
(`services/actors/src/lib/s3-presign.ts`) and a read GET from the `files` Dapr
binding. SigV4 covers the `Host` header, so the URL's authority and the signed
authority are the same string by construction — a `/etc/hosts` alias or a proxy
rewrite cannot rescue a mismatch, only produce `SignatureDoesNotMatch`.

In the all-compose lane both are signed for `minio:9000`, which a host browser
cannot resolve. In the host-run lane the app and the sidecar are both on the host,
so one name is correct from both sides: the generated
`files-binding.yaml` gets `endpoint: http://localhost:<MINIO_PORT>` and the app
gets `FILES_S3_ENDPOINT=localhost` / `FILES_S3_PORT=<MINIO_PORT>`. Same host, same
port, same signature, and the browser can reach it.

Verify it for your own stack:

```bash
bun run dev:check:images
```

It runs the whole path and asserts each step: `createUploadTarget` (signed by
the app), PUT the bytes, `verify` (through the binding), `presignRead` (signed by
the binding), GET the URL, byte-compare. Both signers must agree with what a
browser can dial, which is why both are checked.

Measured on stack `epic-burnell-4b4be9` (MinIO on `localhost:9340`), 2026-09-10:

```
  OK   1. upload URL signed for localhost:9340 (app-side signer)
  OK   2. PUT the bytes straight to MinIO from the host (HTTP 200)
  OK   3. FileActor.verify confirmed the object through the files binding
  OK   4. read URL signed for localhost:9340 (Dapr binding signer)
  OK   5. GET the presigned read URL: HTTP 200, 68 bytes, byte-identical to what was PUT
```

And the last step a script cannot assert: a 512x512 PNG uploaded this way,
`presignRead`'s URL pasted into a browser, **renders**. That is the limitation
`infra/dapr/components/files-binding.yaml`'s `TODO(A8/E3)` describes, gone for
local development — though the TODO itself still stands for production, where
the answer is a public hostname in front of MinIO, not `localhost`.

---

## The proof

```bash
scripts/stack/isolation-proof.sh              # run it
scripts/stack/isolation-proof.sh --keep       # leave both stacks up
scripts/stack/isolation-proof.sh --clean      # tear the proof stacks down
```

Two stacks, `proof-a` and `proof-b`, each with its own compose project, Postgres,
placement and scheduler. Each database gets one sentinel row in each of the ten
reference tables, naming the stack it lives in. Every probe is a real actor
invocation through an **API sidecar** — the same URL `services/api/src/dapr.ts`
builds — so the response names the database that the answering actor host is
connected to. Then:

- **Phase 1** — each stack on its own placement.
- **Phase 2** — stack B's apps restarted against stack A's placement service.
  Nothing else changes; the app-ids stay distinct.
- **Phase 3** — B put back on its own placement.

Measured (2026-09-10, Dapr 1.18.3, CLI 1.18.0):

```
  PHASE                              served by A   served by B   unknown
  1 own placement, A's API           10/10         0/10          0/10
  1 own placement, B's API           0/10          10/10         0/10
  2 SHARED placement, A's API        6/10          4/10          0/10   <-- the hazard
  3 own placement again, A's API     10/10         0/10          0/10

  phase 2 map: beer_style=A coffee_cultivar=B country=A sake_category=A
               sake_rice_variety=B sake_type=A spirit_type=B tea_category=A
               wine_style=B wine_variety=A
```

Phase 2 is the point: **four of ten** actor ids requested through **stack A's**
API were served by **stack B's** process against **stack B's** database, with
distinct app-ids (`actors-proof-a` / `actors-proof-b`) throughout. The split is
the consistent hash assigning each id to one of the two hosts — exactly the
behaviour that makes it hard to notice: the same id answers consistently, from
the wrong database. That is the failure this design exists to prevent, and it is
one configuration line away.

---

## Troubleshooting

**Anything at all is behaving oddly** — `bun run dev:doctor` first. Every entry
below is one of its lines, and it checks a dozen things this list does not.

**A suite that was green yesterday has seven unrelated-looking failures, or
`bun run db:seed` dies with an ESM loader error** — check `node -v` against
`.nvmrc` before believing any of it. `dev:doctor` says so in one line, and
`dev:seed` resolves a working Node by itself.

**The API answers, but with behaviour the code no longer has** — the container
or host process is serving the tree as of when it started; nothing mounts with a
watcher. `dev:doctor` names the container and lists the files that changed since
it started.

**`ERROR no daprd binary at ~/.dapr/bin/daprd`** — run
`dapr init --slim --runtime-version 1.18.3`. Slim mode installs binaries and
starts nothing.

**`render.mjs: ... unresolved placeholder(s): X`** — `dapr.template.yaml` names a
variable `stack.sh` does not export. Deliberate: an unresolved placeholder is a
startup error rather than a sidecar quietly binding port 0.

**`cannot unmarshal !!str ... into []string`** — `resourcesPaths` in a run file is
a YAML sequence, not the comma-separated string the run-template reference shows.
CLI 1.18.0 unmarshals it into a Go `[]string` and rejects a scalar.

**`did not find address for actor '<Type>/<id>'`** — the actor host is not
registered for that type with *this* sidecar's placement service. Either the
actors app is down, or a newly registered actor type has not had its sidecar
restarted (`dev:down` then `dev:up`).

**Reminders fail with `code = Canceled ... waiting for connections to become
ready`** — the scheduler is broadcasting an address you cannot route to. Check
that `dev:up` loaded `infra/docker-compose.hostrun.yml` (it does) and that the
scheduler container's command carries `--override-broadcast-host-port`.

**`services/api must not hold database credentials`** — something exported
`DATABASE_URL`, `AUTH_DATABASE_URL`, `PGHOST`, `PGPASSWORD` or `POSTGRES_PASSWORD`
into the environment `dapr run` inherits. `dev:selftest` checks the script's own
export list; a variable already set in your shell will also do it.

**Sign-in 403s against `localhost:3003`** — better-auth rejected the `Origin`.
The actor host reads `AUTH_TRUSTED_ORIGINS` once, at startup, so a container
started before that list gained the client's origin still has the old one:
`docker compose -f infra/docker-compose.yml up -d actors`. Check what it
actually has with
`docker inspect cellar-stack-actors-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep AUTH_TRUSTED_ORIGINS`.

**The `client` container serves a stale page** — it serves its image, not your
working tree; there is no bind mount. `bun run stack:client:build` (rebuilds
and recreates it with its sidecar). For a live loop, `bun run dev` on the host.

**`SignatureDoesNotMatch` on an image** — the browser is dialling a different
host:port than the binding signed. Both must be `localhost:<MINIO_PORT>`; see
`.stack/<slug>/dapr/components/files-binding.yaml` for what your stack signs.

**Two stacks want the same port** — see "Slot collisions". `dev:up -- --reset`
re-derives; `CELLAR_STACK_SLOT=<n>` forces.

---

## Files

| path | what |
|---|---|
| `scripts/stack/stack.sh` | the whole lane: derivation, compose, generation, run, teardown, prune, selftest, **doctor, bootstrap, seed** |
| `scripts/stack/render.mjs` | `${VAR}` substitution that fails on an unresolved name |
| `scripts/stack/isolation-proof.sh` | the two-stack demonstration above |
| `scripts/stack/namespace-experiment.sh` | actor namespacing on a shared placement, measured |
| `dapr.template.yaml` | the Multi-App Run template; `${...}` per-worktree values |
| `infra/docker-compose.hostrun.yml` | overlay: publishes placement/scheduler/OTLP, fixes the scheduler broadcast |
| `.stack/<slug>/` | **generated**, gitignored: `slot`, `dapr.yaml`, `dapr/`, `logs/` |
| `services/client/Dockerfile` | the containerised client: `next build` inside the image, `next start` out of it |
| `services/client/Dockerfile.dockerignore` | that image's build context — replaces the root `.dockerignore`, mirror-image of it |
