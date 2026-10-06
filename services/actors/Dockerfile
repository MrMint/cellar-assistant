# Production image for services/actors — the Dapr actor host + better-auth. The
# only process in the stack with a Postgres connection (target-stack.md §1).
#
# BUILD CONTEXT MUST BE THE REPO ROOT, not services/actors/:
#     docker build -f services/actors/Dockerfile -t <tag> .
# Same reasoning as services/api/Dockerfile: the `workspace:*` protocol needs
# the root package.json — which is where the workspace globs live now that bun
# is the package manager — and this app's workspace dependency closure
# (@cellar-assistant/contracts, @cellar-assistant/db, @cellar-assistant/policy)
# present at install time, mirroring stack-ci.yaml's
# `bun install --frozen-lockfile --filter "./services/actors..."`.
#
# Runtime is `bun src/index.ts` (services/actors/package.json's "start"
# script) — no build stage, same as the dev compose bind mount. `node
# src/index.ts` is still installed and still works: it is `start:node`, and
# `CMD` is the only thing that has to change to go back (see the base-image note
# below). The Dapr sidecar contract (infra/dapr/components,
# infra/dapr/config.yaml) is unaffected by how the app is packaged: daprd talks
# to this container over HTTP on APP_PORT, exactly as it does to the
# bind-mounted dev container in infra/docker-compose.yml.
#
# ## Why the base image is still node:24-bookworm-slim and not oven/bun
#
# This image ships BOTH runtimes on purpose. `services/actors` is the riskiest
# process in the stack to move — 47 actor types, Scheduler-backed reminders, the
# outbox, and the only Postgres connection — and the thing that makes a bad
# outcome survivable is being able to roll back to Node **without building a
# different image**:
#
#     docker run … <same image> bun run start:node     # or: node src/index.ts
#
# An `oven/bun:1.4.2` runtime stage would make that a rebuild, and a rebuild is
# not a rollback. Three smaller reasons point the same way: the bun binary
# copied below is the same static binary that already runs `bun install` in the
# `deps` stage of this exact image, so Debian/glibc compatibility is measured
# rather than assumed; `USER node` (uid 1000, present in the node images and
# NOT in oven/bun, which ships a `bun` user) stays what it was; and every A/B
# soak in services/actors/scripts/soak/ can then be run inside the shipped
# artifact instead of against something adjacent to it.
#
# The cost is the bun binary in the runtime layer (~100 MB uncompressed, shared
# with nothing). That is the price of the rollback being a `CMD` override.

FROM node:24-bookworm-slim AS base
WORKDIR /workspace

# Bun is both the package manager and — since phase 5b — the runtime, so it is
# installed in `base` and both stages inherit it. Corepack cannot pin bun, so
# the version is pinned by copying the single static binary out of the official
# image; keep it equal to the root package.json's `packageManager`.
#
# This file is the reason that pin is load-bearing rather than tidy: it once
# lost its corepack pin, silently fetched a floating package manager, and could
# not build @dapr/dapr's transitive `protobufjs` or `esbuild`. Both are ruled on
# explicitly now, in the root package.json's `trustedDependencies` alongside
# @parcel/watcher and @swc/core. Bun will NOT fail the install the way pnpm did
# if that ruling goes missing — it skips the script in silence — which is what
# scripts/check-blocked-builds.mjs exists to catch in CI.
COPY --from=oven/bun:1.4.2 /usr/local/bin/bun /usr/local/bin/bun

# ---- deps: install with the workspace visible, production deps only -------
FROM base AS deps

# bunfig.toml carries the supply-chain settings; the root package.json carries
# the workspace globs, the catalog and `trustedDependencies` (bun reads the
# globs from there and nowhere else).
COPY package.json bun.lock bunfig.toml ./

# EVERY workspace member's manifest — see the same block in
# services/api/Dockerfile. One root lockfile means `--frozen-lockfile`
# validates against all members, so a missing package.json reads as drift.
COPY services/actors/package.json ./services/actors/
COPY services/api/package.json ./services/api/
COPY services/client/package.json ./services/client/
COPY packages/analysis/package.json ./packages/analysis/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/db/package.json ./packages/db/
COPY packages/policy/package.json ./packages/policy/
COPY packages/schema/package.json ./packages/schema/
COPY packages/e2e/package.json ./packages/e2e/

# `--production` is bun's spelling of pnpm's `--prod`; the `./path...` closure
# filter ports unchanged.
#
# `--omit=peer` keeps Next.js out of this image. better-auth@1.7.3 lists next,
# react, react-dom, vitest and drizzle-kit as OPTIONAL peers, and bun's isolated
# linker links an optional peer whenever the lockfile holds it — which it does,
# because services/client depends on next. Without the flag the runtime image
# carried next (202M), both @next/swc-linux builds (~170M), react, sharp,
# playwright, vitest, vite and drizzle-kit: 1.46 GB. With it: 612 MB, 96 fewer
# store entries. MEASURED SAFE on 2026-09-28, not assumed:
#   - every omitted package is one of those optional peers (or drizzle-orm's
#     optional @types/pg), or reachable only through one — no REQUIRED peer
#     edge of any installed package points at an omitted package;
#   - the only references to them left in the image are subpaths nothing here
#     imports (better-auth/{client/react,integrations/next-js,test-utils},
#     drizzle-orm/{expo-sqlite,op-sqlite});
#   - `bun build src/index.ts` bundles the identical 157 packages either way;
#   - booted under the prod overlay: healthcheck green, a PingActor turn through
#     actors-dapr, a better-auth email sign-in and a JWT mint, `db:migrate
#     --status` from packages/db, and `node src/index.ts` (the rollback) linking
#     every module before stopping at its production config check.
# If better-auth ever makes one of these a REQUIRED peer, the install still
# omits it — re-run those checks on a better-auth bump.
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production --omit=peer --filter "./services/actors..."

# ---- runtime ----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
# Every node_modules the install produced. services/actors/node_modules is a
# directory of symlinks pointing into the virtual store at
# /workspace/node_modules/.bun, which is where the real bytes are — bun defaults
# to its ISOLATED linker for a workspace, the same shape pnpm's store had, so
# copying only the app's own node_modules would copy several hundred dangling
# symlinks.
COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/services/actors/node_modules ./services/actors/node_modules

# `packages/db` is the only workspace package with real runtime dependencies of
# its own (drizzle-orm, pg — contracts and policy have none of their own, though
# policy does link contracts). Node's default ESM resolver follows
# `services/actors/node_modules/@cellar-assistant/db` to its REAL path
# (`/workspace/packages/db`, not the symlink's apparent location) before walking
# up for bare-specifier lookup, so `drizzle-orm` has to be resolvable from
# `/workspace/packages/db` itself.
#
# Under pnpm this needed a hand-built link, because a filtered install created
# no `packages/db/node_modules` at all and the root one held only the store.
# Bun's isolated linker creates it: MEASURED against this exact command
# (`bun install --frozen-lockfile --production --omit=peer --filter "./services/actors..."`),
# `packages/db/node_modules` comes out holding relative symlinks for drizzle-orm
# and pg, and `require.resolve("drizzle-orm")` from `packages/db/src` lands in
# the store. So these two lines replace the old `ln -s` outright — and they are
# copies of what the install decided, not a hand-maintained guess at it.
#
# Note this is NOT `--preserve-symlinks`, which was tried under pnpm and makes
# every workspace package's own source read as "under node_modules" to Node's
# type stripper (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING on
# @cellar-assistant/contracts' .ts source).
COPY --from=deps /workspace/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /workspace/packages/policy/node_modules ./packages/policy/node_modules

COPY packages/contracts ./packages/contracts
COPY packages/db ./packages/db
COPY packages/policy ./packages/policy
COPY services/actors ./services/actors

WORKDIR /workspace/services/actors
# services/actors/package.json's "start" script; no build output to point at.
# All other env (DATABASE_URL, AUTH_DATABASE_URL, MINIO_*, AI_*, OTEL_*,
# BETTER_AUTH_*, DAPR_HOST, DAPR_HTTP_PORT, ...) comes from
# infra/docker-compose.prod.yml (E3a) / infra/.env.prod — deliberately not
# baked into the image, same as the dev compose's environment block.
ENV APP_PORT=3002
ENV APP_HOST=0.0.0.0
EXPOSE 3002
USER node
# Bun writes its runtime transpiler cache under $TMPDIR and its install cache
# under $HOME/.bun; `USER node` owns neither /workspace nor a home in this
# image, and a cache it cannot write is a silent per-boot re-transpile rather
# than an error. Point it at /tmp, which is writable, and cap it so a long-lived
# container cannot grow one without bound.
ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=/tmp/bun-transpiler-cache
# The Node rollback, for reference — this is the ONLY line that changes:
#   CMD ["node", "src/index.ts"]
# or, without rebuilding: `docker run … <image> node src/index.ts`.
CMD ["bun", "src/index.ts"]
