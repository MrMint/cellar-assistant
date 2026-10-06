# Repository guide for coding agents

This is a bun workspace (bun 1.4.2 — pnpm is gone). **The root is not a
package** — it carries orchestration scripts, the one `bun.lock` and the
toolchain config, and no application code. Everything that builds or runs
lives in `services/*` or `packages/*`.

```
services/client    Next.js frontend        @cellar-assistant/client
services/api       graphql-yoga + Pothos   @cellar-assistant/api
services/actors    Dapr actor host         @cellar-assistant/actors
packages/analysis  test-time TS analysis   @cellar-assistant/analysis
packages/contracts shared types            @cellar-assistant/contracts
packages/db        Drizzle schema          @cellar-assistant/db
packages/policy    visibility rules        @cellar-assistant/policy
packages/schema    GraphQL SDL + gql.tada  @cellar-assistant/schema
packages/e2e       Playwright suite        @cellar-assistant/e2e
```

Task running goes through Turborepo (`turbo.json`): `bun run typecheck`, `bun run test` and
`bun run build` at the root fan out across the graph, and `packages/schema`'s `build`
(`gql.tada generate-output`) is ordered ahead of the client's own codegen and typecheck.

## Bun, not pnpm

`bun install` never reads `pnpm-workspace.yaml` — it silently produces an empty lockfile — so the
workspace globs and the ten-entry version catalog now live in the root `package.json`
(`workspaces.packages` / `workspaces.catalog`); `bunfig.toml` carries everything that's a
*setting* rather than a *shape*, and documents its own measurements inline (it's TOML, so it can
hold comments; `package.json` can't). Four things that look like a mechanical pnpm→bun rename and
are not — see `bunfig.toml` for the measurements, not just this summary:

- `minimumReleaseAge` is in **seconds** here, not pnpm's minutes — 86400, not 1440.
- The exclude key is `minimumReleaseAgeExcludes`, **plural**; pnpm's singular spelling is silently
  ignored, not an error.
- `--frozen-lockfile` does **not** re-check release age the way pnpm did on every install — it's a
  resolution-time filter only, so a frozen install just trusts the committed lockfile.
- `trustedDependencies` replaces `allowBuilds` and loses enforcement doing it: under the isolated
  linker a blocked postinstall is **invisible** — no warning, and `bun pm untrusted` reports
  "Found 0" while the script is skipped. `scripts/check-blocked-builds.mjs` reads the installed
  tree directly instead (both CI workflows, and `bun run check:builds` by hand) — don't trust
  `bun pm untrusted` in this repo.

Bun defaults to the **isolated** linker for a workspace (not hoisted) — structurally what pnpm's
store gave us, so the move didn't unmask any phantom dependency. `linker = "hoisted"` in
`bunfig.toml` would change that; nothing here sets it.

Two operational traps that already cost real time:

- **Homebrew's `bun` formula lags.** It sat at 1.4.0 while 1.4.2 — the pin in `packageManager` and
  in every CI workflow's `oven-sh/setup-bun` — was current. `bun upgrade` tracks real releases;
  `brew upgrade bun` does not.
- **`bun install --filter` skips the root's lifecycle scripts entirely** — measured, and unlike
  pnpm, which ran them on a filtered install too. `scripts/check-node-version.mjs` still runs as
  the root's `preinstall` for a plain `bun install`, but every CI leg installs with `--filter`, so
  both workflows call the script explicitly, right after `setup-node` and before `bun install`.

## Why there are two AGENTS.md files

`services/client/AGENTS.md` carries a block maintained by `next dev`, between
`<!-- BEGIN:nextjs-agent-rules -->` markers. **That block must stay byte-identical**; `next dev`
rewrites it otherwise, and the rewrite lands as an uncommitted change in whatever you were doing.

It lives down there rather than here because it tells you to read `node_modules/next/dist/docs/`
*relative to its own directory*, and warns that in a monorepo `next` may not be visible from the
repo root. That warning describes this repo exactly: `next` is a dependency of `services/client`
and is installed in `services/client/node_modules`. The same sentence at the root would point at a
directory that does not exist.

This file carries no copy of that managed block — a second copy would be both wrong here and
unmaintained, since `next dev` only ever writes the one in its own project directory. Everything
below is the actual project guide, for any agent; `CLAUDE.md` beside this file is just `@AGENTS.md`.

## The backend is Dapr actors, not Nhost/Hasura

This repo migrated off Nhost/Hasura onto the stack in `docs/architecture/target-stack.md`.
`services/actors` (Dapr actors via `@dapr/dapr`, plus better-auth mounted in-process) is now the
**only** process with a Postgres connection. `services/api` (graphql-yoga + Pothos) holds no
database credentials and asserts as much on boot; it verifies better-auth's JWTs against the JWKS
`services/actors` publishes. Database: PostgreSQL 18 (postgis, pgvector, pg_trgm, pgcrypto; no
RLS), db/user `cellar` by default (`infra/docker-compose.yml`).

Commit references in these docs (short shas such as `da1f77af`) point to the migration's
development history, which was squashed into a single commit when the branch was first published;
the full history is kept privately as an archive. A sha that doesn't resolve in this repository is
one of those.

There is no local Nhost stack any more — not in this worktree, not on the dev machine. Rollback is a
checkout of `82450ad1`; see "Nhost: retired, and how rollback works" at the end of this file.

## Prerequisites

**Run `bun run dev:doctor` first, and `bun run dev:bootstrap` to get a working stack.** Everything
in this section is one of the lines `dev:doctor` prints, with the remedy attached, and `bootstrap`
is the whole path from a brand-new worktree to a stack you can sign into — preflight, infra,
schema, apps, seed, a real sign-in, and the presigned-image path, each step asserted. Add
`-- --tests` and it runs the unit suites too. Full detail in
`docs/architecture/local-dev-stacks.md` ("Quick start"). Read the rest of this section when you
want to know *why* a line says what it says; don't work through it by hand.

- Node 24 (pinned in `.nvmrc`), Docker. **Enforced at install time, not in every shell.**
  `package.json` now has an `engines` field (`>=24.14.0 <25.0.0`), and
  `scripts/check-node-version.mjs` checks `.nvmrc` against the running Node and fails loudly on a
  mismatch. It runs as the root's `preinstall` hook for a plain `bun install` — but **`bun install
  --filter` (every CI leg) skips root lifecycle scripts entirely**, measured under bun 1.4.2 and
  unlike pnpm, which ran `preinstall` on a filtered install too — so CI calls the script
  explicitly instead (see "Bun, not pnpm" above). None of that catches a shell that already has
  `node_modules` and just runs `bun test` / `bun run typecheck` with the wrong Node on `PATH`
  (fnm's auto-switch not wired into a non-interactive shell, say): some tests shell out to
  `process.execPath` to run a `.ts` file directly and rely on native type stripping, so under
  Node 20 they fail as seven ordinary-looking assertion failures rather than as an environment
  error (`services/actors/src/auth/migrate-users.test.ts`). Check `node -v` before you believe a
  red suite — or just run `bun run dev:doctor`, which probes whether the `node` on `PATH` can
  strip types at all and then says which commands that breaks. Two mitigations landed since:
  that test file now asserts the Node version up front when it is not running under Bun, and the
  suites themselves run under `bun run --bun vitest run`, where `process.execPath` is bun and
  types are stripped natively. What a wrong Node still breaks is anything invoking `node`
  directly — `bun run db:seed` (now guarded by `check-node-version.mjs`, so it fails with that
  message), `migrate:users`, `migrate:files`, and the `node "$SEED"` step inside
  `packages/db/transform/test-db.sh`. `bun run dev:seed` and `bun run dev:bootstrap` resolve a
  satisfying Node out of fnm/nvm/volta/asdf themselves, without touching your machine-wide
  default.
- Bun 1.4.2 is pinned via `packageManager` in the root `package.json`; check `bun --version`
  against it before assuming a version mismatch is something else (see "Bun, not pnpm" above for
  why Homebrew alone won't keep it current).
- Dapr runtime binaries, for the per-worktree dev lane below:
  `dapr init --slim --runtime-version 1.18.3` (installs `daprd`/`placement`/`scheduler` to
  `~/.dapr/bin`; starts nothing). `dev:doctor -- --fix` runs this for you.
- A `.env`: `infra/.env` (gitignored) needs at least a `BETTER_AUTH_SECRET`, or the actor host
  exits on boot. `dev:doctor -- --fix` copies `infra/.env.example` and generates one. The value
  `infra/.env.example` used to ship is also refused at boot, by digest (`8aad88da`), so an older
  `infra/.env` copied from it stops booting too; `--fix` rewrites it in place and then tells you to
  delete the `jwks` rows so a fresh keypair is minted. Note that
  **bun auto-loads `.env` from the process cwd** where Node did not, so any other `.env` in the
  workspace is live configuration that overrides what `dev:up` exports; `dev:doctor` lists them.
- A database: a fresh worktree's Postgres is **empty**, and "empty" is not zero tables — postgis
  puts three rows in `information_schema.tables` before anything of ours exists.
  `bun run dev:bootstrap` clones a schema and seeds `test@test.com` / `test2@test.com`
  (password `123456789`). Do not run `bun run db:seed` bare in a worktree: its defaults are the
  **shared** lane's `:5433` and `:3002`. Use `bun run dev:seed`.
- Optional: `ollama serve` + `ollama pull nomic-embed-text gemma3:4b` for the AI-backed features
  (semantic search, tier-list insights, item-onboarding defaults, menu extraction, recipe-photo
  vision — `services/actors/README.md`). Leave `AI_PROVIDER` unset to run with those features
  deliberately erroring instead of silently degrading — that is a supported state, and
  `dev:doctor` reports it as one rather than as a fault. One wrinkle it also reports: the
  per-worktree lane's `export_passthrough` **defaults `AI_PROVIDER` to `ollama`**, so "I never
  set it" does not mean "unset" there.

## HARD: never run `bun run dev` or `bun run build`

The user runs the Next.js dev server themselves, in the background. Don't start or stop it.

Three reasons, so the rule can be applied with judgement instead of cargo-culted:

1. **Both commands write into the working tree.** `next dev` rewrites the managed block in
   `services/client/AGENTS.md` (see that file, and
   `node_modules/next/dist/server/lib/generate-agent-files.js`), and a `next build` probe in this
   repo silently mutated `services/client/tsconfig.json` — added paths and reformatted it. Compare
   `next typegen`, which rewrites the root `tsconfig.json`'s `jsx` from `preserve` to `react-jsx`
   (`docs/architecture/migration-plan.md`). The edit lands as an uncommitted change in whatever
   the user was doing, and in a worktree shared by several agents it is nobody's and everybody's.
2. **Port 3000 is the user's.** Their dev server lives there all day; a second one either fails to
   bind or steals the port.
3. **It is a long-lived foreground process.** It does not exit, so it is the wrong shape for an
   agent's command anyway.

The rule is about **host processes**: a `next dev` or `next build` on this machine competes with
the one the user is watching. Building the client image is not that — `bun run stack:client:build`
runs `next build` inside a container, touches no host port and produces no host `.next`. Still
never run `bun run dev` / `bun run build` (or `next dev` / `next build`) directly on the host, and
never via a script that ends up doing it for you.

## Dev environment — two lanes

Full detail in `docs/architecture/local-dev-stacks.md`; summary:

- **Per-worktree (host-run), for interactive/agent work:** start with
  `bun run dev:bootstrap` (preflight, infra, schema, apps, seed, sign-in proof, image path — add
  `-- --tests` for the unit suites) and `bun run dev:doctor` (that preflight alone, `-- --fix` to
  remediate). The pieces underneath: `bun run dev:up [--detach]` (infra
  containers + both apps under `dapr run -f`), `bun run dev:wait`, `bun run dev:seed`,
  `bun run dev:ports` /
  `bun run dev:env` (this worktree's derived ports — every worktree hashes to its own offset, so
  concurrent worktrees never collide), `bun run dev:status`, `bun run dev:logs`,
  `bun run dev:down [--volumes]`, `bun run dev:db:clone` (seed a fresh worktree's empty Postgres
  from a working one), `bun run dev:prune` (reap orphaned `cellar-*` compose projects). The Next
  client itself is **not** started by `dev:up` — that's the one process left to `bun run dev`.
- **Shared (all-compose), used by CI and the Playwright e2e suite:** `bun run stack:up` /
  `bun run stack:down` / `bun run stack:logs` — fixed ports, compose project `cellar-stack`
  (API 3001, actors 3002, **client 3003**, Grafana 3010, Postgres 5433, MinIO 9100/9101).
  This lane now includes the Next client as a container: `services/client/Dockerfile` runs
  `next build` *inside the image* and `next start` out of it, so the whole app is servable with
  **no host process** — which is what makes the e2e suite runnable by an agent at all, given the
  HARD rule above. It is on **3003, not 3000**: 3000 stays free for the user's own `bun run dev`,
  so both can be up at once. Source edits are not live in that container (no bind mount, on
  purpose — the mount would shadow the image's `.next`); rebuild with `bun run stack:client:build`,
  which also recreates the container with its `client-files-loopback` sidecar. Never recreate the
  client alone (`docker compose … up -d client`): the sidecar shares its network namespace by
  container id and is orphaned — use `bun run stack:client:up` (`scripts/stack/client.sh`).

Seed test data: `bun run db:seed` — creates `test@test.com` / `test2@test.com`, password
`123456789`; `/sign-in` redirects to `/cellars` on success.

## Key commands

```bash
bun run typecheck        # tsc across the graph, via Turbo — schema codegen runs first
bun run lint              # Biome lint
bun run lint:fix          # Biome lint --write
bun run format            # Biome format --write
bun run format:check      # Biome format (check only)
bun run check / check:fix # Biome lint + format together
bun run test              # unit tests, via Turbo (excludes e2e)
bun run test:e2e          # Playwright suite (packages/e2e) — defaults to the container (3003)
                          # E2E_BASE_URL=http://localhost:3000 bun run test:e2e  → a host dev server
bun run stack:client:build # rebuild the client image and recreate it (+ its loopback sidecar)
bun run update:all        # bun update --latest --interactive
```

Biome does formatting and linting — not ESLint, not Prettier; there is no config for either to
maintain. GraphQL/graphcache types are generated by Turborepo tasks (`packages/schema#build` runs
`gql.tada generate-output`; the client's own codegen task follows it), not a standalone `codegen`
command — force it directly with `bun run --filter @cellar-assistant/schema build` and
`bun run --filter @cellar-assistant/client codegen` if needed.

## GraphQL / gql.tada

- Schema SDL: `packages/schema/schema.graphql`. Generated types: `packages/schema/graphql-env.d.ts`.
- `services/client/tsconfig.json` points the `gql.tada/ts-plugin` at both.
- Fragments live beside each domain's own API module — `services/client/src/lib/api/*.ts` (e.g.
  `items.ts` → `ItemCoreFragment`, `ItemImageFragment`; `cellars.ts` → `CellarCardFragment`) and
  `services/client/src/components/*-api/`. There is no central `shared/fragments/` directory.
  Compose with gql.tada's `graphql()`; unmask with `readFragment()` or `@_unmask` where a caller
  needs fields directly.

## URQL client

- Client components: `makeApiClient()` from `services/client/src/lib/api/urql-client.ts`.
- Server components: `makeApiServerClient()` / `runApiOperation()` from
  `services/client/src/lib/api/urql-server-client.ts`.
- Auth is better-auth, not Nhost: session-cookie and JWT handling live in
  `services/client/src/lib/api/auth-client.ts`, `session-cookie.ts` and `token.ts`.

## Next.js App Router

- Route group `(authenticated)` wraps protected pages
  (`services/client/src/app/(authenticated)/layout.tsx`).
- Item types: wine, beer, spirit, coffee, sake, tea — each has its own top-level route (`wines/`,
  `beers/`, `spirits/`, `coffees/`, `sakes/`, `teas/`), but the UI is a shared, parameterised `Item`
  interface: generic components live in `services/client/src/components/item-api/`
  (`ItemDetail.tsx`, `ItemEditForm.tsx`, ...), not per-type component folders.
  Adding a seventh type is 39 files, measured at `be70bccf` and split into what typecheck and the
  tests flag and what nothing does — `docs/architecture/migration-plan.md` §9.1.

## State management

XState for complex state machines, React Hook Form for forms, URQL for GraphQL state/caching.

## UI and styling

### Material-UI Joy guidelines
- Prefer Joy UI components over custom components whenever possible.
- Use Joy's design tokens for spacing, color and typography.
- Follow Joy's composition patterns (`Card` + `CardContent`, etc.) and built-in variants/color
  schemes over custom CSS.
- Use Joy's responsive breakpoints and `theme.spacing()`.
- Prefer the `sx` prop (Joy's CSS-in-JS) over external stylesheets.
- Use Joy's semantic color tokens (`primary`, `neutral`, `success`, ...) over hardcoded colors.

### Styling hierarchy
Joy components → `sx` prop → Emotion `styled` → custom CSS (last resort). Use `sx` for one-off or
responsive styling; reach for Emotion only when Joy can't do it; keep theme tokens consistent
throughout.

## Code style

- Biome formats and lints (see Key commands above).
- Avoid non-null assertions (`!`) — use nullish coalescing (`??`) instead.
- Use `satisfies` for type-checking without widening.

## Testing and validation

- Run `bun run typecheck` (root, via Turbo) before committing.
- Run `bun run lint` / `bun run check` (Biome) for style compliance.
- **`bun run test:e2e` is runnable by an agent** — that is new, and it used to be the single
  biggest thing the HARD rule cost us. `bun run stack:up` serves the client from a container with
  no host process, so the suite needs no `bun run dev` and needs no environment override. Point it
  at a host dev server with `E2E_BASE_URL=http://localhost:3000` when you want the other lane.
  Measured 2026-09-17: `specs/01-sign-in.spec.ts` 5/5 green against the container with nothing
  listening on 3000 (which tree was not recorded) — which is the durable claim here, because it
  is about the *lane*.
  **A pass count is not**: run it and read the number. This lane executes everyone's uncommitted
  `api`/`actors` source (next bullet), so "N/84" is a property of one tree at one instant and goes
  stale by the next save — it does not belong in this file, and a count quoted here without a SHA
  beside it is not evidence of anything. Same rule for the port: the authoritative base URL is the
  `baseURL` default in `packages/e2e/playwright.config.ts`, not a number in prose, including this
  file's.
- Evidence from the shared `cellar-stack` lane must be qualified with the tree state it was taken
  against — `git rev-parse --short HEAD` plus `git status --porcelain`. `api` and `actors`
  bind-mount the worktree, so that lane runs everyone's uncommitted changes
  (`docs/architecture/local-dev-stacks.md`).
- Verify auth with the seeded test accounts (`bun run db:seed`): `test@test.com` / `test2@test.com`,
  password `123456789`; `/sign-in` should land on `/cellars`.
- After a front-end change, verify it actually rendered — use the `next-dev-loop` skill
  (`services/client/.claude/skills/next-dev-loop`), which combines Next's own `/_next/mcp`
  introspection with `agent-browser`. It needs a running `next dev`, so it applies **only when the
  user already has `bun run dev` up** — you may not start one. With no dev server, verify against
  the containerised client on 3003 instead; that gives you the browser half but not `/_next/mcp`,
  since the image runs `next start`. (There is no committed design-principles or style-guide doc
  in this repo to check against.)
- Use the IDE `getDiagnostics` tool to check for problems in code.

### Three ways a suite result lies here

All three read as ordinary defects in your change. Check them before you debug code:

1. **The wrong Node.** Seven actors tests fail as plain assertion failures under Node 20 instead
   of the pinned 24 — see "Prerequisites" above and `bun run dev:doctor`, which probes whether the
   `node` on `PATH` can strip types. (This was unverifiable end to end while reason 2 made global
   setup throw first. Reason 2 is fixed; the Node 20 failure has not been re-measured since.)
2. **The shared test-database race — fixed as of 2026-09-20, and listed here so you stop
   suspecting it.** Two agents running a suite at once used to collide on the fixed-name
   `cellar_test_template`, surfacing as `duplicate key … pg_namespace_nspname_index,
   Key (nspname)=(public)`, a throw inside `_initializeGlobalSetup`, or `\unrestrict: wrong key`
   from `packages/db/transform/test-db.sh`. Two changes closed it: `test-db.sh` takes an
   **advisory lock**, which makes concurrent *builds* safe, and each run now clones into its own
   database named `_run_<pid>_<epoch>` (`services/actors/src/lib/test-db-setup.ts`) rather than
   sharing one. The fixed name survives for the *template*, which is shared deliberately — a lock
   can serialise building it, and could never have made a shared run database safe, because a run
   stops holding the lock the moment it starts using the database.
   If you still see one of those three errors, it is news: it means something reintroduced a
   shared run database, and that is worth reporting rather than re-running past.
3. **Load-dependent test counts.** Measured 2026-09-17: **265 → 256 → 265 client unit tests on
   identical source**, purely from stack load (which tree was not recorded; it predates
   `4e067928`). Test files under `services/client/src/lib` that skip themselves when the stack is
   down (a `skip:` option) build their cases in loops, so cases that are never generated are
   never counted. There were seven such files when this was written; since the D2 document tests
   went offline (`src/lib/api/documents.test.ts` validates against the checked-in SDL) there is
   **one**, `src/lib/api/round-trip.test.ts`. Check with
   `grep -rl 'stack is down' services/client/src` rather than trusting either count (it also
   matches a comment in `brand-documents.test.ts`, which no longer skips). A dip is the stack,
   not your code. Load distorts more than counts: at load average **55.85 on 14 cores** a
   Playwright test failed inside `ctx.close()`, in its own trace writer, with every assertion
   passing.

The generalisation, and the reason these sit together: **a number is evidence only if you can say
what it was measured against** — which Node, which tree state, which container start time, and
what the machine was doing. That is the same conclusion as the
`git rev-parse --short HEAD` + `git status --porcelain` rule in
`docs/architecture/local-dev-stacks.md` ("Which services run your working tree"), reached from the
other end: there it is *which source ran*, here it is *what else was happening while it ran*. An
unqualified number is an anecdote.

## Worktrees

Most of the rules below are one rule wearing four hats: **this worktree shares state with every
other worktree and with every other agent working inside this one, and each shared thing looks
per-agent right up until it bites.** Eight are written down: the git stash stack, the git index,
the `cellar_test_template` test database (now fixed), `HEAD` itself, **the moment a shared
container is restarted**, **the Playwright browser cache**, **the agent scratchpad**, and **the
source files themselves, while a mutation runner has them**.

Restarts and the Playwright cache are the ones that do not look like state at all. `docker restart`
reloads the bind-mounted tree from disk, so any agent's restart publishes every other agent's
uncommitted files, a half-written one included (`docs/architecture/local-dev-stacks.md`). A
restart can also fail to come back: since `9b5de517` the actor host **refuses to boot** on a
database `db:migrate` has not reached, printing each missing migration
(`services/actors/src/lib/boot-preflight.ts`), and on the shared lane the migrations it checks
are the working tree's. So **run `db:migrate` against the shared database before any restart of
`cellar-stack-actors-1`** — `node packages/db/src/migrate/cli.ts --url
postgres://cellar:cellar@localhost:5433/cellar --status`, then without `--status`, under Node 24
(`local-dev-stacks.md`, "Which services run your working tree"). Measured 2026-09-28: it was 4
behind while the running host still served, so the next restart would have stayed down. And
`~/Library/Caches/ms-playwright/` is **machine-wide and fixed-path**, shared by every worktree:
`playwright install` at a different version garbage-collects builds through its `.links` registry,
including one a concurrent run has open. Measured 2026-09-20: a build at 22:28 removed
`chromium_headless_shell-1243`, which `@playwright/test` 1.63.0 requires and which had launched
fine at 22:00 and 22:04; the next run died in `browserType.launch` for 55 specs with 29 not run.
That run was **void, not a result** — the distinction matters, because 55 red specs read exactly
like a catastrophic regression. Check `ls ~/Library/Caches/ms-playwright` against
`playwright-core/browsers.json`'s `revision` before believing one. Do not race a fix: ask for the
install to be serialised rather than running it concurrently, since a concurrent install is what
causes this.

The scratchpad is the one that looks *most* private and is not. The directory the harness hands
an agent as "your scratchpad" is **per session, not per agent**: every subagent a session fans
out gets the same path. Measured 2026-09-27: two agents each wrote a `mutate.py` there, one
overwrote the other's, and the first then ran the second agent's mutations — against the second
agent's worktree, since the script carried its own absolute paths. Nothing errored; the output
looked like a result. So: prefix every scratch file with a name that is yours (your task or
agent name, not `test` or `tmp`), and never execute a scratch file you did not write or re-read
in the last few seconds.

The source tree itself is the eighth, and only while someone is mutation testing in it. A mutation
runner rewrites a source file for a few seconds per mutant, runs the tests, and restores it; in a
worktree several agents share, those seconds are everyone's. Measured 2026-09-28: another agent's
full suite ran inside one of those windows, tested the mutant instead of the code, and reported a
false red — nothing in the output said so. So: **mutation testing only ever happens in your own
`git worktree add --detach <path> <sha>`**, never in the shared tree, and with `<sha>` named
explicitly (the isolation bullet below says why a default branch is the wrong one).

A ninth will turn up. When it does — a well-known port, a lockfile, a generated file in the
tree, a rate limit on a shared test account (the e2e suite creates a place per run against a
shared 25/day cap and cleans up nothing) — assume it is shared until you have checked, rather
than after.

- Never `cd` out of your assigned worktree. Each worktree is a separate checkout on its own
  branch, and several are live at once (`docker ps` shows a `cellar-<slug>-*` stack per worktree),
  so a command run in the main checkout or a sibling acts on a different tree — usually another
  agent's in-flight work — while looking like it worked. Agent threads also reset `cwd` between
  bash calls, so use absolute paths rather than relying on where you think you are.
- The git stash stack is shared across worktrees — never bare `git stash` / `git stash pop`. To set
  work aside, prefer a WIP commit, or `git stash push -u -m "<unique-tag>"` and restore with
  `git stash apply <sha>` (not `pop`), found via `git stash list --format='%H %gs'`.
- **The test database was the third instance and is now the one that got fixed** — kept here
  because the fix is the useful part. `cellar_test_template` is still shared and still
  fixed-name, but nothing races on it any more: `packages/db/transform/test-db.sh` takes an
  advisory lock around building it, and each run clones into its own `_run_<pid>_<epoch>`
  database. The distinction is the lesson, and it generalises to the other instances on this
  list: **a lock can protect a shared resource while you are building it, and cannot protect one
  you go on using after you release the lock.** That is why the fix had to split the template
  from the run database rather than just add a mutex.
- **The git index is shared too, and this is the one that keeps biting: always
  `git commit -- <explicit paths>`, never `git add .` / `git add -A` / a bare `git commit`.**
  Several agents work in this one worktree at once, so at any moment the index may hold staged
  work that is not yours; a pathspec-less commit sweeps it in. This happened twice in one hour on
  2026-09-17 — one agent's staged set went into another's commit, and that agent then swept 11 of
  a third agent's files. Both were recovered with `git reset --soft HEAD~1` then
  `git commit -- <path>`, but only because someone noticed. Check `git diff --cached --name-only`
  before committing; `git commit -- <paths>` commits those paths from the working tree and leaves
  the rest of the index untouched.
- **A pathspec is not enough on a file more than one agent edits — and this file is the worst
  case.** `git commit -- <path>` commits the *working tree* state of that path, so it takes any
  other agent's uncommitted edits to the same file along with yours. Measured 2026-09-17, in this
  very section: a commit adding the rule above also swept a concurrent rewrite of "Prerequisites"
  into itself. Nothing was lost and the content was right, but the work landed under someone
  else's commit message, and by the time it was noticed another commit had landed on top, so it
  could not be unpicked without rewriting shas other agents were building on. Before committing a
  shared doc, run `git diff -- <path>` and confirm **every hunk is yours**. If it isn't, stage
  only your own (`git apply --cached` with a filtered patch) or say so in the message rather than
  quietly absorbing it.
- **`HEAD` moves under you too, so never `git commit --amend` or `git reset` on the assumption
  that the tip is still yours.** Another agent may have committed in the seconds since yours.
  Measured 2026-09-17: an amend intended to fix a typo in its own commit message ran after two
  other commits had landed, and so targeted a third agent's commit instead. It happened to be
  harmless — the message had been read from `HEAD` a moment earlier, so the amend rewrote that
  commit with its own bytes and produced the identical sha — but only by luck. Check
  `git log -1 --format='%h %s'` before any history-rewriting command — but treat **`git commit
  --amend` as never safe here, checked or not**. The check cannot close the window: another agent
  can commit between your `git log` and your `amend`, and the thing you rewrite is then a commit
  you never read. That is not a smaller version of the same risk, it is the whole risk, because an
  amend silently *replaces* a message and a sha rather than failing. There is no amount of
  care that makes it safe in a worktree with several agents in it; the safe move is a second
  commit. The same goes for rebasing past a commit you do not own: the shas other agents are
  working from would change underneath them. A typo in a message you already committed past is
  not worth rewriting shared history for.
- **An "isolated" worktree is not necessarily cut from the branch you are on — check its
  ancestry before trusting anything run in it.** Measured 2026-09-27: the Agent tool's
  `isolation: "worktree"` created its worktrees from **`main`**, not from this feature branch —
  and the local `main` ref is `720b018e`, June's tree, older even than the deployed `82450ad1` —
  so an agent "working on this branch in isolation" was editing and testing the pre-migration
  tree (no `services/`, pnpm not bun), and its results described code that is not here. Nothing
  about the worktree says so. Before you rely on one, run
  `git merge-base --is-ancestor <feature-sha> HEAD && echo ok` in it (`<feature-sha>` from
  `git rev-parse HEAD` in the tree you meant); and when you create one yourself, name the commit
  explicitly — `git worktree add <path> <sha>` — rather than letting a tool pick a default branch.

---

## Nhost: retired, and how rollback works

The pre-migration Nhost/Hasura stack is **gone from the dev machine** as of 2026-10-05: its
containers and volumes (including `epic-burnell-4b4be9-postgres-1`), the `nhost` CLI and its state,
and the `mcp-nhost` server. Any instruction to run `nhost up`, `nhost dev hasura …`, `hasura
metadata …` or an `mcp__mcp-nhost__*` tool is dead; the `nhost-hasura-admin` agent and the
`.mcp.json` entry were removed with it.

- **The rollback of record is a checkout of `82450ad1`** (`docs/architecture/e4-decisions.md`
  decision 11) — the pre-migration commit, which still has `functions/` and a complete `nhost/`.
  Never plan a rollback around this branch: `functions/` was deleted at `51881a0c`, so `nhost up`
  here could never start the whole stack even when the CLI existed.
- **Nhost Cloud no longer deploys from `main`, and is not ours to touch.** The repository was
  disconnected from the Nhost project on 2026-10-05, before the migration merged, so the project
  stays frozen at `82450ad1` as the rollback target until it is deleted (`e4-decisions.md`
  decision 15). Nothing in this repository configured it, so nothing here can show it either way:
  the check is that a commit on `main` carries no `nhost` check-run
  (`gh api repos/MrMint/cellar-assistant/commits/<sha>/check-runs --jq '[.check_runs[].app.slug]'`).
  **Merging a release-please PR is still a production deploy, deliberately:** it fast-forwards
  `production`, which Vercel builds as Production, and that is now the frontend's deploy path.
- **Schema changes** are a migration in `packages/db/migrations` (`drizzle-kit generate` output, or
  the hand-written lane), reviewed like any other code change, and applied ONLY by `db:migrate`
  (`packages/db/src/migrate/cli.ts`, which keeps the `cellar_meta.schema_migrations` ledger):
  `bun run dev:migrate` for this worktree's stack, `bun run db:migrate --url <dsn> [--status]` for
  any other. Never `drizzle-kit migrate`/`push` — `packages/db/README.md` says why. Production gets
  it from the deploy, before the new images start (`docs/architecture/deploy-loki.md` §4.1).
- **Every database is built from the checked-in baseline.** `packages/db/transform/run.sh` and
  `test-db.sh` restore `packages/db/transform/nhost-schema.sql` (X4) by default and need no Nhost;
  `--no-dump` is still accepted and means the same thing. A fresh dump is `SRC_CONTAINER=<pg> …
  --dump`, against a legacy Postgres you brought up yourself (from the `82450ad1` checkout) — there
  is no default container name. `scripts/cutover/cutover.sh` likewise needs exactly one of
  `SRC_DSN` / `SRC_CONTAINER` for its `preflight` and `dump` phases, the only two that need a live
  Nhost database at all (`e4-decisions.md` decision 11).
- **`nhost/` is frozen history.** Nothing executable reads it; what remains are provenance comments
  (`nhost/metadata/…`, `nhost/migrations/…`) in actor and contract sources, which `82450ad1` also
  resolves. Don't add to it or build against it.
