# E4 decisions

Everything E4 is waiting on, gathered from the workstreams that hit each one. Every claim carries a
file and line.

**One thing blocks the first step of E4, and it is not a decision: decision 15.** A merge to `main`
redeploys production Nhost Cloud — the rollback target — and the first release-PR merge after it
redeploys production Vercel. Two settings changes that only you can make (one in the Nhost
dashboard, one in this repository's rulesets) must be in place, and confirmed, before anything is
merged to `main`. Runbook step (0a) now says so and says how to confirm each.

Apart from that, **nothing in this document blocks E4.** It opened with five blocking decisions. As
of 2026-09-18 that is **zero**: decision 1 was closed in code on 2026-09-17, and decisions 2, 3, 4
and 5 were closed by measurement on 2026-09-18 — none of them turned out to need a judgement call.
Two freeze-time aborts found while measuring (13 and 14) are closed by runbook changes in the same
pass.

What is left for the user is decision 15's two settings changes, and in **Part 2** four product
judgements, none of which stops the flip.

The pattern that keeps working, and that every closure below follows: a question that looks like it
needs an answer usually dissolves once you make the system not care about the answer — or once you
measure the thing everyone assumed was unmeasurable. Four of the five "production facts local data
cannot answer" turned out to be answerable from the repository's own history.

Decision 12 is **answered** — the user settled the local/deployed model split on 2026-09-17. It is
recorded here rather than only in git log because it closes the open question in
`findings/vllm-provider.md` §9, which otherwise reads as still waiting on Loki's hardware.

---

# Part 1 — these used to block E4, and no longer do

## 1. Four indexes that may exist only locally — **RESOLVED 2026-09-17**

**Resolved at the root, not by patching the runbook.** The question below asked which of three
bad options to take. None of them: the transform now recreates **every** index the target schema
declares, so what production has or lacks stops being an input.

**Mechanism.** `packages/db/transform/17_target_indexes.sql` issues
`CREATE INDEX IF NOT EXISTS` for all **145** indexes `packages/db/src/schema/tables.ts` declares —
since grown by two (`13bcca04`), with a lane-created table's index left to its own migration
(`3b187a32`) — generated from the last 145 statements of the Drizzle baseline migration, so the
definitions are the same ones the `baseline` phase compares against rather than a retyped
paraphrase. It runs after `06` and `13` because it indexes tables they create (it ran last until
`18_teas_country_fk.sql`, `c53dde69`). Three further changes make it stick:

- `scripts/cutover/cutover.sh`'s `transform-c` range was `14`–`16`, so a file numbered `17` would
  have been applied by `run.sh` (which globs the directory) and **silently skipped by the
  cutover** — the same shape of bug in a new place. The three ranges are now `00`–`08`,
  `09`–`13`, `14`–`99`, which cover every two-digit prefix by construction.
- `packages/db/src/schema/target-indexes.test.ts` asserts the file's index names are exactly the
  set `tables.ts` declares, read through Drizzle's `getTableConfig` rather than by grepping.
  Removing one index from the file fails it (verified). That is what stops the gap reopening.
- `scripts/cutover/preflight.sql` §10 now prints present/MISSING for A1's five. It is
  **informational** — it no longer gates anything — but a missing index is a live slowness on
  Nhost for as long as Nhost keeps serving, and it tells the operator whether the freeze includes
  a real index build or 145 name checks.

**Measured, on a genuinely rebuilt database.** A copy of `nhost-schema.sql` with all 135 of its
target-index statements stripped out (simulating a production database that never had them)
transforms to a database whose `pg_indexes` output is **byte-identical** to one built from the
complete dump — 231 indexes each, `diff` exit 0. The full schema path
(`restore transform-a files transform-b users transform-c lane baseline`) exits 0 and `baseline`
reports `transformed database == Drizzle baseline`. With `17` moved out of the directory, the
identical run fails at `baseline` with `the transformed database does not match
packages/db/src/schema/tables.ts` — the freeze-stalling failure this decision described.

**Freeze cost.** Every index already present is a name check. Worst case — all 145 built from
nothing, on synthetic rows at a generous plausible scale (200k `cellar_items`, 100k `places`,
50k `friends`, 20k each `item_vectors`/`place_vectors` at halfvec(768)) — is **5.9 s**
single-threaded, of which the four HNSW builds are ~0.9 s each and A1's five are 0.075 s together.
`CONCURRENTLY` is deliberately not used: there are no writers during a freeze, it is slower, and a
failed concurrent build leaves an `INVALID` index that a later `CREATE INDEX IF NOT EXISTS` of the
same name will never repair. Full table in `packages/db/transform/README.md`.

**Operational note found while measuring:** the Postgres container's `/dev/shm` is 64 MB, and a
*parallel* index build of these fails outright with `could not resize shared memory segment`. The
step is plain `CREATE INDEX` and unaffected, but a `REINDEX` or a hand-run parallel build on a
similarly-configured production host will hit it.

<details>
<summary>The original finding, for the record</summary>

**Question.** Apply A1's five indexes to the Nhost production database before the final dump, add
them to the transform, or accept a failing baseline check mid-outage?

**Why.** A1 is recorded `done (local; prod apply is the user's)`
(`docs/architecture/migration-plan.md:551`, spec at `:635`). The cutover's baseline phase does
`drizzle-kit pull` against the transformed database and diffs it against `packages/db/src/schema/tables.ts`
through a sed that erases *exactly four documented hand-edits and nothing else*
(`scripts/cutover/cutover.sh:305-346`, `scripts/cutover/normalize-schema.sed`). The five indexes
are in the Drizzle baseline (`packages/db/migrations/20260910003220_opposite_havok/migration.sql:917-923`)
because they are in the local dump the baseline was taken from
(`packages/db/transform/nhost-schema.sql:5753,5791,5798`). Only one of the five,
`idx_cellars_privacy_public`, is recreated by the transform (`packages/db/transform/04_enum_split.sql:43,259`);
the other four are created by no transform step, and `scripts/cutover/preflight.sql` has no index
check at all (its sections run 0–9; none is indexes). So if production lacks them, the baseline
diff is non-empty and phase 5 of the runbook aborts with the site already frozen.

**Nhost.** Ran without four of these; they are worth up to 300× on the hottest queries
(`docs/architecture/target-stack.md:238-243`).

**Options.** (a) Apply the five to Nhost prod now as a normal migration — also a real speedup for
however long Nhost keeps serving. (b) Add a `17_a1_indexes.sql` transform step with
`CREATE INDEX IF NOT EXISTS`, putting four index builds on live data inside the freeze.
(c) Discover it during the cutover.

**Recommendation: (a), with (b) as a belt**, and add the four names to `preflight.sql` so the
answer is on paper days ahead.

**Blocks E4: yes**, if the assumption holds — I cannot reach production from here. One query
settles it: `SELECT indexname FROM pg_indexes WHERE indexname LIKE 'idx\_%';` against Nhost. It is
the first thing that fails, and it fails late.

</details>

**Blocks E4: no longer.** Option (a) — applying the five to Nhost prod as a normal migration — is
still worth doing for however long Nhost keeps serving, but it is now a performance task with no
deadline attached to it rather than a precondition for the freeze.

---

## 2. Users whose email is unverified — **RESOLVED 2026-09-18**

**The count does not matter, at any size, because the cutover cannot harm this population — it can
only help it.** The decision below assumed those users have access today that the cutover takes
away. They have the opposite: they cannot sign in at all today, and after the cutover they can.

**Measured, on both sides.**

- **Nhost refuses them entirely.** `nhost/nhost.toml`'s `[auth.method.emailPassword]` carries
  `emailVerificationRequired = true`, and has in **every one of the 34 commits that ever touched
  the file**, back to the first (`e7b82aa7`, 2023-10-10). Not just the checked-in intent — the
  rendered value, read out of the live rollback stack:

  ```console
  $ docker inspect epic-burnell-4b4be9-auth-1 --format '{{range .Config.Env}}{{println .}}{{end}}' \
      | grep -E 'VERIFIED|DISABLE_NEW_USERS'
  AUTH_DISABLE_NEW_USERS=false
  AUTH_EMAIL_SIGNIN_EMAIL_VERIFIED_REQUIRED=true
  ```

  hasura-auth rejects email/password sign-in for an unverified user. Whatever that count is, every
  row in it is an account that has been locked out since it was created.
- **better-auth lets them in.** `services/actors/src/auth/auth.ts:121-126` sets
  `emailAndPassword: { enabled: true, minPasswordLength: 9, password: … }` and **no
  `requireEmailVerification`**, so it takes better-auth's default of `false`. Only OAuth *linking*
  is gated, by `requireLocalEmailVerified` (`:148-158`) — which is the control A6 was right to
  keep and which this decision never disputed.
- **The flag survives the migration truthfully.** `services/actors/scripts/migrate-users.ts` reads
  `email_verified` (`:78`, `:101`) and writes it through, including on the conflict path
  (`:150`) — so nobody is silently promoted.

**So all three original options collapse.** (a) is not "acceptable if the count is small" — it is
the only one of the three that is not a regression, and it is that at any count. (b) "send a
verification mail before the freeze to shrink the population" buys nothing, because the population
is not losing anything. (c) was and remains the hijacking hole.

**The real finding is the other direction, and it was not recorded anywhere.** The cutover
**loosens** this control: an address Nhost refused to let in gets password sign-in on Monday. That
is a behaviour change, and the plan describes the opposite one. Two things follow:

- **Do not "fix" it by setting `requireEmailVerification: true`.** There is **no mail transport
  anywhere in the new stack** — no `nodemailer`/`resend`/`sendgrid`/`postmark`/`mailgun`/SMTP
  dependency and no `sendVerificationEmail` or `sendResetPassword` implementation in
  `services/actors` or `services/api` (grepped across both trees and all three `package.json`s;
  zero hits). Turning the flag on without one locks every unverified account out **permanently**,
  with no self-service path back. That would be strictly worse than either state.
- **These addresses can therefore never be verified post-cutover**, so they keep password sign-in
  and can never OAuth-link. That is a stable, harmless end state, but it is the end state — say so
  rather than implying they will "re-verify on their own".

**Still worth running `preflight.sql:33-45`** — E1's acceptance asks for the number
(`:2165-2168`) and it is free. It records a fact; it gates nothing.

**Blocks E4: no.**

---

## 3. OAuth providers better-auth does not ship — **RESOLVED 2026-09-18**

**There is no such provider, and there never could have been.** The decision existed because
"production may hold `windowslive` or `azuread`" was treated as unknowable from here. It is not
unknowable — it is in the repository's own history, and the answer is no.

**Measured.** A `user_providers` row can only exist for a provider that was *enabled in Nhost at
the time that user signed in*. Enumerating every revision of the config that decides that:

```console
$ for c in $(git log --format=%H -- nhost/nhost.toml); do
    git show $c:nhost/nhost.toml | awk '/\[auth.method.oauth\./{p=$0} /^enabled = true/{if(p!="")print p}'
  done | sort -u
[auth.method.oauth.discord]
[auth.method.oauth.facebook]
[auth.method.oauth.google]
```

**Exactly three, in all 34 revisions**, from `0f29d984` (2023-10-19, "feat: Adds Google, Discord
and Facebook sso") forward; the one revision before it enabled none. `azuread` and `windowslive`
— the two this decision names — are `enabled = false` in every version of the file that has ever
existed. Three independent confirmations of the same boundary:

- **better-auth ships exactly those three, under the same provider ids.**
  `services/actors/src/auth/auth.ts:79-83` builds `socialProviders` from
  `google` / `facebook` / `discord` and nothing else. Nhost's `provider_id` values are the same
  strings, so the migration is a name-for-name carry.
- **The old client only ever offered those three.**
  `82450ad1:src/components/auth/SignInClient.tsx` has three buttons and a
  `handleSignInSso(provider: "google" | "discord" | "facebook")` — a closed union. There was no UI
  affordance for a fourth.
- **The only checked-in per-project overlay disables all three.**
  `nhost/overlays/lfvdtrqkoeeyplsfllnh.json` `replace`s `enabled` with `false` for discord,
  facebook and google and `remove`s each `clientId`/`clientSecret`, unchanged since `bfeb4789`
  (2023-10-28). On that project `auth.user_providers` is necessarily empty. Treat this as
  corroboration rather than proof — the commit that added it is titled "Sets up preview
  environment", so the subdomain may be the preview project rather than production. **The argument
  above does not depend on it.**

**So the failure mode this decision exists to prevent cannot occur.** Every provider that could
appear in `auth.user_providers` is already configured in better-auth. There is nothing to
configure and nothing to weigh.

**What is left is not a decision.** The three OAuth apps' redirect URIs have to be re-registered
against the new auth origin — `<BETTER_AUTH_URL>/api/auth/callback/<id>`, listed in
`infra/.env.example` and already a numbered step at
`docs/architecture/deploy-loki.md §2.3 "OAuth — register three redirect URIs"`. Keep the pairing
the original recommendation called out: that triple —`BETTER_AUTH_URL` plus `services/api`'s
`AUTH_ISSUER`/`AUTH_AUDIENCE`, all still defaulting to `http://localhost:3002`
(`docs/architecture/migration-plan.md:1375-1384`) — must move together, and
`infra/docker-compose.prod.yml` now derives all three from one `PUBLIC_APP_ORIGIN` so they cannot
drift (`deploy-loki.md §3`).

**Correcting option (b) for the record.** "Let affected users go through password reset" was never
implementable: there is no mail transport in the new stack (see decision 2) and no
`/forgot-password` route under `services/client/src/app`. It is **not a regression** — the
pre-migration client had no such route either (`82450ad1:src/app` holds `sign-in`, `sign-up` and
nothing else auth-related), so hasura-auth's reset endpoint was never reachable from the product.
Nobody loses a recovery path they had. It does mean a user who forgets their password after
cutover has no self-service route, exactly as before.

**Still worth running `preflight.sql:69-107`** — it costs nothing and turns this argument into an
observation. `2b`'s duplicate `(provider_id, provider_user_id)` check earns its keep regardless:
that one is about a unique index silently swallowing a row, not about which providers exist.

**Blocks E4: no.**

---

## 4. `admin.credentials` — **RESOLVED 2026-09-18 against the rollback database; corrected 2026-09-28: production held a live key**

**Corrected 2026-09-28.** The finding below — "the table is empty" — held only for this worktree's
rollback database. A rehearsal against a real production backup (`scripts/cutover/README.md`)
found production's table is not empty: one row, `id = google_gcp_service_account`, a full GCP
service-account JSON with a live private key. Migration `20260928194604_drop_admin_credentials`
now drops the table (`IF EXISTS`) as part of the cutover's `migrate` phase, and
`scripts/cutover/smoke.sql` §12 fails if the table survives. **Dropping the row does not
invalidate the key — it must still be rotated in GCP by hand.** The key also survives in every
Nhost backup and in the cutover's own dump, so rotation is required regardless of when the `nhost/`
directory and `$WORK` are deleted (`migration-plan.md`'s cutover-window step and its `$WORK`
cleanup note).

**Consequences, revised.**

- **Option (a) turns out to have been the right instinct, just misapplied locally.** The query
  below returned zero against the only database this repo could reach at the time; it was never
  run against production before now. There is no JSON left to move to a password manager — the
  drop-and-rotate path supersedes extracting it — but the service account itself must be rotated,
  which the local-only "nothing to rescue" conclusion wrongly ruled unnecessary.
- **This is still the last content-related hold on the `nhost/` directory, but closed by the
  migration rather than by emptiness.** Decision 11 had two reasons to keep it: `admin.credentials`
  and the rollback path. The first is now handled — the table is dropped and the key rotation is a
  GCP-console action, not a reason to keep Nhost around. What remains is only the rollback path —
  see the correction recorded there, which is narrower than it looks.

The deployed AI path (decision 12) runs Vertex on GCP with its own service-account credential
(`deploy-loki.md §2.7`); the row this decision is about was a *fallback* used only when
`GOOGLE_APPLICATION_CREDENTIALS` was unset. Confirm whether it is the same service account before
assuming rotating one does not affect the other.

<details>
<summary>The original finding, for the record — measured against the rollback database only, not production</summary>

**There was nothing to rescue in the rollback database.** The decision turned on whether that row
might be the only copy of a GCP service-account private key. In this worktree's stack it was not a
copy of anything — there was no row.

```console
$ docker exec epic-burnell-4b4be9-postgres-1 psql -U postgres -d local -At \
    -c "select count(*) from admin.credentials"
0
```

Which matches what `preflight.sql:302-308` reported against this rollback stack, and what
`scripts/cutover/README.md` recorded for the columns (`id text`, `credentials jsonb`). Production's
count did not match — see the correction above.

**Question.** Extract the contents before Nhost is deleted, or let the table die with it?

**Why.** §3 and §9 both say "purpose unknown; confirm before dropping"
(`docs/architecture/migration-plan.md:468`, `:2386`), and the transform deliberately does not drop
it (`packages/db/transform/01_drop_hasura_artifacts.sql:41-43`). **It is knowable.** The table is
`(id text, credentials jsonb)` (`packages/db/transform/nhost-schema.sql:2807`) and it was the GCP
service-account fallback: `functions/_utils/gcp-credentials.ts` reads
`GOOGLE_APPLICATION_CREDENTIALS` first and falls back to `admin_credentials_by_pk(id:
$CREDENTIALS_GCP_ID)`, and `functions/_utils/ai-providers/factory.ts:160-197` does the same for
Vertex AI (both at commit `82450ad1`). X1 replaced this with environment credentials on purpose
(`docs/architecture/migration-plan.md:1718`).

If production ran with `CREDENTIALS_GCP_ID` set and no credentials file, that JSON blob is a live
service-account private key, and the row may be the only copy you have.

**Options.** (a) Run `preflight.sql:302-308`; if the row count is non-zero, dump the JSON to your
password manager before the 30-day window closes, then drop the table. (b) Drop it and rotate the
service account in GCP instead. (c) Carry the table across — no; nothing reads it and secrets
belong in the environment.

**Recommendation: (a), then drop.** It costs one query and removes a "we deleted Nhost and lost
the Vertex key" outcome. (b) is the fallback if the row turns out to be stale.

**Blocks E4: yes, weakly.** It blocks the *deletion* of Nhost at day 30, not the flip. But the
30-day clock starts at cutover and this is the moment it is on your mind.

</details>

**Blocks E4: no.**

---

## 5. Steps 4 and 7 of the runbook — **RESOLVED 2026-09-18: both have a mechanism**

**Both halves were understated as "no mechanism" when what they lack is *automation*.** The
manual path for each already exists, is documented, and is the path a *first* deploy has to take
regardless of whether a runner is ever registered.

### Step 4 — the deploy

`docs/architecture/deploy-loki.md §4 "First deploy"` is the mechanism, in full:

```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml \
  --env-file infra/.env.prod up -d
```

with §4's Let's-Encrypt-staging rehearsal ahead of it and §5's off-LAN verification behind it. The
GitHub Actions `deploy` job automates *subsequent merges*; it was never what the first deploy would
have used, because on cutover day there is nothing on Loki to redeploy over. So the runner is a
convenience whose absence costs one command, not a precondition. ~~Register it in the week after,
under whatever label.~~ **Updated 2026-10-05:** the repository is public, so a persistent
self-hosted runner on Loki would run code from any fork PR's own workflow files. Do not register
one. **Implemented the same day: the deploy is pull-based.** `deploy-loki.yaml`'s `deploy` job is
deleted; a timer on Loki runs `scripts/deploy/pull-deploy.sh` as the stack's own user, which deploys
the tracked branch's head once it is a fast-forward of what runs and every check-run on it is
green — building the images on Loki from the commit, not pulling them from GHCR, so nothing needs a
merge to `main` or a registry credential (`deploy-loki.md` §2.6 has the comparison, §4.1 the
sequence and rollback, `infra/loki/README.md` the how-to). The first deploy stays the by-hand path
above; installing the timer after it is `infra/loki/install-pull-deploy.sh`.

The "runner queues forever" fact is unchanged and still worth knowing — re-verified 2026-09-18:

```console
$ gh api repos/MrMint/cellar-assistant/actions/runners
{"total_count":0,"runners":[]}
```

**But measuring it turned up a real prerequisite nobody had written down — see decision 14.** The
`build` job that produces the images `up -d` pulls has never run, because the workflow is not on
the default branch yet.

### Step 7 — alert delivery

> **Superseded 2026-10-05: there is no external alert delivery.** The owner dropped the Discord
> alert webhook, and the release-announcement workflow that used the same secret with it. The
> rules still evaluate and fire, and are visible on Grafana's Alerting page on the LAN; the root
> policy now routes to the integration-less `empty` receiver
> (`infra/grafana/provisioning/alerting/contact-points-and-policies.yaml`), production needs no
> `DISCORD_WEBHOOK_URL`, and the GitHub repository secret of that name is no longer used by
> anything. What follows is the history of the delivering design. Adding a contact point later:
> `deploy-loki.md` §9.7. The cost is the one this section's original finding names: the
> `removeFriendOtherSide` privacy alert is, again, a dashboard someone has to look at.

The webhook already exists: `DISCORD_WEBHOOK_URL` is a repository secret today (confirmed with
`gh api repos/<owner>/<repo>/actions/secrets`; the listing is not reproduced here — this file is
public and a secret *inventory* is worth withholding even when the values are not in it),
and `infra/grafana/provisioning/alerting/outbox-and-actor-alerts.yaml:69-76` already names it as
the intended target in its own header. So "where do alerts go" is not a question anyone has to
answer — it is a contact point plus one variable in `infra/.env.prod`, pointed at a URL that is
already in hand. Until that lands, the same file records the fallback honestly: the three rules
**fire and are visible inside Grafana's own Alerting page**, silent to chat but not silent to an
operator who looks.

**The contact point has since landed (`ace0d2fd`).** `contact-points-and-policies.yaml` provisions
`discord-ops` and a root policy routing every rule to it, and a fourth rule was added for the
standing backlog. What is left is the value: `DISCORD_WEBHOOK_URL` in `infra/.env.prod`.
~~`infra/.env.prod.example` does not list it, and without it the base compose file's default,
`https://discord.invalid/alerts-not-configured`, makes every delivery fail.~~ **Updated
2026-09-28:** the example lists it, the production overlay requires it (`:?`), and the deploy
refuses the `discord.invalid` placeholder (`scripts/deploy/check-prod-config.mjs`), so a missing
webhook now stops the deploy rather than silently failing every delivery.

Two corrections to the framing while measuring this:

- **`deploy-loki.md §7.3` is stale.** It says the Grafana provisioning bind-mount shadows
  `otel-lgtm`'s own providers and "E3b owns filling it". It is filled:
  `infra/grafana/provisioning/datasources/grafana-datasources.yaml` carries all four originals
  (Prometheus, Tempo, Loki, Pyroscope) and `…/dashboards/grafana-dashboards.yaml` carries the
  three original dashboard providers plus the Cellar Assistant one. Grafana will come up with its
  data sources.
- **The nightly `pg_dump` and MinIO mirror are still documented-not-installed**
  (`docs/architecture/backup-restore.md`). That is a task for the same pass, and it is the one
  item here with a real deadline attached — the 30-day Nhost window is the only backup that exists
  until it lands.

### What is left

~~Two tasks, neither of which is a judgement call: **provision the Discord contact point** (URL in
hand) and **install the nightly backups**.~~ **Since 2026-10-05, one: install the nightly
backups.** The Discord contact point was removed (see the note at the top of this step). It is better done before the freeze and does not stop it.

**Blocks E4: no.**

<details>
<summary>The original finding, for the record</summary>

**Question.** Deploy by hand at cutover and register the runner later, or register it first? And
where do alerts go during the 24-hour watch?

**Why.** Two E3 findings. **There is no self-hosted runner for this repository** — none is
registered, so the deploy job queues forever (`docs/architecture/migration-plan.md:2199-2203`).
And **alert rules have no delivery channel**; the Discord webhook already used by
`release-discord.yaml` is the natural target, and the nightly backup schedule is documented but not
installed (`:2222-2224`). Runbook step 4 is "deploy `services/*`" and step 7 is "watch Grafana for
24h" (`:2256-2259`).

This matters more than plumbing usually does, because one specific alert is a privacy control: a
dead-lettered `removeFriendOtherSide` leaves the surviving `friends` row in place, so **an
unfriended person keeps FRIENDS-visible access**, and the plan says explicitly that this needs an
alert rather than a dashboard (`docs/architecture/target-stack.md:285-292`). The query is now
measured correct against live Loki (11 rows where the old form returned 0).

**Nhost.** Vercel and Nhost Cloud deployed themselves; there was no such alert and no such failure
mode, because friendship deletion was a trigger, not an outbox row.

**Options.** (a) Register a `loki`-labelled runner before the freeze, so step 4 is the mechanism
you will use forever. (b) `docker compose up -d` by hand and register the runner the week after.
(c) Cut over with no alert delivery and read Grafana by eye for 24h.

**Recommendation: (a) plus the Discord webhook, both before the freeze**, and install the nightly
`pg_dump` and MinIO mirror in the same pass. Cutover is the worst moment to exercise an untested
deploy path, and a 24-hour watch with no alert channel is a person refreshing a dashboard.

**Blocks E4: yes.** Steps 4 and 7 do not currently have a mechanism behind them.

</details>

---

## 13. Runbook step 5 would run the E2 suite against production — **FOUND AND CLOSED 2026-09-18**

**This is decision 1's shape in a new place: a step whose failure lands after the site is already
frozen.** Runbook step 5 reads "run E2 against Loki" (`docs/architecture/migration-plan.md:2352`).
At that point Loki is serving the transformed **production** database. `packages/e2e` cannot be
pointed at it:

- `packages/e2e/global-setup.ts` mints a session by `POST /api/auth/sign-in/email` for
  `test@test.com` and `test2@test.com`, password `123456789`
  (`packages/e2e/fixtures/accounts.ts:14-29`). Those accounts do not exist in production —
  `migrate-users.ts` migrates real users and `bun run db:seed` is the only thing that creates
  them, and the cutover deliberately never runs it.
- Making them exist means seeding production with a pair of accounts whose password is
  `123456789`. `scripts/cutover/README.md:48-53` already names this exact hazard: the seed
  collision "would not be benign against a production `test@test.com`".
- The suite is not read-only either. Its flows create cellars, items, check-ins, friend requests
  and tier lists — into production, during the freeze.

So step 5 as written has no safe execution. It would be discovered at the worst possible moment,
which is the whole reason this class of bug gets recorded here.

**Closed by narrowing the step rather than by making the suite production-safe** — the runbook now
says what actually verifies a freshly cut-over production database:

1. `scripts/cutover/cutover.sh smoke` — structural assertions against the transformed database,
   and **read-only** (0 `INSERT`/`UPDATE`/`DELETE`/`CREATE`/`DROP`/`ALTER` statements in
   `scripts/cutover/smoke.sql`; every check `RAISE`s instead).
2. `docs/architecture/deploy-loki.md §5` — the off-LAN verification block: real TLS, `/graphql`
   answering, JWKS EdDSA, Grafana unreachable from the WAN and reachable from the LAN, a presigned
   URL on the right authority.
3. One manual sign-in and one read, **as a real account** — the operator's own.

The full E2 suite keeps its job, on the database where it is meaningful: the **rehearsal**, before
the freeze. `E2E_BASE_URL` already exists (`packages/e2e/playwright.config.ts:84`), so aiming it
at a rehearsal stack is one variable, not new machinery.

**Blocks E4: no** — the runbook step is rewritten.

---

## 14. Step 4 has a prerequisite that is not in the runbook — **FOUND AND CLOSED 2026-09-18**

**The images step 4 deploys do not exist yet, and cannot until the branch is on `main`.**

```console
$ gh run list --workflow=deploy-loki.yaml
HTTP 404: workflow deploy-loki.yaml not found on the default branch
$ git log origin/main -1 --format='%h %ad %s' --date=short
82450ad1 2026-07-16 Merge pull request #625 …
$ git rev-list --count origin/main..HEAD
85
```

`origin/main` is still the **pre-migration** commit. The whole migration — 85 commits, including
`.github/workflows/deploy-loki.yaml` itself — is unpushed. That workflow's `build` job triggers
only on `push: branches: [main]`, so it has never run and nothing has been published to GHCR.
`infra/.env.prod`'s `API_IMAGE`/`ACTORS_IMAGE` are GHCR tags
(`ghcr.io/mrmint/cellar-api:sha-…`), so `deploy-loki.md §4`'s `up -d` fails on the pull.

~~This is not a decision and it has no downside~~ **— wrong, and dangerously so: see decision 15.**
The ordering constraint is real, of the same family as `migrate-files.ts` having to run between
`08` and `09`. But `main` is not only this workflow's trigger: it is also the branch Nhost Cloud
deploys **production** from, and the branch release-please fast-forwards `production` from. This
decision measured the one consumer of `main` that lives in the repository and missed the two that
live in dashboards. The runbook's merge step is now gated (decision 15). Building on Loki instead
remains the fallback and a poor one: `target-stack.md` describes it as resource-constrained and
already carrying other long-running workloads, which is why `deploy-loki.yaml` builds on a
GitHub-hosted runner in the first place.

Note this is independent of decision 5's missing *deploy* runner: the `build` job runs on
`ubuntu-latest` and needs no self-hosted runner at all.

**Superseded 2026-10-05: Loki builds its own images, and GHCR is no longer in the deploy path.**
The pull-based deployer (decision 5; `deploy-loki.md` §2.6) builds from the commit on Loki, which
is what the first deploy was already doing — no GHCR packages exist, and none could until a merge
to `main`. The objection above still stands as a cost, and is answered rather than ignored: builds
run niced, one image at a time, on the host's layer cache, and only when a new commit has passed
CI. `deploy-loki.yaml` now builds and smoke-tests on `main` and publishes nothing; this
prerequisite — "the images do not exist until `main`" — no longer applies to the deploy.

**Blocks E4: no** — the runbook step is added, behind decision 15's gates.

---

## 15. A merge to `main` redeploys production Nhost, and the next release merge redeploys production Vercel — **CLOSED 2026-10-05: Nhost disconnected; release merges are the frontend deploy path**

**Resolution, 2026-10-05.** The cutover happened first, so the two gates below closed differently than
planned. Gate 1: the owner **disconnected the repository from the Nhost project** (not a branch
repoint), before this branch was merged; the project stays up, frozen at `82450ad1`, as the rollback
target until it is deleted. Confirm on the merge commit: no `nhost` check-run. Gate 2 is moot:
Vercel Production already serves the new frontend against Loki (deployed by CLI at cutover), so the
release app keeps its `production` bypass and merging a release-please PR is the normal production
deploy from here on. The rest of this section is the record of how the risk was found.

**Runbook step (0a) said "merge this branch to `main`", on no deadline, and the rollback paragraph
said "production Nhost is unaffected by anything in this repository". Both were false.** Nhost
Cloud's GitHub integration deploys production from `main`: migrations, metadata and `functions/`.
Merging this branch would ship all three to the rollback target — before the freeze, while it is
still the live backend.

### The evidence

The `nhost` GitHub App posts a check-run on every commit it deploys. It has one on each of the last
three commits to `main`, and none on branch or PR heads:

```console
$ for c in 82450ad1 368aac99 734df18a 62eeaf94 f01a2b9e; do
>   gh api "repos/MrMint/cellar-assistant/commits/$c/check-runs" \
>     --jq '[.check_runs[] | select(.app.slug=="nhost")][0] | "\(.started_at) \(.conclusion) \(.output.title)"'
> done
2026-07-17T02:32:25Z success Nhost has deployed your app       # 82450ad1, main (merged 02:31:45Z)
2026-07-17T00:51:35Z success Nhost has deployed your app       # 368aac99, main (merged 00:51:00Z)
2026-07-17T00:33:55Z failure Nhost failed to deploy your app   # 734df18a, main (merged 00:33:28Z)
null null null                                                 # 62eeaf94, the release PR's head
null null null                                                 # f01a2b9e, a Renovate branch head
```

So: **pushing this branch, or opening a PR from it, is inert for Nhost; merging it is not**, and the
deploy starts within 27–40 seconds of the merge. Nothing in the repository *configures* the integration (it is set in
the Nhost dashboard), so no grep finds it. That is decision 5's runner again: infrastructure that
acts on this repository without being in it.

**What the merge would ship to production Nhost** (`git diff --name-status 82450ad1 HEAD -- nhost
functions`):

- **No pending Hasura changes.** `nhost/` on this branch is exactly what `82450ad1` deployed.
  Undeployed legacy fixes (production indexes, a place-search visibility fix and a recipe-photo
  authorization fix) were dropped from the published tree on 2026-10-05: Nhost is retired at E4
  rather than patched, and their details are withheld until it is.
- **No `functions/` at all.** 150 tracked files at `82450ad1`, none at `HEAD`. Whether Nhost reads
  a missing directory as "delete every function" or fails the deploy is **unknown**, and neither
  is safe: the first takes down every function production calls; the second is `734df18a`'s
  outcome, and nothing here records which steps a failed deploy had already applied.

The first two are security fixes production should get — but by the route the patch header
describes, together with their `functions/` half, not bundled with the deletion of `functions/`.

**The second trigger is release-please.** `.github/workflows/release-please.yaml:30-38`: when a
release PR is merged, "Deploy Prod" fast-forwards `production` to the merge and pushes it, and
Vercel builds `production` as Production. The `production` ruleset restricts updates but lists the
workflow's GitHub App as a bypass actor (integration `866421`, which is `vars.CELLAR_ASSISTANT_APP_ID`).
Measured:

```console
$ gh api 'repos/MrMint/cellar-assistant/deployments?environment=Production&per_page=3' \
    --jq '.[] | "\(.sha[0:8]) \(.created_at) \(.creator.login)"'
82450ad1 2026-07-17T02:42:00Z vercel[bot]
368aac99 2026-07-17T00:58:02Z vercel[bot]
734df18a 2026-07-17T00:40:28Z vercel[bot]
$ gh api repos/MrMint/cellar-assistant/actions/jobs/87790757613 \
    --jq '.steps[] | select(.name=="Deploy Prod") | .conclusion'     # release-please on 82450ad1
success
```

Every Production deployment is a release merge. Merging this branch is not itself a release, but it
carries `feat:` commits, so release-please will immediately open a release PR — and merging that is
the routine click every release so far has been. It would perform runbook step 6's frontend flip
**early and without step 6's env change**: either the Production build fails (no Next app at the
repository root any more, if Vercel's Root Directory is still the root) or it succeeds and serves a
frontend that expects better-auth and `services/api`. (Which of the two is not measured; neither
is a state production should be in before step 6.) Note the interaction with plan §8.1: the
`main` ruleset requires a successful Vercel Preview on the merging PR, which needs Root Directory
set to `services/client` — and once it is set, the *next Production build* builds the new frontend.

### The gates (runbook step 0a)

Both are settings, not code, and both have a confirmation that does not depend on trusting the
dashboard:

1. **Nhost: stop deploying from `main`.** In the Nhost dashboard's Git settings for the project,
   either change the **deployment branch** or disconnect the repository. Prefer the branch: create
   `nhost-legacy` at the deployed commit first (`git push origin 82450ad1:refs/heads/nhost-legacy`),
   then point the deployment branch at it. Repointing at the commit already deployed is a no-op even if Nhost redeploys on the change.
   **Confirm with a canary before the real merge:** land one `chore:` commit on `main` that
   touches nothing under `nhost/` or `functions/`, wait three minutes, then
   ```console
   $ gh api repos/MrMint/cellar-assistant/commits/<canary-sha>/check-runs \
       --jq '[.check_runs[] | select(.app.slug=="nhost")] | length'
   0
   ```
   The canary is built on `82450ad1`, not on this branch, so if the gate did *not* hold, the deploy
   it triggers ships exactly what production already runs. (release-please does not open a release
   PR for `chore:`; check that none appeared.)
2. **Vercel/release-please: no Production deploy until step 6.** Remove the GitHub App from the
   `production` ruleset's bypass list (Settings → Rules → Rulesets → `production`; keep the admin
   role). Deploy Prod's push is then rejected and the workflow goes red instead of flipping
   production. Confirm with
   ```console
   $ gh api repos/MrMint/cellar-assistant/rulesets \
       --jq '.[] | select(.name=="production") | .id' \
     | xargs -I{} gh api repos/MrMint/cellar-assistant/rulesets/{} --jq '[.bypass_actors[].actor_type]'
   ["RepositoryRole"]
   ```
   and still do not merge release PRs until step 6 — a red Deploy Prod is the backstop, not the
   plan. At step 6, restore the bypass (or fast-forward `production` by hand) as part of the flip.

After the real merge, re-check both: the merge commit has no `nhost` check-run, and
`gh api repos/MrMint/cellar-assistant/branches/production --jq .commit.sha[0:8]` is still `82450ad1`.

**Gate 1 stays in place until Nhost is deleted**, not until the cutover: for 30 days production Nhost
*is* the rollback, and every later merge to `main` would otherwise redeploy it from a tree that no
longer describes it.

### Why no code change closes this

There is nothing in the repository to gate for Nhost — the integration is a GitHub App reacting to
pushes, with no workflow file. For release-please there are real options, all of them behaviour
changes this document does not make:

- **Gate "Deploy Prod" on a repository variable** (`… && vars.PRODUCTION_DEPLOY_ENABLED == 'true'`).
  Fail-closed while unset, one `gh variable set` at step 6. But a skipped step is a green run, so
  it needs an `else` step that writes a warning, and forgetting the variable after cutover means
  frontend releases silently stop deploying.
- **Move "Deploy Prod" into its own job behind a GitHub Environment with a required reviewer.**
  Fail-closed and audited, one click per release; needs the job split, and must not reuse the name
  `Production`, which Vercel already uses for its GitHub Deployments.
- **Build images without merging** — add a second branch to `deploy-loki.yaml`'s `push` trigger
  (`workflow_dispatch` cannot help: GitHub dispatches only workflows present on the default
  branch). It defers the merge until Nhost is deleted, but every later merge is still dangerous
  and `main` goes stale meanwhile; gate 1 is still needed the day `main` moves.

The ruleset change in gate 2 is the settings-level version of the first two, reversible in one
click, and is what the runbook uses.

**The method, stated so the next one is found by measurement:** what a merge to `main` triggers is
the union of the check-runs, statuses and deployments on the last commit that landed there —
`gh api repos/<o>/<r>/commits/<main-sha>/check-runs --jq '[.check_runs[].app.slug] | unique'`,
`…/statuses`, and `…/deployments`. For `82450ad1` that is `github-actions`, `nhost` and `vercel`
(twice — a Preview for `main`, a Production for `production`).

**Blocks E4: yes, until both gates are in place and confirmed.** Neither is a judgement call; both
are actions only you can take (two dashboards).

## 16. How a schema change reaches a database — **CLOSED 2026-09-27: one path, with a ledger**

**What was wrong.** A migration reached a database one of two ways. A migration carrying the
"Hand-written SQL lane" marker was re-applied by `run.sh` and `cutover.sh` on every build; every
other one reached a *fresh* build only because a numbered transform file mirrored it by hand, and
a *long-lived* database (`cellar-stack`, worktree clones of it) only if someone applied it by hand.
Nothing recorded what any database held — which is how one database lacked
`teas_country_country_value_fkey`. After E4 it would have been worse: production would have had no
mechanism for a schema change at all.

**Mechanism.** `cellar_meta.schema_migrations` and `bun run db:migrate` (`packages/db/src/migrate/`),
the single apply path for `run.sh`, `test-db.sh`, `cutover.sh` (the `migrate` phase, formerly
`lane`) and `dev:bootstrap`. Design, refusals and adoption rules: migration plan §8.6.

**How E4 seeds it.** Runbook step (3)'s `migrate` phase, on the freshly transformed production
database: adoption records the baseline, re-applies the five idempotent migrations, probes the five
the transform produces, and then applies every migration after the horizon, in one run, before
`baseline` checks the result against `tables.ts`. `smoke` fails unless `db:migrate --status` is
clean. Nothing is seeded by hand; a re-run from `restore` re-seeds it, since `restore` drops
`cellar_meta`. Measured on a scratch target from the checked-in dump — `restore transform-a files
transform-b users transform-c migrate baseline smoke` (`SKIP_FILES=1` — kept here as the exact
invocation measured; that flag is now refused, replaced by `FILES_MODE=rows-only`, since it could
not survive contact with production's real file rows (decision 4's addendum and
`migration-plan.md`'s "Files: two modes" section, commit `7525322e`)): exit 0, 5 applied / 6
adopted, `baseline`'s pull diff empty, no generate drift, `smoke`'s ledger check up to date.

**When the transform froze.** At `06171a44`, with the horizon at
`20260927215215_budget_attribution_and_reservation_index` — the newest migration then, so no
migration has ever been both mirrored and ledger-applied. From here a schema change is only a
migration; `transform-freeze.test.ts` fails on any transform edit (a data-only fix is allowed with
a re-pinned checksum and a passing `baseline`).

**Already adopted:** `cellar-stack`'s `cellar` (2026-09-27, 23:25 UTC — the exact SQL is the
ledger DDL plus the five idempotent files; every function definition's md5 was unchanged by the
re-apply), and every `cellar_test_template` built since `06171a44`. Other worktree databases adopt
on their next `dev:bootstrap` / `dev:migrate`, and `dev:doctor` flags them until they do.

**Closed 2026-09-28: the deploy migrates.** `deploy-loki.yaml` now runs `db:migrate` against
production before the new images start — from a one-shot container of the new actors image, which
carries `packages/db`, so the migrations applied are the ones that image was built with — and a
failed or refused migration stops the deploy with the previous images still running
(`deploy-loki.md` §4.1, which also gives the manual form). Until then the deploy ran no migration
and a merge that added one would have started the new actor host against the old schema; the
"manual `db:migrate` before `up -d`" this paragraph used to prescribe could not be followed,
because the deploy fires on the same push to `main` that creates the release commit. Migrations
run while the previous actor host is still serving, so they must be ones it tolerates (add, then
use, then drop in a later release).

---

# Part 2 — what actually needs you

**First, an action rather than a judgement, and the only item here that blocks anything:**
decision 15's two settings changes — repoint (or disconnect) Nhost's deployment branch, and remove
the release app from the `production` ruleset's bypass list — each confirmed as decision 15
describes, before anything is merged to `main`.

Everything above is settled, measured, or a task with a known answer. **These four are product
judgements and nothing else can decide them.** None of them stops the flip; all four describe the
app as it will ship on Monday.

| # | The call | Recommendation |
|---|---|---|
| 6b | `/search` lost the discovery feed — "what you and your friends recently drank". The new home page greets you and shows two numbers. Restoring it is a new collection actor plus a root field plus a UI. | **Decide whether you want the product, not the feature.** If the app is a social one, this is the page that makes it social and it should be the first thing after cutover. If it is a personal cellar tool, delete the idea and stop carrying it. |
| 6d | Cellar filtering is gone: the text box is now a *semantic reorder*, so someone with 200 bottles who types "smoky" gets their whole cellar shuffled rather than filtered. Cost is one argument on `Cellar.items` plus the actor's where clause. | **Do it first, right after cutover.** It is the cheapest of the five losses and the most-used control on the page; it is only unshipped because a D workstream may not add schema arguments. |
| 7 | Should the catalog — items, brands, recipes — be readable logged out? Nhost refused anonymous reads of every content table, so ratifying changes nothing. | **Ratify: keep it behind sign-in.** Opening it means anonymous rate limiting, a viewer-less read path and the SEO work that is the only reason to want it — a growth project, not a flag. |
| 10 | `/cellars` shows strangers' PUBLIC cellars, which is a superset of what §2.2 scoped. Nhost showed them too. | **Keep the superset.** It matches today and it is shipped; "browse public cellars" is plausibly a feature. Revisit only if the list gets noisy. |

Everything else that once looked like your call is answered in Part 1 with the measurement that
answered it. Decisions 8 and 9 stay in Part 3 as engineering calls with recommendations already
recorded; neither needs you before the freeze.

---

# Part 3 — these never blocked E4

## 6. Five feature losses. Two were chosen; three happened.

The plan records three (`docs/architecture/migration-plan.md:1771-1789`). There are five. Naming
them by whether anybody decided:

### 6a. Image search — **chosen**, and the plan overstates the cost
A user could point their camera at a bottle on `/search` and get ranked matches; the onboarding
wizard used the same path. Gone. Wiring at `82450ad1`:
`src/app/(authenticated)/search/actions.ts:193-246` (`searchByImage` → `create_search_vector(image:)`
→ `image_search`), `src/components/common/OnboardingWizard/actors/searchByImage.ts`. Old
`?image_results=` links still land and explain themselves
(`services/client/src/app/(authenticated)/search/page.tsx:26-31`).

**Where I disagree with the plan.** It calls the fix "a real piece of work, not a wiring gap".
The old path already embedded server-side, in a server action, so this is not new architecture: it
is one resolver plus `EmbeddingActor.embedImage`, on an edge four search actors already use
(`services/actors/src/lib/embeddings.ts`). No public embed endpoint is needed and §7's
`create_search_vector` hole stays closed. The real cost is one layer down: **every provider
rejects image embeddings today** — four of them, counting `openai-compatible` —
`services/actors/src/lib/ai/vertex-ai.ts:216`, `google-ai.ts:87`, `ollama.ts:158`,
`openai-compatible.ts:293`, and `types.ts:106` says so in a comment. Adding Vertex
`multimodalembedding`, one actor method, one resolver, one UI control: one to two sessions, not a
research project.

### 6b. The `/search` discovery feed — **chosen**
"Recent reviews and tier-list entries by you and your friends", plus a nearby-places strip. Gone.
There is no cross-user activity root field in the schema and building one needs a collection actor
§2.2 never specified; D4 dropped it rather than invent the aggregate, which was the right call for
a D workstream (`services/client/src/app/(authenticated)/search/page.tsx:33-42`). Restoring it is a
new collection actor plus a root field plus a UI: a small feature, not a repair. **This is the one
to ask yourself about honestly** — a home page that greets you and shows two numbers is a different
product from one that shows what your friends drank.

### 6c. Brand reverse edges — **a gap, half-open** (A7g)
The Hasura `/brands/[id]` rendered the brand's items across all six types, its places, its parent
and its children (`82450ad1:src/components/shared/fragments/recipe-fragments.ts:194-250`). `Brand`
in the new SDL is eight scalar fields with no edges at all
(`packages/schema/schema.graphql:175-184`). The page resolves the parent with a second `brand(id:)`
read and links out to search for the rest; **children are unreachable** — it needs
`brands(parentBrandId:)`, which does not exist
(`services/client/src/components/brand-api/BrandDetailView.tsx:22-38`). A7g is the open workstream
(`docs/architecture/migration-plan.md:1785-1789`). Cost: small, one B3/A7 pass. It was never
decided — it fell out of A7 writing the API skeleton before B3 existed.

### 6d. Cellar filtering — **nobody chose this**
The Hasura cellar-items page had a text filter and item-type checkboxes, both URL state via `nuqs`
(`82450ad1:src/app/(authenticated)/cellars/[cellarId]/items/searchParams.ts`). Neither survives:
`Cellar.items` takes only `sort` and `semanticQuery` (`packages/schema/schema.graphql`, `type Cellar`),
and a D workstream may not add schema arguments. The text box is now a *semantic ordering*, not a
filter — a viewer who types "smoky" sees their whole cellar reordered, which the component doc is
honest about (`services/client/src/components/cellar-api/CellarItemsPanel.tsx:49-61`,
`services/client/src/app/(authenticated)/cellars/[cellarId]/items/page.tsx:16-25`). Recorded as an
API gap "for whoever owns them" (`docs/architecture/migration-plan.md:1439`) and never picked up.
For anyone with a 200-bottle cellar this is the most-used control on the page. Cost: one argument
on `Cellar.items` plus the actor's where clause. Small.

### 6e. "Which tier lists rank this?" — **nobody chose this, and nobody recorded it**
The Hasura item detail pages (all six types) and `/places/[id]` showed the tier lists an item or
place appears in, with its band
(`82450ad1:src/components/item/ItemTierLists.tsx`, used at `src/app/(authenticated)/places/[placeId]/page.tsx:88`,
`src/components/beer/BeerDetails.tsx:102`, and the four siblings). There is no such component under
`services/client/src/components/item-api/` and no `tierLists` field anywhere in
`packages/schema/schema.graphql`. The place page's doc comment notices half of it — "this page
shows no tier lists until someone builds the `services/api` equivalent"
(`services/client/src/app/(authenticated)/places/[placeId]/page.tsx:16-19`) — and the item half is
recorded nowhere at all. **This loss is not in the plan.**

Restoring it is *not* a straight port: the old query had a visibility defect that is still live
in the legacy stack (details withheld until it is retired). A new `Item.tierLists` /
`Place.tierLists` must reduce through `canSeeTierList`. Cost: small, but it is new code, not revived code.

**Recommendation.** Ship the cutover with all five missing. Then, in order: 6d (most-used,
cheapest), 6c (A7g exists), 6e (it was silent, which is the reason to fix it), 6a (bounded, and the
provider work is reusable), 6b (decide whether you want the product, not the feature).

**Blocks E4: no.** All five are already the state of `main`; cutting over changes nothing about
them.

---

## 7. Is the catalog readable logged out?

**Question.** Should items, brands and recipes be readable without signing in?

**Why.** `ItemActor`, `BrandActor`, `RecipeActor` and `RecipeGroupActor` have no `Visibility:` line
in §2.1. B3 read the absence of an owner column as "any signed-in viewer; anonymous refused", B2
and B6 copied it, and all three flagged it **Ratify or overrule**
(`docs/architecture/migration-plan.md:898-899`, `:921-923`, `:1039-1041`). Proved live: anonymous
gets `ForbiddenError: sign in to read this list` (`:1767-1769`).

**What Nhost did — and this corrects the framing.** *Nothing changed.* Nhost's unauthenticated role
is `public`, and across `nhost/metadata/databases/default/tables/`, exactly one table grants
`role: public` — `storage_files.yaml:67`. `public_wines`, `public_brands`, `public_recipes`,
`public_places` and `public_item_reviews` all grant `role: user` only. Every content route was
under `(authenticated)` then and is now; the only routes outside it are `/`, `/sign-in`, `/sign-up`
and `/~offline`. So this is **not a silent behaviour change** — it is a new product question that
the migration merely made visible by asking it out loud.

**Options.** (a) Ratify: catalog stays behind sign-in. (b) Open items and brands to anonymous
reads — one line per actor, but it also means anonymous rate limiting, a public read path through
`services/api` with no viewer, and the SEO/`sitemap.xml` work that is the only reason to want it.

**Recommendation: (a), ratify.** Nothing in the app currently benefits from (b), and (b) is a
growth project with a security surface, not a config flag. If you ever want public brand or item
pages for search traffic, that is its own workstream with its own caching story.

**Blocks E4: no.** It has been the behaviour since B3 and matches Nhost exactly.

---

## 8. One global actor idle timeout — and the cache regression underneath it

**Question.** Accept a single 10-minute idle window for every actor, or build a per-type mechanism?

**Why.** §8.5 asks for 10m on entity actors, 5m on search, 24h on `GeocodeActor`
(`docs/architecture/migration-plan.md:2366-2368`). C1 found `@dapr/dapr` exposes `actorIdleTimeout`
as **one global** and left it at 10m, saying "this needs a plan decision" (`:1166-1169`). Confirmed
in code: `services/actors/src/config.ts:11-16` is a single `ACTOR_IDLE_TIMEOUT` env var, applied
once at `services/actors/src/index.ts:99`.

**What Nhost did — this is the part the plan does not say.** These activations replaced real
caches, not nothing. `getCachedGeocode` was `unstable_cache`d for **7 days**, and
`getCachedSearchVector` for **24 hours**, both shared across all users and all serverless instances
(`82450ad1:src/lib/cache/index.ts:26-47` and the Photon block below it). Today both are a
10-minute in-process activation on one host. `geocode-actor.ts:6-14` still documents a 24-hour
window it does not get. So: **address geocoding against komoot's public Photon instance goes from
~1 request per address per week to ~1 per address per 10 minutes**, and every repeated search
phrase is re-embedded — a paid call on Vertex — after 10 minutes instead of 24 hours.

**Options.** (a) Accept 10m everywhere; watch Photon 429s and embedding spend in Grafana.
(b) Raise the global to ~1h — helps geocode and embedding, costs memory on entity actors that cache
nothing anyway. (c) Give `GeocodeActor` and `EmbeddingActor` a real cache instead of an activation:
a small table, or a Dapr state store with `ttlInSeconds` (A4's test forbids actor state —
`services/actors/src/lib/no-actor-state.test.ts` — so that route needs its own decision). (d) A
second Dapr app with its own runtime config: the only true per-type mechanism, and far too much
machinery.

**Recommendation: (a) at cutover, then (c) for `GeocodeActor` if Photon complains.** komoot's
instance is "a courtesy, not a contract" in the actor's own words, and a persistent geocode table
is a dozen lines. Not (d).

**Blocks E4: no.** It is an environment variable and a cost curve, not a correctness problem.

---

## 9. §8.5's synchronous edge set — and the fact that it is not closed

**Question.** Ratify `RecipeActor → ItemActor.createGeneric`, and decide what the rule actually is?

**Why.** B6 added the edge deliberately: one `INSERT ... ON CONFLICT DO NOTHING`, no external call,
and routing it through the outbox would stop an ingredient row committing in the same transaction as
its FK target's existence. Pinned by a test asserting `RecipeActor`'s sidecar targets are exactly
`{ItemActor, EmbeddingActor}` (`docs/architecture/migration-plan.md:1033-1038`;
`services/actors/src/actors/recipe-actor.test.ts:986-1004`). Flagged **Ratify or overrule**.

**Where I disagree with the plan.** §8.5 says "A test asserts the static import graph of
`services/actors` matches this" (`:2357-2362`). It does not. The enforcement is
`services/actors/src/lib/no-external-calls.test.ts`, whose `GUARDED` list holds **three files** —
`item-actor.ts`, `lib/file-verification.ts`, `user-actor.ts` — out of 47 actor modules, plus
bespoke per-actor pins in four test files. And the set is already wider than §8.5 documents:

- **search → `EmbeddingActor`**, via `services/actors/src/lib/embeddings.ts`, from
  `item-search-actor.ts`, `cellar-item-search-actor.ts`, `place-search-actor.ts`,
  `recipe-search-actor.ts`. C1 asked for it to be documented and it never was (`:1170-1172`).
- **search → `BudgetActor`**, `google-places-actor.ts` calling `reserveForSearch` (`:1160-1164`).
- **`lib/ai/images.ts` → `FileActor`**.

So the honest position is not "five edges plus a proposed sixth"; it is "an undocumented set of
about nine, three of them pinned by tests".

**Options.** (a) Ratify the `RecipeActor` edge and rewrite §8.5's bullet to list every edge that
actually exists, then extend `GUARDED` to cover every module that calls `invokeActorMethod`.
(b) Ratify and leave the documentation as is. (c) Overrule — route `createGeneric` through the
outbox, which breaks recipe-ingredient creation as described.

**Recommendation: (a).** The edge itself is clearly right; the argument for it is concrete and the
alternative is broken. But the value of a "closed set" is entirely in the enforcement, and the
enforcement covers 3 of 47 files. Widening `GUARDED` is a mechanical afternoon and is the only
thing standing between you and a tenth edge nobody notices.

**Blocks E4: no.** The code ships either way.

---

## 10. `/cellars` shows strangers' PUBLIC cellars

**Question.** Keep it, or narrow to yours plus co-owned plus friends'?

**Why.** §2.2 scoped the collection to "mine, co-owned, friends' visible", which omits a stranger's
PUBLIC cellar. C3 implemented the full `canSeeCellar` superset instead, because that is what
`public_cellars.yaml` grants and what `/cellars` renders today, and called narrowing "a **D2 product
call**, not a security one" (`docs/architecture/migration-plan.md:1252-1254`). D2 kept the superset
and split the page into "Your cellars" and "Shared with you", noting that narrowing is not
implementable from the frontend — `myCellars` takes only pagination arguments, so client-side
filtering would short-page the connection and make "Load more" lie (`:1433-1437`).

**Nhost.** Showed them. This is behaviour-preserving as it stands.

**Options.** (a) Keep the superset. (b) Add a `scope:` argument to `myCellars` in C3, defaulting
to the narrower set.

**Recommendation: (a).** It matches today, it is shipped, and "browse public cellars" is plausibly
a feature rather than a leak. Revisit only if the list gets noisy with strangers.

**Blocks E4: no.**

---

## 11. The 30-day post-cutover deletion set

**Question.** What actually gets deleted at day 30, and who checks?

**Why.** Several things are parked on the same clock and nothing gathers them. §9's rows: delete
the eight uncalled functions' ported logic after checking Grafana for zero invocations; confirm
`admin.credentials` (see decision 4); item-table consolidation; Dapr Workflows; rewriting the two
search SQL functions; `friends` as one row per pair (`docs/architecture/migration-plan.md:2377-2388`).
Plus, from elsewhere: `nhost/` stays until after E4 **and** until X4 lands a checked-in `$DUMP`
baseline, together with `biome.json`'s `!nhost`, `.vercelignore`'s `/nhost`, `.claude/launch.json`'s
Nhost entry and the `nhost-hasura-admin` agent (`:2066-2072`); `ProbeJobActor` is now deletable and
should be deleted rather than left reachable on the unauthenticated actor host
(`:1682-1683`, `:2168-2170`);
`PlaceRefreshJobActor` is "correct only for now" — admin-only and started by nothing, wanting an
operator console (`:1681-1682`). Two §9 rows are already settled and should come off the table:
`RecipeSearch`/`RecipeDashboard` were deleted by D9 (neither path exists), and E1 decided
`friend_request_status.ACCEPTED` survives, `item_reviews.text` stays `json` and
`item_onboardings.status` stays unconstrained (`:1968-1980`).

**Recommendation.** Put the day-30 list in the runbook's step 7 as a dated checklist. Nothing here
is hard; the failure mode is Nhost being deleted on a Tuesday with `admin.credentials` unread and
`nhost/` still load-bearing for every dev database.

**`nhost/` is no longer load-bearing for dev/test databases** (measured 2026-09-17). X4's
checked-in `packages/db/transform/nhost-schema.sql` is a sufficient source for both build paths:
`test-db.sh --rebuild --no-dump` and `cutover.sh restore transform-a files transform-b users
transform-c lane baseline` both exit 0 against it, with no live Nhost container read. The
`test-db.sh` fingerprint used to hash `nhost/migrations` and not the dump — so editing the dump
left a stale template calling itself current; it now hashes both, and tolerates the directory's
absence, so deleting `nhost/` changes the fingerprint exactly once. What still needs the live
stack is only `cutover.sh preflight` and `cutover.sh dump` — the two phases whose entire job is to
read production, which a schema-only dump cannot and should not stand in for — plus the `files`
phase's object copy when there are `storage.files` rows, whose source is the legacy **MinIO**, not
`nhost/`. Nothing in `nhost/` itself is read by either script any more. `admin.credentials`
(decision 4) is now closed too. **So exactly one reason to keep the directory survives, and it was
not written down anywhere.**

### The actual argument for holding `nhost/`, and why it is weaker than it looks

**`nhost up` reads `nhost/nhost.toml`, `nhost/migrations` and `nhost/metadata`.** Delete the
directory and the rollback stack can never be *restarted* — only kept alive. The ten
`epic-burnell-4b4be9-*` containers are up now (37 hours at time of writing), and E4's rollback
plan depends on Nhost still answering. Nothing in the doc said this, which made "`nhost/` is no
longer load-bearing for dev/test databases" read as "`nhost/` can go".

**But the local rollback stack is already broken, which is the more useful fact.** D9 deleted
`functions/` (`51881a0c`), and the Nhost functions container bind-mounts the worktree root at
`/opt/project` and expects sources there. It has been crash-looping ever since:

```console
$ docker inspect epic-burnell-4b4be9-functions-1 \
    --format '{{.State.Status}} restarts={{.RestartCount}}'
restarting restarts=404
$ docker logs --tail 1 epic-burnell-4b4be9-functions-1
No lock file found. Please commit your lock file for npm, yarn, or pnpm
```

Nine of ten containers are healthy; the tenth never comes up. Three consequences:

- **Keeping `nhost/` restores nine containers, not ten.** A full-fidelity local Nhost stack now
  needs a checkout of `origin/main` (`82450ad1`), which still carries `functions/`
  (`git ls-tree origin/main -- functions/` lists it; `git ls-tree HEAD -- functions/` is empty).
  That checkout is the real rollback artifact — `nhost/` on this branch is a partial one.
- **The production rollback E4 describes is unaffected by the local breakage.** It is "redeploy
  the pre-cutover frontend commit against Nhost", and production's functions run in Nhost Cloud.
  ~~not from this directory~~ **Corrected 2026-09-27:** Nhost Cloud deploys them *from
  `functions/` on `main`* — which is why merging this branch, which has no `functions/`, would
  break the production rollback too (decision 15). What the local breakage costs is only the
  ability to *rehearse* that rollback.
- **"The containers are running now" is not a durable state**, and this is the evidence. One of
  them already stopped being true without anyone noticing for 404 restarts.

**Recommendation.** Hold `nhost/` until X4 and the 24-hour watch both pass, for the restart path —
but record that the rollback of record is the `82450ad1` checkout, not this directory, and stop
treating the running containers as a guarantee.

**Update, 2026-10-05: the restart path is gone, so that reason no longer holds.** Every local Nhost
container and volume (all ten `epic-burnell-4b4be9-*`), the `nhost` CLI and its state, and the
`mcp-nhost` server were removed from the dev machine. A restart of the rollback stack now means
a `82450ad1` checkout and a fresh `nhost up` from there, which reads *that* checkout's `nhost/`,
not this branch's. `run.sh` and `test-db.sh` restore the checked-in baseline by default and the
fingerprint no longer hashes `nhost/migrations`, so nothing executable on this branch reads the
directory. Deleting it is now a housekeeping decision rather than a rollback one.

**Blocks E4: no**, but it starts at E4.

---

## 12. Which model serves, locally and deployed — **settled by the user, 2026-09-17; local server revised 2026-09-17**

**Decision, as the user stated it.** A local model for dev on the Mac; **deployed runs the Gemini
models on Vertex AI (GCP)**. That intent is settled and is not in question below. It closes what
`findings/vllm-provider.md` §9 left open ("what hardware is Loki?") by routing around it: no model
is served on Loki at all, so Loki's hardware stops mattering for AI.

**Which local server, revised.** The decision originally named **vLLM**. Implementing it produced
the measurement below, and on that evidence the preference moved:

> **Preferred local servers: `llama-server` (llama.cpp) or LM Studio — both Metal-accelerated.**
> **vLLM is supported and works, but is CPU-only on Apple silicon and is not recommended here.**

Nothing about the deployed half changes, and **no code changes** with it — that is the whole point
of the next paragraph. `AI_PROVIDER=openai-compatible` reaches all three; picking a different one
is a base URL and a model name.

**Why the revision is cheap.** The provider is deliberately named for the wire format, not the
product. vLLM, `llama-server`, LM Studio, an MLX-backed shim, Ollama's own `/v1` route and
api.openai.com all serve `POST /v1/chat/completions` and `POST /v1/embeddings`, so all of them are
the same provider. Had it been called `vllm` and written against vLLM, this revision would have
been a rewrite instead of a config edit.

**What was built for it** (X1c): a fourth provider, `openai-compatible`
(`services/actors/src/lib/ai/openai-compatible.ts`), selected by
`AI_PROVIDER=openai-compatible`. `vertex-ai` already existed and is unchanged — the deployed half
of this decision needed no code.

**It is deliberately not called `vllm`.** vLLM serves an OpenAI-compatible HTTP API, so the
provider is written against `POST /v1/chat/completions` and `POST /v1/embeddings` rather than
against vLLM. `llama-server`, LM Studio, an MLX-backed shim, Ollama's own `/v1` route and
api.openai.com are then the same provider with a different base URL and model name — **no code
change.** That naming is load-bearing rather than fastidious, because of the caveat below.

### The caveat that caused the revision: vLLM has no Metal backend

`findings/vllm-provider.md` §6 measured this on this machine (M4 Pro, 48 GB). **The asymmetry is
the point** — vLLM is not uniformly slow here, it is slow on exactly the half that matters most:

| | vLLM (CPU, macOS) | MPS reference | ratio |
|---|---|---|---|
| **one image embed** | **52.4 s** | **1.16 s** | **~45× slower** |
| one short text embed | 95 ms | 226 ms | 2.4× *faster* |

Read that twice. On **text**, vLLM CPU genuinely beats MPS, because it batches and schedules well
and these prompts are short — so a vLLM-backed semantic search is fine. On **images** it loses
catastrophically, because image embedding is compute-bound on a long sequence and there is no GPU
to put it on. During the image run `VLLM::EngineCore` sat at 890% CPU (≈9 cores) on the machine
that is also meant to be running the app.

**And images are most of the AI surface here.** Four of the seven seams are vision seams —
item-onboarding label defaults, menu extraction, recipe-photo vision and place review. Only
semantic search and tier-list insights are text-only. So the seam that vLLM serves well is the
minority of what a developer actually exercises.

For the avoidance of doubt: vLLM *does* install and run here — `uv pip install vllm` yields a
working 0.11.0 wheel, contrary to its own docs — it is simply **CPU-only**, with no
quantized-kernel support. And a container makes it worse rather than better: Docker on macOS
reaches no Metal device either, which is why the model server runs on the host, exactly as ollama
always has here.

Two further vLLM-specific traps, both already paid for once, and the first is worse than the
speed:

- **`--no-enable-prefix-caching` is MANDATORY if you run vLLM for embeddings.** Not a performance
  tweak — a correctness requirement. Prefix caching is **on by default** and logged benignly at
  startup as `(Enabling) prefix caching by default`. With it on, six embeddings sharing a long
  common prefix — which every prompt here has, via the instruction preamble — degraded
  *progressively*: the first three exact against the reference at cosine 0.9998, then
  `spirit` 0.7486, `sake` 0.6975, and `tea` at **-0.0016**, i.e. pure noise. With it off, all six
  were 0.9998 (§6.6).

  What makes this the worst finding in the document: **the corrupted vectors are unit-norm,
  contain no NaN and no inf, and arrive with no error.** A 768-slice of one inserts into
  `halfvec(768)` happily and sits in an HNSW index being silently wrong. It is not a dtype problem
  (fp32 reproduces it identically) and not a prompt-format problem (both renderings are
  byte-identical) — it is the shared prefix. `scripts/ai/local-model.sh up` passes the flag, and
  `verify` carries a component-outlier guard, because the corrupted `tea` vector was still
  unit-norm but had a 4× component outlier. **Pin the vLLM version too**: this was observed on
  0.11.0/CPU/macOS and may not reproduce elsewhere, which makes it worse, not better.
- **`transformers` 5.x breaks vLLM 0.11.0** at engine startup, in a way that reads as "vLLM is
  broken on macOS" when it is not. Pin `transformers==4.57.1` (§6.2).

### The escape hatch, stated so nobody re-derives it

**None of the provider code changes** for any of these. In preference order:

1. **`llama-server` (llama.cpp) or LM Studio** via `AI_PROVIDER=openai-compatible` — **the
   recommended local setup.** Both are Metal-accelerated, both serve the same two routes, and
   both need only `OPENAI_COMPAT_ENDPOINT` and a model name. `llama-server` wants a GGUF
   conversion; LM Studio is the least work of anything here. Note `findings/vllm-provider.md` §7:
   llama.cpp reaches multimodal *embeddings* on a non-OpenAI route, so if image **embedding**
   (not image chat) is the goal, check that specific endpoint before committing.
2. **`AI_PROVIDER=ollama`** — zero setup, no credentials, Metal-accelerated, and what
   `infra/.env.example`, `scripts/stack/stack.sh` and `runtime-acceptance.sh` all use. This is why
   ollama was not removed, and it remains the default for a fresh worktree.
3. **vLLM**, if you want it: fine for text, poor for vision, and see the mandatory flag above.
4. A remote vLLM on a CUDA box, or api.openai.com. Same two variables.

The default was therefore **left at ollama**, which the revision reinforces rather than changes: a
fresh worktree should not assume a server nobody has started. `AI_PROVIDER` unset remains the
honest state for a checkout with no model, and is unaffected.

### Measured, on both paths

- **Embedding width.** Every `halfvec` column in this database is **768** — four of them
  (`category_vectors`, `item_vectors`, `place_vectors`, `recipe_vectors`,
  `packages/db/src/schema/tables.ts`), across seven HNSW indexes. Deployed, Vertex's
  `gemini-embedding-2` (since 2026-09-28; was `text-embedding-005`) is asked for 768 via
  `outputDimensionality` and re-normalises the shortened vector itself. Locally,
  `Qwen3-VL-Embedding-2B` emits **2048** and must be cut to 768 — server-side via
  `--override-pooler-config '{"dimensions": 768}'`, or by the provider's explicit Matryoshka
  opt-in (`OPENAI_COMPAT_EMBEDDING_TRUNCATE=true`), which truncates **and renormalises**. A
  wrong width is refused with the model, the server and both fixes named, because a silently
  truncated non-Matryoshka vector is unit-norm, inserts fine and means nothing.
- **Structured output is the sharp edge, and it survives.** Gemini takes `responseSchema`; an
  OpenAI-compatible server takes `response_format: {type: "json_schema"}`. Both compile the
  schema's `required` array into the sampler's grammar, so `required` is a **compulsion, not a
  request** — `prompts.ts` measured adding the attribute bag to `required` turning an empty answer
  into `{"vintage":"2005","style":"SPARKLING"}` for a wine that does not exist. The new provider
  therefore pins `strict: false`, because OpenAI's `strict: true` *requires* that `required` list
  every property, and a server reconciling that either rejects the schema or widens `required` to
  every key. Verified end to end against a live OpenAI-compatible server: `PLACE_REVIEW_SCHEMA`
  has six properties and requires one, and three keys came back — had the grammar promoted, all
  six would have.
- **Instructions stop being a no-op.** `EmbeddingTaskType` is Google's vocabulary and ollama
  ignores it. `Qwen3-VL-Embedding-2B` wraps inputs in an instruction, so `RETRIEVAL_QUERY` and
  `RETRIEVAL_DOCUMENT` now produce *different* vectors (measured cosine 0.9281 for the same
  phrase). **Query and document sides must use the same scheme or retrieval degrades with no
  error**, which puts the instruction strings into the stored vectors' identity alongside the
  model name.

**A stored vector's identity is the model AND the task instruction — so switching local server is
not free.** Two models are two spaces, and the 768-wide columns cannot tell them apart. Less
obviously, neither can they tell apart two *instruction schemes*: `EmbeddingTaskType` is a
documented **no-op on ollama** and **not** a no-op on an instruction-wrapping model, so moving
between `ollama` and `openai-compatible` **in either direction** invalidates every stored vector
just as a model change does. The full list of what forces a re-embed is kept next to the dimension
constraint in `services/actors/src/lib/embeddings.ts`, deliberately, because that is where someone
looks when a width check fails. **Mixing is worse than switching**: documents embedded under one
scheme with queries under another degrades retrieval with no error anywhere. `findings/vllm-provider.md` §11.4
argues that belongs inside E4 rather than after it; this decision does not change that, and does
not by itself commit to Qwen for the *deployed* vectors — Vertex is what deploys.

**Blocks E4: no.** The deployed path is `vertex-ai`, which already existed and is unchanged. This
said E4 still needed decision 4's `admin.credentials` dump, in case that row held the only copy of
the Vertex service-account key. Decision 4 has since closed that: the table is empty in the
rollback database, production's count is one `preflight.sql:302-308` query away, and the deployed
key comes from a GCP service account either way (`deploy-loki.md` §2.7).

---

# Already settled — do not re-open

| Item | Where it was settled |
|---|---|
| Relay `Node` / global ids: not adopted | plan `:2300-2311` |
| `/discoveries` shows only your own scans, not other people's | plan `:1122-1129` |
| Rankings reviewer sets: enum `scope`, no client uuid array | plan `:1189-1198` |
| "Friends Scores" with no friends returns `[]`, not everyone | plan `:1200-1204`, target-stack `:274-278` |
| `friend_request_status.ACCEPTED` survives the transform | plan `:1969-1972` |
| `item_reviews.text` stays `json`; `item_onboardings.status` unconstrained | plan `:1973-1975` |
| All eight `updated_at` trigger functions survive | plan `:1976-1980` |
| `sakes.country` default dropped, not corrected to `'JAPAN'` | plan `:905-914` |
| `RecipeSearch` / `RecipeDashboard` deleted | D9; neither path exists in `services/client/src` |
| App lives at `services/client`; Vercel Root Directory must be set there | plan `:2271-2278` |
| Subscriptions replaced by a 15s poll | target-stack `:167`, plan `:1407-1409` |
| Deployed AI = Gemini on Vertex; a local model for dev | decision 12 (user, 2026-09-17) |
| Local server: llama-server/LM Studio preferred over vLLM on Mac | decision 12, revised 2026-09-17 |
| `email_verified = false` users: do nothing; the cutover only helps them | decision 2, measured 2026-09-18 |
| OAuth providers: all three that can exist are already configured | decision 3, measured 2026-09-18 |
| `admin.credentials`: empty; drop it at day 30 | decision 4, measured 2026-09-18 |

---

# The freeze-time abort sweep

Decision 1 turned up two aborts that would have landed with the site already down: a range in
`cutover.sh` that did not match `run.sh`'s glob, and a config path written outside the repo. Both
were closed in `c3c1609e`. The obvious next question is whether a third has the same shape —
a range, a glob or a path assumption that differs between the two scripts. **Swept 2026-09-18;
nothing found.** What was compared, and what each now agrees on:

| | `packages/db/transform/run.sh` | `scripts/cutover/cutover.sh` |
|---|---|---|
| numbered files | glob `[0-9][0-9]_*.sql` | same glob, filtered by `apply_range` |
| coverage | all of them | `00`–`08`, `09`–`13`, `14`–`99` — every two-digit prefix by construction |
| lane selection | ~~`grep -l "Hand-written SQL lane" …/migrations/*/migration.sql \| sort`~~ `db:migrate` (decision 16) | the `migrate` phase: `db:migrate` too |
| `pg_dump` exclusions | `-N pgbouncer` | `-N pgbouncer` |
| reset | `DROP SCHEMA … admin, auth, cellar_meta, drizzle, hdb_catalog, storage` + `public` (`cellar_meta`, the ledger, since decision 16) | identical list |
| truncation guard | `pg_dump` completion marker in the last 5 lines | same check, same reason |

`packages/db/transform/test-db.sh` is a third build path and is **not** a third divergence: it
delegates the build to `run.sh` and globs `[0-9][0-9]_*.sql` only to compute the template
fingerprint.

**Staleness found in the same sweep** (none of it fatal, all of it in files an operator reads
during a freeze — these belong to whoever owns each file, not to this document):

- `scripts/cutover/cutover.sh:47,49` still say `pnpm db:seed`. The README beside it already says
  `bun run db:seed`. Comment-only, but the two contradict each other on the page. *(Fixed since:
  both lines say `bun run db:seed` at `4e067928`.)*
- `scripts/cutover/README.md:8` tells the operator to `export CI=true`. That was a pnpm-era
  workaround for `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` (plan `:658`); harmless under bun,
  but now unexplained, which is how a command survives past its reason. *(Fixed since: the
  README's quick start no longer says it; `cutover.sh` still exports it itself.)*
- `packages/e2e/playwright.config.ts:6` says the suite drives `http://localhost:3000`; `:84`
  defaults `baseURL` to `http://localhost:3003`. The code is right and the header is stale.
- `docs/architecture/deploy-loki.md §7.3` lists the Grafana shadowing mount as open and owned by
  E3b. It is filled — see decision 5. *(Corrected in that file since.)*
- `SRC_CONTAINER` defaults to `epic-burnell-4b4be9-postgres-1` in both scripts, a worktree-specific
  name. A production cutover sets `SRC_CONTAINER="" SRC_DSN=…`, which the README documents; the
  runbook now says so at the point where it matters. *(Worse than stale, found 2026-09-27: the
  default was checked **before** `SRC_DSN`, so `SRC_DSN=…` alone — the README's own quick-start
  shape — silently read the local legacy database on the one Mac where that container exists.
  `cutover.sh` now has no default source and refuses both-set and neither-set; every source phase
  prints the source it reads. `run.sh` keeps its default: it only ever builds dev/test schemas.)*
  *(2026-10-05: `run.sh` lost its default too, when the container it named was deleted. It now
  restores the checked-in `nhost-schema.sql` unless given `--dump` and an explicit
  `SRC_CONTAINER`.)*
- Also found 2026-09-27, same file: `DST_PASSWORD` defaulted to `cellar` and was absent from the
  README's environment table, and nothing checked the host `node` against `.nvmrc`. A wrong
  password is invisible to every `docker exec` call (the container's local socket is `trust`) and
  first fails at `files`, mid-freeze. `preflight` — and any run including `files`, `users` or
  `baseline` — now logs in over TCP and checks Node before any phase runs.
- The `pnpm` references throughout `migration-plan.md` are covered by the blanket note at `:42-46`
  and are left alone deliberately.

---

# Where this document disagrees with the plan

1. **§8.5's whole-graph test does not exist** (decision 9). Three of 47 actor modules are guarded.
2. **The plan records three feature losses; there are five** (decision 6), and only two of the five
   were actually chosen. 6e is recorded nowhere.
3. **"Catalog visible logged-out" is not a behaviour change** (decision 7). Nhost refused anonymous
   reads of every content table too. It reads as a regression in the plan's framing and is not one.
4. **Restoring image search is cheaper than the plan implies** (6a) — the old path already embedded
   server-side. The real blocker is that no configured provider does image embeddings.
5. **The idle-timeout note understates what was lost** (decision 8): a 7-day geocode cache and a
   24-hour embedding cache became 10-minute activations, and the plan discusses only actor eviction
   semantics.
6. **A1's production apply was a cutover blocker, not a nice-to-have** (decision 1) — the baseline
   diff aborted on it and no preflight check looked. ~~Blocker~~ **closed 2026-09-17**: the
   transform recreates every declared index idempotently (145 then) and `preflight.sql` §10 now
   looks. The production apply remains worth doing, on no deadline.
7. **The unverified-email change runs the other way** (decision 2). The plan says those users
   "cannot OAuth-link after cutover, though password sign-in still works", framing it as a loss.
   Nhost refuses them sign-in altogether (`AUTH_EMAIL_SIGNIN_EMAIL_VERIFIED_REQUIRED=true`), so
   the cutover *grants* them password sign-in. It is a loosening, not a restriction, and no count
   changes that.
8. **The new stack has no transactional email at all** — no mail dependency and no
   `sendVerificationEmail`/`sendResetPassword` anywhere in `services/actors` or `services/api`.
   The plan's §E1 language about users who "re-verify on their own", and decision 3's original
   option (b) about password reset, both assume a channel that does not exist. Not a regression
   (the pre-migration client exposed neither flow), but it must not be planned around.
9. **Runbook step 5 was not executable** (decision 13) and **step 4 has an unstated prerequisite**
   (decision 14). Both are now in the runbook.
10. **The local Nhost rollback stack is already down to nine of ten containers** (decision 11).
    `functions/` was deleted at `51881a0c` and that container has restarted 404 times. Production
    rollback is unaffected by that; local rehearsal of it is not possible from this branch.
11. **"Merge to `main`" was not a safe first step, and "production Nhost is unaffected by anything
    in this repository" was false** (decision 15). Nhost Cloud deploys production from `main`, and
    release-please fast-forwards `production` (Vercel Production) on every release merge. Step
    (0a) is now gated on two settings changes, each with a measured confirmation.
