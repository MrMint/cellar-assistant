# Image for services/client — the Next.js frontend, built and served in a
# container so the whole app is runnable with **no host process at all**
# (`infra/docker-compose.yml`'s `client` service).
#
# Why this exists: `bun run test:e2e` drives a browser at the Next app, and
# until this file the only way to have one was `bun run dev` on the host — which
# AGENTS.md forbids agents from starting, because it fights the user's own dev
# server. The build happens *here*, inside `docker compose build`, so nothing on
# the host ever runs `next build` or `next dev`.
#
# BUILD CONTEXT MUST BE THE REPO ROOT, not services/client/:
#     docker build -f services/client/Dockerfile -t <tag> .
# Same reason as services/{api,actors}/Dockerfile: the `workspace:*` protocol
# needs the root package.json (where bun keeps the workspace globs and the
# catalog) and this app's workspace dependency closure
# (@cellar-assistant/schema, @cellar-assistant/contracts) present at install
# time.
#
# The root `.dockerignore` **excludes services/client** — deliberately, so the
# two backend images don't drag the largest dependency tree in the repo through
# their build context. A root-level exclusion cannot be undone from here, so
# this Dockerfile carries its own ignore file, `Dockerfile.dockerignore`, which
# BuildKit prefers over the root one for this Dockerfile only. It is the
# mirror image: client and schema in, api/actors/db/policy source out,
# contracts' src/ only (see the build stage), every manifest kept.
#
# ## Why the base image is still node:24-bookworm-slim
#
# The same measured reason as services/{api,actors}/Dockerfile, and it is not a
# style choice: **in the `oven/bun` images `node` is a symlink to bun**
# (`/usr/local/bun-node-fallback-bin/node -> /usr/local/bin/bun`;
# `node -e 'process.versions'` there reports `bun: 1.4.2` with a synthetic
# `node: 26.3.0`). Rebasing onto `oven/bun:1.4.2-slim` would make the Node
# fallback — `start:node` in services/client/package.json, and the `CMD`
# override at the bottom of this file — *look* like it worked while running bun
# twice. That is the exact silent revert the runtime guard tests exist to catch.
# So the OS and Node come from the Docker Official Image and only the bun
# binary is pinned, by copying the one static binary out of the official image.

FROM node:24-bookworm-slim AS base
WORKDIR /workspace
# Bun is both the package manager and the runtime here, so the binary lives in
# `base` and every later stage inherits it. Corepack cannot pin bun; keep this
# tag equal to the root package.json's `packageManager`.
COPY --from=oven/bun:1.4.2 /usr/local/bin/bun /usr/local/bin/bun

# ---- deps: install with the whole workspace visible -------------------------
FROM base AS deps

# bunfig.toml carries the supply-chain settings; the root package.json carries
# the workspace globs, the catalog and `trustedDependencies` (bun reads the
# globs from there and nowhere else).
COPY package.json bun.lock bunfig.toml ./

# EVERY workspace member's manifest, not just this app's closure — there is one
# lockfile at the root, so `--frozen-lockfile` compares it against every member
# it can see and a member whose package.json is absent reads as lockfile drift.
COPY services/client/package.json ./services/client/
COPY services/api/package.json ./services/api/
COPY services/actors/package.json ./services/actors/
COPY packages/analysis/package.json ./packages/analysis/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/db/package.json ./packages/db/
COPY packages/policy/package.json ./packages/policy/
COPY packages/schema/package.json ./packages/schema/
COPY packages/e2e/package.json ./packages/e2e/

# NOT `--production`, unlike the two backend images: `next build` needs the
# devDependencies (typescript, @types/*, @serwist/turbopack, esbuild). The
# `./path...` closure filter is bun's, same spelling pnpm used.
#
# The root's `preinstall` (scripts/check-node-version.mjs) does not run here:
# `bun install --filter` skips root lifecycle scripts entirely under bun 1.4.2
# (measured; see AGENTS.md § "Bun, not pnpm"), which is why `scripts/` can stay
# out of the build context.
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --filter "./services/client..."

# ---- build: `next build`, inside the image ----------------------------------
FROM deps AS build

# Source, on top of the node_modules the install just produced. Bun's ISOLATED
# linker (the workspace default) already created packages/schema/node_modules as
# a directory of relative symlinks into /workspace/node_modules/.bun, and these
# COPYs merge into those directories rather than replacing them — the ignore
# file keeps every node_modules out of the context, so nothing can clobber them.
COPY packages/schema ./packages/schema
# src/ only, not the package: the client imports one subpath of it
# (`@cellar-assistant/contracts/barcodes`, src/lib/items/barcode.ts), and
# `next build` type-checks that module's `import type` closure, which is the
# rest of src/. Its package.json is already here from the deps stage. Test
# files stay out (Dockerfile.dockerignore). src/lib/dev-checks/image-inputs.test.ts
# fails when client source reaches a workspace file this stage does not COPY.
COPY packages/contracts/src ./packages/contracts/src
COPY services/client ./services/client

WORKDIR /workspace/services/client

# `next.config.mjs`'s `headers()` and its `NEXT_PUBLIC_FILE_ORIGINS` are both
# evaluated at BUILD time, so the MinIO origin the browser is allowed to PUT to
# has to be known now, not at `docker run`. With `NODE_ENV=production` (which
# `next build` sets itself) that config reads `PUBLIC_FILES_HOST` or
# `FILES_S3_PUBLIC_URL` and emits nothing but a warning if neither is set — and
# a missing `connect-src` entry fails *asymmetrically*: images still render
# while every upload is blocked with no network request at all.
#
# The default is the host port `infra/docker-compose.yml` publishes MinIO on.
# `FILES_S3_PUBLIC_URL` rather than `PUBLIC_FILES_HOST` because the latter is a
# bare hostname that the config resolves as `https://`, and local MinIO is http.
ARG FILES_S3_PUBLIC_URL=http://localhost:9100
ENV FILES_S3_PUBLIC_URL=${FILES_S3_PUBLIC_URL}

# The bun path, matching services/client/package.json's `build` script
# (`bun run --bun next build`). `--bun` is the load-bearing word: without it bun
# would hand the `next` bin's shebang to node. The Node fallback is
# `build:node` (`next build`) and works in this image because `node` here is the
# real Node 24 — see the base-image note at the top.
RUN bun run --bun next build

# ---- runtime ----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
# Again, at runtime: `next start` re-evaluates next.config.mjs
# (`loadConfig(PHASE_PRODUCTION_SERVER)`), and `images.remotePatterns` /
# `dangerouslyAllowLocalIP` are read from THAT evaluation, not from the build's.
# Without this the optimizer refuses every presigned item photo with 400
# "url parameter is not allowed" even though the CSP baked at build allows the
# host. Same default and same compose build arg as the build stage.
ARG FILES_S3_PUBLIC_URL=http://localhost:9100
ENV FILES_S3_PUBLIC_URL=${FILES_S3_PUBLIC_URL}
WORKDIR /workspace

# The full install, devDependencies included, rather than a second
# `--production` pass. Two reasons: the only consumer of this image is the local
# `cellar-stack` lane and the Playwright suite (production serves this app from
# Vercel — docs/architecture/deploy-loki.md), and a second filtered install
# would double the image's build time to save layers nothing pulls over a
# network. If this image ever does ship, that is the line to revisit.
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/services/client/node_modules ./services/client/node_modules

# `@cellar-assistant/schema` resolves through a symlink to its REAL path, and
# Node/bun then walk up from *there* for bare specifiers — so gql.tada and
# graphql have to be resolvable from /workspace/packages/schema itself. The
# isolated linker created that node_modules; this copies what the install
# decided rather than guessing at it (same reasoning as packages/db in
# services/actors/Dockerfile).
COPY --from=build /workspace/packages/schema ./packages/schema

# `.next` included — it is the whole point of the build stage. `--chown` because
# `next start` writes into `.next/cache` (fetch cache, image optimizer) and
# `USER node` below owns nothing otherwise; a cache it cannot write is a silent
# per-request cost rather than an error.
COPY --from=build --chown=node:node /workspace/services/client ./services/client

WORKDIR /workspace/services/client
# Next reads PORT/HOSTNAME. 3000 is the *container's* port; the host port is
# infra/docker-compose.yml's `${CLIENT_PORT:-3003}` mapping, which stays off
# 3000 so the user's own `bun run dev` keeps it.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000
USER node
# Bun writes its runtime transpiler cache under $TMPDIR and its install cache
# under $HOME/.bun, and `USER node` owns neither /workspace nor a home here.
ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=/tmp/bun-transpiler-cache
# services/client/package.json's `start` script, spelled out. The Node rollback
# is one line and needs no rebuild:
#   docker compose run --rm client node node_modules/.bin/next start
# `process.versions.bun` is undefined on that path and defined on this one,
# which is how you check which interpreter you actually got instead of trusting
# the command line.
#
# NOTE: a compose `command:` would override this. The `client` service in
# infra/docker-compose.yml deliberately sets none — see the comment there.
CMD ["bun", "run", "--bun", "next", "start"]
