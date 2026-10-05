# Cellar Assistant

**Uncork the potential of your collection.**

Cellar Assistant is a self-hostable web app for tracking a drinks collection —
wine, beer, spirits, coffee, sake and tea — across one or more cellars, with
friends, tier lists, a map of the places you drink, and optional AI help for
reading labels and menus.

It is a TypeScript monorepo: a Next.js frontend, a GraphQL API that holds no
database credentials, and a Dapr actor host that owns all data access.

---

## Features

- **Six item types, one interface** — wine, beer, spirit, coffee, sake and tea
  each get their own pages, built from shared parameterised components.
- **Cellars** — group items, share a cellar with friends, and control what
  each audience can see through a central visibility policy.
- **Add items from a photo** — point the camera at a label and have the fields
  filled in for you. *(Needs an AI provider; see below.)*
- **Semantic search** — pgvector embeddings over items, recipes, categories
  and places, not just substring matching. *(Needs an AI provider.)*
- **Tier lists and rankings** — drag items into bands, with rank derived from
  position.
- **Places and a map** — bars, bottle shops and restaurants, with brand and
  menu data attached.
- **Menu scanning** — photograph a drinks menu and match its entries against
  your collection and the recipe library. *(Needs an AI provider.)*
- **Recipes** — cocktail recipes, including extracting one from a photo.
  *(Photo extraction needs an AI provider.)*
- **Friends** — friend requests, and friends-only visibility on everything
  above.

AI-backed features are opt-in. Leave `AI_PROVIDER` unset and each one throws a
named error on first use rather than silently degrading — that is a supported
way to run the app. See [Optional: AI provider](#optional-ai-provider).

---

## Technology

| Layer | Choice | Where |
|---|---|---|
| Frontend | Next.js (App Router), MUI Joy, URQL, XState | `services/client` |
| GraphQL API | graphql-yoga + Pothos — **holds no database credentials** | `services/api` |
| Domain / data | Dapr actors (`@dapr/dapr`), Drizzle ORM | `services/actors` |
| Auth | better-auth, mounted in the actor host; the API verifies JWTs via JWKS | `services/actors` |
| Database | PostgreSQL 18 — postgis, pgvector, pg_trgm, pgcrypto | `packages/db` |
| File storage | Dapr binding → MinIO, via presigned URLs | `infra/` |
| Observability | Dapr OTLP → Grafana (`otel-lgtm`) | `infra/` |
| Tooling | Bun workspaces, Turborepo, Biome, Vitest, Playwright | root |

```
services/client      Next.js frontend        @cellar-assistant/client
services/api         graphql-yoga + Pothos   @cellar-assistant/api
services/actors      Dapr actor host         @cellar-assistant/actors
packages/analysis    test-time TS analysis   @cellar-assistant/analysis
packages/contracts   shared types            @cellar-assistant/contracts
packages/db          Drizzle schema          @cellar-assistant/db
packages/policy      visibility rules        @cellar-assistant/policy
packages/schema      GraphQL SDL + gql.tada  @cellar-assistant/schema
packages/e2e         Playwright suite        @cellar-assistant/e2e
```

The repository root is **not** a package. It carries the orchestration scripts,
the single `bun.lock` and the toolchain config; everything that builds or runs
lives under `services/*` or `packages/*`.

---

## Getting started

### Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node | **24.14.0** | Pinned in `.nvmrc`; `engines` enforces `>=24.14.0 <25`. |
| Bun | **1.4.2** | Pinned in `packageManager`. Not npm, not pnpm, not yarn. |
| Docker | any recent | Runs Postgres, MinIO, Grafana and the Dapr control plane. |
| Dapr CLI | 1.18.3 binaries | `dapr init --slim --runtime-version 1.18.3` — installs `daprd`, `placement` and `scheduler` to `~/.dapr/bin` and starts nothing. |

Homebrew's `bun` formula lags behind real releases. Use `bun upgrade`, and
check `bun --version` reports `1.4.2` before assuming a problem is something
else.

### Install and start

```bash
git clone https://github.com/MrMint/cellar-assistant
cd cellar-assistant
bun install
bun run dev:bootstrap
```

`dev:bootstrap` is the one command for a fresh clone or worktree. It runs a
preflight, starts the infra containers, builds the database schema, starts both
backend apps under `dapr run -f`, seeds test data and proves a sign-in works.

Then start the frontend yourself, in its own terminal, pointed at the ports
`bun run dev:ports` prints for this checkout:

```bash
PORT=<WEB_PORT> GRAPHQL_API_URL=http://localhost:<API_PORT>/graphql \
  BETTER_AUTH_ORIGIN=http://localhost:<ACTORS_PORT> MINIO_PORT=<MINIO_PORT> \
  bun run dev
```

A bare `bun run dev` serves on 3000 and talks to 3001/3002, the shared lane's
ports (`services/client/src/lib/api/config.ts`), not to the stack
`dev:bootstrap` just started: every checkout's ports are offset (see
[the two dev lanes](#the-two-dev-lanes)).

`dev:bootstrap` deliberately does not start the Next dev server — that one
process is left to you.

### If something looks wrong

```bash
bun run dev:doctor          # preflight: names every known silent failure mode
bun run dev:doctor --fix    # and fixes the ones it can (e.g. installs the Dapr binaries)
bun run dev:ports           # this checkout's port table
bun run dev:status          # containers, host sidecars, endpoint probes
bun run dev:logs            # tail the detached `dapr run` log
```

`dev:doctor` exits non-zero only on genuinely blocking problems; warnings are
either handled by `dev:bootstrap` or affect only the command they name.

### Signing in

Seeding creates two accounts, both with password `123456789`:

- `test@test.com`
- `test2@test.com`

`/sign-in` lands on `/cellars` on success. Re-seed at any time with
`bun run dev:seed`. (`bun run db:seed` seeds the shared lane on the fixed
ports, not this checkout's stack.)

---

## The two dev lanes

**Per-worktree (host-run)** — the default, and what `dev:bootstrap` sets up.
Infra in Docker, the two backend apps as host processes under `dapr run -f`.
Every checkout hashes to its own port offset, so several can run at once
without colliding. `bun run dev:ports` prints yours; `bun run dev:env` prints
the same thing as shell `export` lines.

| | |
|---|---|
| `bun run dev:up [--detach]` | bring this checkout's stack up |
| `bun run dev:down [--volumes]` | take it down |
| `bun run dev:wait` | block until the API and actor sidecar answer |
| `bun run dev:db:clone` | seed an empty database from a working one |
| `bun run dev:prune` | reap compose projects from deleted worktrees |

**Shared (all-compose)** — fixed ports, compose project `cellar-stack`. This is
what CI and the Playwright suite use. The client runs *in a container* here, so
no host dev server is needed.

| | |
|---|---|
| `bun run stack:up` / `stack:down` / `stack:logs` | the shared stack |

Its fixed ports: client **3003**, API 3001, actors 3002, Grafana 3010, Postgres
5433, MinIO 9100 (console 9101). Port 3000 is deliberately left free for your
own `bun run dev`.

Full detail: [`docs/architecture/local-dev-stacks.md`](docs/architecture/local-dev-stacks.md).

---

## Testing

```bash
bun run test        # unit + integration suites, via Turbo (excludes e2e)
bun run test:e2e    # Playwright suite (packages/e2e)
```

`bun run test:e2e` needs a running stack and a running frontend — either
`bun run stack:up` (client on 3003, the suite's default `baseURL`), or that
same shared stack plus your own `bun run dev` on 3000, with
`E2E_BASE_URL=http://localhost:3000`. The suite's database fixtures default to
the shared lane's Postgres container (`packages/e2e/fixtures/db.ts`), so a
per-checkout `dev:up` stack is not a drop-in target.

Before opening a pull request:

```bash
bun run typecheck   # tsc across the graph; schema codegen runs first
bun run check       # Biome lint + format together
```

`bun run check:fix` applies what it safely can. Biome does both formatting and
linting here — there is no ESLint and no Prettier config to maintain.

If a suite fails in ways that look like ordinary assertion errors, **check
`node -v` first.** Some tests run TypeScript directly through Node's native type
stripping; under an older Node they fail as plain assertion failures rather
than as an environment error.

---

## Commands

| Command | What it does |
|---|---|
| `bun run dev` | Next dev server (you start this; nothing else does) |
| `bun run build` | production build of every package, via Turbo |
| `bun run typecheck` | `tsc --noEmit` across the graph |
| `bun run test` | unit + integration suites |
| `bun run test:e2e` | Playwright suite |
| `bun run lint` / `lint:fix` | Biome lint |
| `bun run format` / `format:check` | Biome format |
| `bun run check` / `check:fix` | both together |
| `bun run check:builds` | audit which dependency postinstall scripts are trusted |
| `bun run dev:seed` | seed the test accounts and sample data into this checkout's stack |
| `bun run db:seed` | the same, into the shared lane (`stack:up`) on the fixed ports |
| `bun run update:all` | `bun update --latest --interactive` |

GraphQL types are generated by Turborepo tasks rather than a standalone
`codegen` command — `packages/schema#build` runs `gql.tada generate-output` and
the client's own codegen follows it, both ordered ahead of `typecheck`. Force
them by hand with:

```bash
bun run --filter @cellar-assistant/schema build
bun run --filter @cellar-assistant/client codegen
```

---

## Optional: AI provider

Semantic search, tier-list insights, item-onboarding defaults, menu extraction
and recipe-photo vision each reach a model through an injectable seam. With no
provider configured, nothing is installed behind those seams and each one
throws an error naming itself — a deliberate, supported state.

Set `AI_PROVIDER` in `infra/.env` to turn them on. Supported values:

| Value | Notes |
|---|---|
| `ollama` | Simplest local option. `ollama serve`, then `ollama pull nomic-embed-text gemma3:4b`. |
| `openai-compatible` | Any OpenAI-compatible server — `llama-server` (llama.cpp), LM Studio, vLLM. |
| `google-ai` | Gemini via an API key. |
| `vertex-ai` | Gemini via a GCP service account. |

A provider that is **set but incomplete** makes the actor host refuse to start,
on purpose. Two things worth knowing before you switch providers: embeddings
are 768-dimensional because every `halfvec` column is, and changing the
embedding model invalidates every stored vector — two models are two spaces, so
a switch means a re-embed, not a config flip. See
[`services/actors/README.md`](services/actors/README.md).

---

## Contributing

Issues and pull requests are welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md)
for the workflow and the checks CI runs.

**Found a security problem? Please don't open a public issue** — see
[`SECURITY.md`](SECURITY.md).

Developer-facing detail beyond this file lives in
[`AGENTS.md`](AGENTS.md) (conventions, dev lanes, the traps that have cost real
time) and [`docs/architecture/`](docs/architecture/).

---

## Licence

[GNU Affero General Public License v3.0](LICENSE). AGPL-3.0 is a network
copyleft licence: if you run a modified version of this software as a network
service, you must offer its users the corresponding source.

---

## A note on history

This project ran on Nhost and Hasura until 2026 and has since migrated to the
stack described above. A pre-migration Nhost stack is still present in the tree
as a rollback path and as a `pg_dump` source; it is not where new work happens,
and the instructions for it are not repeated here. See the "Legacy rollback
path only" section of [`AGENTS.md`](AGENTS.md) if you need it.
