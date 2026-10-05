# Toolchain traps — bun, Node, Turbo, and this workspace

**What this is.** Twenty-three measured ways this repo's toolchain does not behave the way it
looks like it behaves. Almost all of them fail *silently*: the wrong thing happens, nothing
errors, and a check goes green. They were found during the pnpm + Node → Bun move (phases 0–6,
complete; commits `3ba2a06c`, `50d763c3`, `9dbdb14f`, `5316d7b9`, `9fddb518`, `0826a8ca`,
`8601d1c1`, `c8ef930b`, `2bf85d6b`), but **only a handful are about that move.** The rest are
standing properties of bun 1.4.2, Turborepo and this workspace's layout, and they will still be
true long after nobody remembers there was a migration.

Renamed from `bun-migration.md` on 2026-09-19 for that reason, and trimmed of the phase-by-phase
progress record and its point-in-time test counts — both are in git history, and a count quoted
without the tree it was measured against is not evidence of anything. `AGENTS.md`'s "Bun, not
pnpm" section is the short version of #1–#7; this is the long version with the measurements
attached, and `AGENTS.md`'s "Three ways a suite result lies here" is the companion to
[the green-check section](#the-category-several-of-those-belong-to-a-green-check-that-is-not-evidence)
below.

**Node is still installed and still reachable everywhere on purpose** — see
[Rollback](#rollback), which is operational guidance rather than history.

---

## Two tests that exist only to catch a silent regression

`src/lib/runtime.test.ts` (actors) and `src/runtime.test.ts` (api) assert from
inside a worker that `process.versions.bun` is set. They exist because dropping
`--bun` from a test script is otherwise invisible: identical counts, just twice
as slow.

One environmental caveat, now with a reproducible instance on the development
machine these numbers come from: its non-interactive shells default to Node
**v20.18.1** while `.nvmrc` pins 24.14.0 — fnm's default alias, with
`--use-on-cd` not firing outside an interactive shell, and 24.14.0 *is*
installed. The `preinstall` guard caught it and refused the install, which is
the guard working; but it means AGENTS.md's note about a shell that already has
`node_modules` and just runs a suite on the wrong Node is no longer
hypothetical. **Check `node -v` before believing a red suite.**

---

## Twenty-three things that look like cleanups and are not

Each of these was measured. Most would fail silently — which is why they are
written down rather than left to be rediscovered.

### Installs

1. **`minimumReleaseAge` is in SECONDS.** pnpm's was minutes. The 24-hour
   supply-chain window is `86400`; writing `1440` buys 24 *minutes* and looks
   right.
2. **The exclude key is `minimumReleaseAgeExcludes`** — plural. pnpm's singular
   spelling is accepted and silently ignored.
3. **`--frozen-lockfile` does not re-check release age**, where pnpm did on every
   install. It is a resolution-time filter only. This is a genuine reduction in
   the guarantee.
4. **A blocked build script is invisible** under Bun's isolated linker — no
   warning, and `bun pm untrusted` reports "Found 0" while scripts are skipped.
   `scripts/check-blocked-builds.mjs` reads the installed tree directly and runs
   in both CI workflows. Do not trust `bun pm untrusted` in this repo.
5. **Bun defaults to the isolated linker** for workspaces, structurally like
   pnpm's store — which is why the move unmasked no phantom dependencies.
   `linker = "hoisted"` would change that.
6. **`bun install --filter` skips root lifecycle scripts — but only while the
   root is not one of the SELECTED workspaces.** Re-measured in phase 6:
   `--filter "@cellar-assistant/client..."` never mentions `preinstall`;
   adding `--filter cellar-assistant` (the root's own name) runs it again, and
   on the wrong Node it fails as `error: preinstall script from
   "cellar-assistant" exited with 1` inside install output. The Node-version
   guard is therefore still an explicit CI step: stack-ci's six legs do not
   select the root, and a named step beats that message either way. Read with
   #18, which found the same hole in a *package's* `pretest`: between them, no
   lifecycle hook of any kind is trustworthy under `--filter`.
7. **Homebrew's bun formula lags.** It sat at 1.4.0 while 1.4.2 was current.
   `bun upgrade` tracks real releases; `brew upgrade bun` does not.

### Runtime identity

8. **`process.versions.node` is synthetic under Bun** — it reports `26.3.0`,
   higher than any real release. Two version gates in this repo were keyed on it:
   one passed under Bun for a reason unrelated to Node existing, the other
   *failed* and advised `fnm use` to a Bun user. Both now check
   `process.versions.bun` first.
9. **In the `oven/bun` images, `node` is a symlink to bun.** `node -e` there
   prints `{"bun":"1.4.2","node":"26.3.0"}`. Every image here therefore keeps a
   `node:24-bookworm-slim` base and copies the bun binary in, so the Node
   fallback is genuine. Verified in the dev image: real Node v24.20.0 with a V8
   version alongside bun 1.4.2.
10. **Bun auto-loads `.env` from the process cwd**; Node does not. So
    `services/api/.env` is now live configuration. `.gitignore` was widened to
    cover every `.env` — before that, three service-level ones were committable.

### Tests

11. **`bun test` treats positionals as substring filters, not globs.** Carrying
    the old `node --test` argument list over searches 417 files and selects
    **zero**. It exits 1, so it fails loudly, but the failure reads as nonsense.
12. **`--isolate` is load-bearing.** Bare `bun test` shares one global across all
    files; `process.env`, a `globalThis` property and a monkeypatched
    `globalThis.fetch` were all measured leaking between them. Three client files
    do exactly that. `node --test` got this for free from one process per file.
13. **`--timeout=30000` is load-bearing.** Bun imposes a 5s per-test default that
    `node --test` does not, and it also governs `before()` hooks — where six
    client files sign in. A hook timeout surfaces as an unhelpful `(unnamed)`
    failure.
14. **`bun run <bin>` moves nothing when that bin carries a
    `#!/usr/bin/env node` shebang.** `bun run` honours the shebang and hands
    the whole tree back to Node — same wall-clock, no bun, and completely
    silent about it. The invocation that actually moves the runtime is
    `bun run --bun <bin>`. This is **general to every `.bin` entry with a node
    shebang**, not a quirk of one tool; both instances in this repo were
    measured from inside the runner process:

    ```
    bun run vitest run              no bun
    bun run --bun vitest run        bun
    bun run playwright test         {bun: null,    node: "20.18.1", isBun: false}
    bun run --bun playwright test   {bun: "1.4.2", node: "26.3.0",  isBun: true}
    ```

    Reports that "vitest cannot run on Bun" generally come from this. The
    `node: "26.3.0"` in the bun row is #8's synthetic value, not a real Node.
    Playwright is the one place the Node column is the *wanted* answer — see
    [Rollback](#rollback).

### Deployment

15. **Compose `command:` overrides the image `CMD`.** Both compose files pinned
    `["node", "src/index.ts"]`, so shipping bun images without editing them would
    have deployed a bun image running Node, with every gate green.

### CI

16. **A filtered install links NO root `node_modules/.bin`.** Which broke
    app-ci's unit tests without anyone seeing it: the client's
    `graphcache-schema-codegen.ts` spawns `<repo root>/node_modules/.bin/biome`
    by absolute path — deliberately, biome is a root devDependency because it
    lints every package — so on a cold, filtered checkout
    `graphcache-schema.test.ts` and `graphcache-keys.test.ts` die with ENOENT:
    **263 pass / 2 fail** against a baseline of 265 (which tree was not
    recorded). A developer never sees it, because a developer's tree always has
    the root install. The fix is to name
    the workspace root in the install filter (265 / 0 after, measured); the
    cost is the root's two devDependencies.
17. **With no `node` on PATH, bun silently substitutes ITSELF for one.** A
    package script that reads `node foo.ts`, run through `bun run`, does not
    fail when Node is absent — `process.versions.bun` is set and `execPath` is
    the bun binary. This is the other half of #14: `bun run` honours a
    `#!/usr/bin/env node` shebang *when a Node exists*, and quietly stands in
    for one when it does not. So deleting `actions/setup-node` from a workflow
    would not break a leg, it would move it to bun with every gate still
    green — including `packages/schema`'s test, which is
    `node scripts/check-generated.ts`, and `migrate:users` / `migrate:files` /
    `db:seed`, which stay on Node on purpose.
18. **A `pretest` hook does not short-circuit under `bun run --filter`.**
    Measured both ways: invoked in-package, a failing `pretest` correctly skips
    `test`. Invoked through `--filter` — which is what the root's `test:e2e`
    script does, and what CI does everywhere — bun prints `Exited with code 1`
    for the `pretest` and then **runs the main script anyway**. A guard written
    as a `pretest` hook is therefore silently non-load-bearing in exactly the
    invocations that matter. The working form is chaining it inside the script
    itself: `packages/e2e`'s `test` is now
    `node ../../scripts/check-node-version.mjs && playwright test`, verified to
    exit 1 with zero Playwright output on the wrong Node. Same family as #6 —
    together they mean **no lifecycle hook can be trusted under `--filter`**, so
    a guard belongs in the script body or in an explicit CI step.

### Local development

19. **A fresh Postgres here reports THREE tables, not zero.**
    `infra/postgres/init/01-extensions.sql` installs postgis, which brings
    `spatial_ref_sys` plus the `geometry_columns` / `geography_columns` **views**
    — and `information_schema.tables` counts views. So `select count(*) …
    where table_schema='public'` is 3 on a database that holds nothing of ours,
    and "table count > 0" is not "has a schema". That is not trivia: **the
    existing success assertion in `dev:db:clone` was written that way**, so a
    clone that transferred nothing at all would have passed it, and the first
    version of `dev:bootstrap` used the same test to decide an empty database
    "already has 3 tables — leaving it alone" and then failed four steps later
    with `relation "beer_style" does not exist`, which names one table and
    neither the clone nor the count. Both now count base tables (`relkind='r'`)
    with postgis's excluded, **and** check five sentinel tables
    (`beer_style country cellars user account`), because a clone that copied
    half the schema is worse than one that copied none.
20. **`find -newermt` reads a bare timestamp as LOCAL time; Docker reports
    UTC.** Comparing a container's `.State.StartedAt` against source mtimes is
    the only way to catch a process serving a stale bind mount — and passing
    that timestamp straight to `find -newermt` is an eight-hour error **in the
    direction that hides the problem**: everything modified in the last eight
    hours looks older than the container, so the check reports clean exactly
    when it matters most. `dev:doctor` writes the timestamp into a marker file's
    mtime (`fs.utimesSync`) and uses `find -newer` instead, which has no
    timezone at all.
21. **`bun run db:seed` in a worktree seeds the SHARED stack.** Its defaults are
    `postgres://…@localhost:5433/cellar` and `http://localhost:3002` — the
    all-compose lane's ports — so run bare in a per-worktree lane it writes to
    somebody else's database through somebody else's actor host, reports
    success, and leaves your stack empty. Three values have to agree, and the
    third is the one that bites: better-auth refuses a state-changing request
    whose `Origin` is not trusted, so the script's `AUTH_TRUSTED_ORIGIN` must be
    this stack's `http://localhost:<WEB_PORT>`, not the compose default of
    `:3000`. `bun run dev:seed` sets all three (and resolves a Node that can run
    a `.ts` file, which is #8's other half).
22. **Turbo caches `test`, and a suite's inputs are not only its files.** `bun
    run test` hashes files and replays a green when they have not changed —
    while the client's `src/lib` tests sign in against a **running stack** and
    enumerate cases from live introspection, which is not in the hash. Measured:
    11 of 12 tasks replayed from cache in one run, and the same source produced
    265 → 256 → 265 tests purely from stack load (which tree was not
    recorded). So a green could be a replay of a green that no longer holds.
    `@cellar-assistant/client#test` is now `cache: false` with its endpoint
    variables declared; every other suite is a function of its inputs and keeps
    caching.

23. **Bun hard-maps `*.localhost` to loopback and never reads `/etc/hosts`** —
    the same rule Chromium applies, and in a container it is fatal rather than
    convenient. Measured during E3 with one container and two identical
    `extra_hosts` entries pointing at the host gateway: `files.test` answered
    200, `files.localhost` was "Unable to connect". So the property that makes a
    `.localhost` name work in a browser is exactly the property that makes it
    unreachable from inside a container, and E3's premise — one authority
    signed once, reachable from a host browser and a compose network alike —
    has no solution on Docker Desktop for macOS. The stack signs two
    authorities in-process instead (`FILES_S3_*` browser-facing,
    `FILES_S3_INTERNAL_*` in-network) and the Dapr binding's own endpoint stays
    `minio:9000`, because every call the sidecar makes through it is
    server-side. Worth knowing beyond files: **any** attempt to give a container
    a `.localhost` hostname under Bun fails this way, and it fails at connect
    time with no hint that the name was rewritten.

### The category several of those belong to: a green check that is not evidence

This keeps happening, in unrelated layers, and it is worth being able to name on
sight. Two shapes, and the second is the one that survives longest.

**Shape one — the check reports success by not running.** The failure path and
the "nothing to do" path produce the same output, so the absence of work is
indistinguishable from the success of work:

- `bun pm untrusted` reports "Found 0" while the isolated linker skips the
  scripts (#4);
- `ACTORS_TEST_DB_OPTIONAL=1` once hid 589 of 824 actor tests behind a green
  suite (measured in `a2d8dcef`, which removed it);
- the client's D2 document tests **skip themselves** when the stack is down,
  which reads as `248 pass | 17 skip | 0 fail` (tree not recorded) — and they
  are the only check that catches an invalid GraphQL field, since `tsc` and
  gql.tada do not;
- a cached `test` task prints a pass for a run that did not happen (#22).

The fix is never to make the check louder when it fails — it already is — but to
make **not running a distinct, visible outcome**:
`scripts/check-blocked-builds.mjs` reads the installed tree instead of asking
bun; the `ACTORS_TEST_DB_OPTIONAL` escape hatch was deleted; `dev:doctor`
performs the sign-in it is predicting and says which way the document tests will
go; and the cached task is no longer cacheable.

**Shape two — the check runs, is truthful, and is still worthless, because its
input and its position are not the product's.** `a8-acceptance.sh upload` is the
measured instance. It PUT an ASCII body with `contentType: "text/plain"`, and
`FileActor.verify` — which since `7bdbc4da` reads sixteen bytes off the object
and refuses anything `detectImageMime` does not recognise, because every upload
this app accepts is an image — returned `INTERNAL`, killing the script at step 3
under `set -euo pipefail`. Steps 4-6 had not run in some time. Nothing was wrong
with `verify`: it **failed closed for exactly the right reason**, on input the
real path never sends. And its step 2 PUT ran from *inside the compose network*
(`dc exec -T actors node -e 'fetch(...)'`), the one position a browser is never
in, which is how it passed for months while browser uploads were completely
broken. Two stale premises, each hiding the other, and the fix for both was
three lines: send a real 1×1 PNG, and PUT it from the host.

The tell for shape two, and the reason it outlives shape one: **the check had
recorded its own disagreement with the product as expected behaviour.** The same
script's `endpoint` subcommand *asserted* that the signed host does not resolve
from the host machine — so the broken half was not missing from the evidence, it
was in the evidence, labelled correct. A check that documents why the product
cannot work, and passes, has stopped being a check. That subcommand now measures
all four candidate addresses from both positions and prints a table instead of
asserting a conclusion, which is the general repair: **make the check state what
it observed, not what it expected.**

Expect a sixth instance.

---

## Why the runtimes are what they are

Measured during the move; the reasons still bind:

- **Installs, every test suite and all three service runtimes are bun.** The actor host was the
  one with real risk, and the risk turned out not to reach us — see
  [`findings/bun-actor-host.md`](./findings/bun-actor-host.md). Short version: the `node:http2`
  retention bug needs gRPC over TLS, and this app talks plaintext HTTP/1.1 to a localhost
  sidecar. Established three ways, including an instrument that counted **0 http2 sessions and
  0 TLS sockets** across boot, acceptance and both soak windows.
- **Vercel stays on Node**, deliberately: its Bun runtime is Public Beta with an open exit-128
  bug. A live constraint on the client deploy, not a historical note.
- **`packages/e2e` stays on Node**, deliberately — Playwright spawns worker processes and a
  browser driver and is not a supported Bun target. See [Rollback](#rollback) and #14 for what
  `bun run playwright test` silently does instead.

## Rollback

Every image ships **both** interpreters, so reverting any one service is one word
and no rebuild:

- compose: `command: ["bun", …]` → `["node", …]` in
  `infra/docker-compose.yml` / `.prod.yml`
- scripts: `start:node`, `dev:node`, `build:node`, `start:node` are first-class
  and documented in each package
- host-run lane: `dapr.template.yaml`'s two `command:` entries
- soak A/B: `services/actors/scripts/soak/run-soak.sh node`

One thing here never moved and is not meant to: **`packages/e2e` stays on Node
deliberately.** Playwright spawns worker processes and a browser driver and is
not a supported Bun target, so its `test` script pins the interpreter outright
(`node ../../scripts/check-node-version.mjs && playwright test`, `ebea68c7`)
rather than taking whatever is on `PATH` — see #14 for what `bun run playwright
test` silently does instead. So the repo has an intentional Node consumer beyond
the one-shot scripts, and there is nothing to roll back for it.

---

## Outstanding

- **The CI workflows have never run on a GitHub runner.** They are written and lint clean
  (`actionlint` over all five), `oven-sh/setup-bun` is pinned and asserted against
  `packageManager`, and every changed shell step was executed against a clean `git archive`
  export of HEAD — installs, both guard scripts, typegen, six typechecks, five of six test legs
  at their baseline counts, both biome invocations, `docker compose config --quiet`, all exit 0.
  What is missing is an *execution*: the branch is unpushed. Nothing structural blocks one —
  every job is `ubuntu-latest` — **provided "one" means a push or a PR, never a merge.** Pushing
  this branch or opening a PR from it is inert outside CI; merging it to `main` is not. A merge
  to `main` redeploys **production Nhost** (its GitHub app deploys from `main`), and the
  release-please PR that merge opens would, once merged, fast-forward `production` and redeploy
  the **production Vercel frontend**. Both are gated in `e4-decisions.md` decision 15 and must be
  in place and confirmed before anything reaches `main` — so "get CI to run" is a push, and the
  merge is runbook step 0a, not a way to trigger the workflows.
- **The `services/actors` CI leg is the one step never executed locally.** Its
  three database steps — `docker compose up --wait postgres`,
  `packages/db/transform/test-db.sh --no-dump`, and the suite itself — all act
  on the `cellar-stack` compose project, which is the shared dev lane and was in
  use. Running them would have dropped another session's `cellar_test`, and
  `Stop Postgres`'s `down -v` would have taken the volumes with it. The steps
  are unchanged from before phase 6; only their surrounding comments moved.
- **`deploy-loki.yaml`'s `deploy` job has no runner** (`[self-hosted, loki]`; none registered).
  Its `build` job on `ubuntu-latest` is all that runs. Nothing in that workflow is Node- or
  pnpm-shaped, so the toolchain move left it alone; the consequences for the cutover are
  `e4-decisions.md` decisions 5 and 14, not this file's problem.
- **`release-please` needs no bun change, and that was measured rather than
  assumed.** `release-type: node` bumps the root package.json version on every
  release; `bun.lock`'s root workspace entry carries a `name` and no `version`,
  so a bump does not invalidate it — `bun install --frozen-lockfile` after
  editing `0.58.5` → `0.59.0` exits 0. Had it been recorded there, every
  post-release CI run would have failed on a frozen install.
- **The 24-hour soak.** Windows so far are 30 minutes each. They rule out
  anything at or above ~10 B/RPC and prove reminder liveness, but cannot see a
  slower leak, anything with a period longer than the window, behaviour across a
  leader change, or the **AI seams**, which hold whole images in memory and were
  never exercised. Harness is committed:
  `services/actors/scripts/soak/run-soak.sh bun --seconds 86400 --detach`.
- **`next dev` on the real client is untested.** The build is proven; the dev
  server is the user's to run, and `bun run dev:node` is the fallback.
- **Some things stay on Node deliberately**, and each pins its interpreter explicitly rather
  than inheriting `PATH` (for the reason in #17): `migrate:users`, `migrate:files` and `db:seed`
  were never measured on bun; `packages/schema`'s test is Node's own type stripping; and
  `packages/e2e` is a standing Node consumer because Playwright is not a supported Bun target.
