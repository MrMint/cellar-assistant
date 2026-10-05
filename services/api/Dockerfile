# Production image for services/api — graphql-yoga + Pothos. Holds no database
# credentials (services/api/src/config.ts asserts this on boot).
#
# BUILD CONTEXT MUST BE THE REPO ROOT, not services/api/:
#     docker build -f services/api/Dockerfile -t <tag> .
# The `workspace:*` protocol needs the root package.json — which is where the
# workspace globs live now that bun is the package manager — and the workspace
# member(s) services/api depends on (@cellar-assistant/contracts) present at
# install time, same as stack-ci.yaml's
# `bun install --frozen-lockfile --filter "./services/api..."` — which also
# runs from the repo root.
#
# Runtime is `bun src/index.ts` (see services/api/package.json's "start"
# script). There is deliberately no `tsc` / bundle stage: both runtimes execute
# the TypeScript source directly — Bun transpiles it, Node 24 type-strips it —
# and type *checking* is a CI concern (stack-ci.yaml), not a runtime one.
#
# ## Phase 5a: why the base image is still node:24-bookworm-slim
#
# The obvious move when a service starts running on Bun is to rebase onto
# `oven/bun:1.4.2-slim`, which is smaller (275MB vs 351MB + a 79MB bun binary
# ≈ 430MB here). It was rejected, for three reasons in order of weight:
#
#  1. **`node` in the oven/bun images is a symlink to bun.** Measured:
#     `/usr/local/bun-node-fallback-bin/node -> /usr/local/bin/bun`, and
#     `node -e 'process.versions'` inside it reports `bun: 1.4.2` with a
#     synthetic `node: 26.3.0`. So on that base the `start:node` escape hatch
#     below would *look* like it worked while running Bun — the same silent
#     revert `services/api/src/runtime.test.ts` exists to catch in the test
#     lane. An A/B you cannot trust is worse than no A/B.
#  2. **OS patches and the runtime version stay on separate axes.**
#     node:24-bookworm-slim is a Docker Official Image rebuilt on Debian
#     security updates independently of anything this repo pins; oven/bun is a
#     vendor image whose OS refresh rides bun's release cadence. Keeping the OS
#     on the DOI and pinning only the bun *binary* means a Debian CVE is fixed
#     by a base rebuild without touching the bun pin, and a bun CVE by bumping
#     one tag.
#  3. It would change the distro mid-migration: oven/bun:1.4.2-slim is Debian
#     13 (trixie), this is Debian 12 (bookworm). Not a variable worth moving in
#     the same commit as the runtime.
#
# The image needs nothing else — no compiler, no native rebuild step — so the
# ~79MB is the whole cost of keeping both runtimes present.

FROM node:24-bookworm-slim AS base
WORKDIR /workspace
# Bun is now the package manager AND the runtime, so the binary belongs in
# `base` — both the `deps` stage and the runtime stage inherit it. (It used to
# sit in `deps` alone, precisely so the runtime image had no bun in it.)
# Corepack cannot pin bun, so the version is pinned by copying the single
# static binary out of the official image; keep it equal to the root
# package.json's `packageManager`. That pin is not a reproducibility nit —
# services/actors' otherwise-identical stage once lost its corepack pin,
# silently fetched a floating package manager and could not build
# protobufjs/esbuild.
COPY --from=oven/bun:1.4.2 /usr/local/bin/bun /usr/local/bin/bun

# ---- deps: install with the workspace visible, production deps only -------
FROM base AS deps

# bunfig.toml carries the supply-chain settings; the root package.json carries
# the workspace globs, the catalog and `trustedDependencies` (bun reads the
# globs from there and nowhere else).
COPY package.json bun.lock bunfig.toml ./

# EVERY workspace member's manifest, not just this app's closure. There is one
# lockfile at the root — bun has no other shape — and `--frozen-lockfile`
# compares it against every member it can see; a member whose package.json is
# absent reads as lockfile drift and fails the install, even though nothing
# here depends on it.
# .dockerignore excludes services/client, packages/e2e and packages/analysis but
# re-includes their package.json with `!` for exactly this reason.
# services/api/src/dockerfile-workspaces.test.ts derives the list from the root
# `workspaces` globs and fails when a member is missing here.
COPY services/api/package.json ./services/api/
COPY services/actors/package.json ./services/actors/
COPY services/client/package.json ./services/client/
COPY packages/analysis/package.json ./packages/analysis/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/db/package.json ./packages/db/
COPY packages/policy/package.json ./packages/policy/
COPY packages/schema/package.json ./packages/schema/
COPY packages/e2e/package.json ./packages/e2e/

# `--filter "./services/api..."` installs only this app's own dependency
# closure plus its workspace-linked packages; bun supports the same `./path...`
# closure syntax pnpm did. The layout is also the same shape: bun defaults to
# its ISOLATED linker for a workspace, so services/api/node_modules is a
# directory of symlinks into the virtual store at /workspace/node_modules/.bun
# and both directories have to reach the runtime stage together.
#
# `--production` is bun's spelling of pnpm's `--prod`.
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production --filter "./services/api..."

# ---- runtime ----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/services/api/node_modules ./services/api/node_modules
COPY packages/contracts ./packages/contracts
COPY services/api ./services/api
# The release version. release-please bumps the ROOT manifest, not
# services/api's (which stays 0.0.0), and `api.boot` reads it from
# /workspace/package.json — `new URL("../../../package.json", …)` from
# services/api/src/events.ts. Without this line the image reported
# `api.version: unknown`. Nothing else reads it at runtime: bun resolves
# modules through the node_modules copied above, not the workspace globs.
COPY package.json ./package.json

WORKDIR /workspace/services/api
# services/api/package.json's "start" script; no build output to point at.
ENV APP_PORT=3001
ENV APP_HOST=0.0.0.0
EXPOSE 3001
USER node
# Phase 5a. The Node path is still in the image and still one line away:
#
#     docker run ... <image> node src/index.ts      # or: bun run start:node
#
# and in compose, `command: ["node", "src/index.ts"]`. That is the A/B lane —
# keep it working. Because `node` here is the real Node 24 (see the base-image
# note at the top of this file), `process.versions.bun` is `undefined` on that
# path and defined on this one, which is how you check which you got rather
# than trusting the command line.
CMD ["bun", "src/index.ts"]
