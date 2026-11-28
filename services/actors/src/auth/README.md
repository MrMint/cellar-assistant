# A6 · better-auth

better-auth runs inside `services/actors` — the only process with database
credentials — mounted on the actor host's own Express server at `/api/auth/*`
(`mount.ts`). `services/api` never calls it per request: it verifies the `jwt`
plugin's 15-minute EdDSA tokens against `/api/auth/jwks`
(`target-stack.md` §6.5, Q22/Q29).

| | |
|---|---|
| Mount | `/api/auth/*` on port 3002 (better-auth's default `basePath`) |
| JWKS | `GET /api/auth/jwks` — EdDSA / Ed25519 |
| Token | `GET /api/auth/token` (session cookie in, JWT out) |
| Token lifetime | 15 minutes; `iss` = `aud` = `BETTER_AUTH_URL` |
| Claims | `sub`, `email`, `emailVerified`, `role`, plus `iat`/`exp`/`iss`/`aud` |
| Adapter | Drizzle, `provider: "pg"`, tables in `packages/db/src/schema/tables.ts` |
| Ids | `uuid` columns, `crypto.randomUUID()` values — see below |
| Database | the main one. Same pool as every actor (X2) |

## One database

better-auth's five tables live in the main database beside every other table,
and share its pool (`createAuth(config, actorDb())` in `src/index.ts`). Their
DDL is in `packages/db/baseline/schema.sql`, and `drizzle-kit pull` keeps the
definitions in `packages/db/src/schema/tables.ts`; a hand-written copy would be a
second source of truth for a table set whose property names are a hard contract
with better-auth. `authSchema` is assembled in `packages/db/src/schema/index.ts`
and re-exported from `./index.ts` here; `./auth-schema.test.ts` checks it
against better-auth's own `getAuthTables()`, which is what makes a re-pull safe.
`./auth-tables.sql` is the same DDL as a fixture for `testing.ts`.

`TABLE_WRITERS` marks these tables `infrastructure:better-auth`, alongside
`infrastructure:outbox` ("everything writes it") and
`infrastructure:migrations` ("nothing writes it"). This one means "something
that is not an actor writes it, and no actor may" — so unlike `outbox` it is
*not* writable from anywhere: `BETTER_AUTH_WRITER_MODULES` confines it to
`auth/` and `lib/profile-store.ts`. `auth/` is not excluded from the
containment scan, so a write to a *domain* table from in here is caught too.

`AUTH_DATABASE_URL` points at the main database. It is still a variable of its
own because it is a credential in its own right: `services/api` asserts on boot
that neither it nor `DATABASE_URL` reaches that process.

## Decisions

**bcrypt is preserved, and upgraded on use.** `password.ts` overrides
`emailAndPassword.password.verify`: an anchored modular-crypt pattern
(`$2[abxy]?$NN$` + 53 chars) identifies an imported bcrypt hash and it is checked
with bcrypt; anything else goes to better-auth's scrypt verifier. `hash` is
**not** overridden — bcrypt is a read path only, so every new or changed
password is scrypt.

**Yes to transparent re-hashing** (`AUTH_REHASH_ON_SIGNIN`, default on). The
reasoning: bcrypt cost 10 is the weakest credential in the system and the only
moment we ever hold the plaintext is a successful sign-in, so declining to
upgrade means carrying 2015-era hashes indefinitely. It is safe because the
upgrade cannot affect the outcome:

- `verify` computes its answer from bcrypt alone and returns it regardless.
- The write is `UPDATE account SET password = $new WHERE password = $oldHash`.
  bcrypt salts, so that string matches exactly one row; no user id is needed,
  and no other row can be hit.
- Errors are caught and logged. The row keeps its bcrypt hash and the next
  sign-in takes the identical bcrypt path. The failure mode is "try again next
  time", never "locked out".
- Concurrent sign-ins race harmlessly — the loser's UPDATE matches zero rows.

**OAuth relinks by email, but only on a verified email — both sides.**
`accountLinking.enabled` is on and `trustedProviders` is deliberately **empty**,
so a provider that does not assert `email_verified` can never take over a local
account. `requireLocalEmailVerified` is left at its default (`true`), which
blocks the pre-hijack attack: register `victim@…` with a password, wait for the
victim to sign in with Google, inherit their account. The cost is that a
user imported in the 2026-10 migration with an unverified email must sign in
with their password (which still works) and verify the address before OAuth
will link. Imported users who already had a social login are unaffected: their
`account` row carries the same `(provider_id, account_id)`, so they match
exactly and never reach the linking-by-email branch at all.

**Password auth has three modes; production is `signin-only`.**
`AUTH_PASSWORD_MODE` (`config.ts`, default `enabled`):

| Mode | Sign-up | Sign-in | change/verify-password | Where |
|---|---|---|---|---|
| `enabled` | yes | yes | yes | dev, the shared lane, e2e (the seeded accounts are password accounts) |
| `signin-only` | 400 (`disableSignUp`) | yes | yes | production |
| `disabled` | 404 | 404 | 404 | available; refuses to boot with no social provider |

Reset-by-email is refused in every mode: no `sendResetPassword` is configured
because this deployment sends no email, and better-auth answers
`/request-password-reset` with `RESET_PASSWORD_DISABLED` without one. That is
also why email verification was never restored: social providers assert the
address instead. `disabled` sets `emailAndPassword.enabled: false` **and**
lists every password path in `disabledPaths` (`PASSWORD_PATHS` in `auth.ts`),
because in 1.7.3 `enabled` gates only `/sign-in/email` and `/sign-up/email` —
`/change-password` and `/verify-password` ignore it. No mode reads or writes an
`account` row, so changing mode is reversible in both directions.
`signin-only` with no social provider configured boots with a loud warning
(nobody could join); `disabled` with none refuses to boot (nobody could sign
in). Tests: `password-mode.test.ts`.

**Imported password users keep their account by signing in with Google or
Discord — not Facebook.** A credential user whose address is verified (all 20
imported production users are) and who signs in with Google or Discord on the
same address is linked into the same user row, keeping the credential account
beside the new one. `credential-linking.test.ts` drives each provider's own
`getUserInfo` with only the network stubbed, because `emailVerified` is decided
there: Google's `email_verified` claim, Discord's `verified`, and for Facebook
`profile.email_verified ?? false` from a Graph `/me` request that never asks for
such a field — or a hard-coded `false` on the id-token path. **So Facebook
never links by email in 1.7.3.** Adding `facebook` to `trustedProviders` would
fix that by letting any Facebook account claim any local account with a
matching address, which is the takeover the empty list exists to prevent; it is
deliberately not done. A password user whose only social login is Facebook
keeps signing in with their password under `signin-only`. Imported users who
already had a Facebook identity are unaffected — they match on their
`(provider_id, account_id)` and never reach linking by email.

**Imported accounts carry no OAuth tokens.** The 2026-10 migration moved only
the identity binding; the tokens were issued to other client ids and are
useless to this app's OAuth applications.

**Ids are `uuid` columns holding UUIDs.** Every primary key — `user.id`,
`session.id`, `account.id`, `verification.id`, `jwks.id` — and both id foreign
keys (`session.user_id`, `account.user_id`) are Postgres `uuid`, matching the
`user_id` columns of the 31 `public.*` foreign keys that reference `"user"`.

`advanced.database.generateId` is a function returning `crypto.randomUUID()`,
not the built-in `"uuid"` — on Postgres that setting makes the adapter omit the
id column and rely on a `DEFAULT gen_random_uuid()` these tables deliberately
do not have, so id policy stays in the application. Supplying the value
explicitly works against `uuid` columns because Drizzle represents `uuid` as a
JS string and node-postgres sends it as an untyped parameter, which Postgres
resolves to `uuid`; better-auth sees the ids as the strings it expects
throughout. Imported users keep the UUID they were imported with.

Not every id-shaped column is a UUID, and these stay `text` on purpose:
`session.token`, `account.account_id` (a provider's own opaque id — only for
`provider_id = 'credential'` does it happen to equal `user.id`),
`account.provider_id`, and `verification.identifier` / `verification.value`.

**`ctx.kind === 'system'` is unrepresentable in a token.** `definePayload`
collapses `user.role` to exactly `"admin"` or `"user"` (`tokenRole`), whatever
the column holds, and the claim set is closed rather than "the whole user row".
`role`, `locale` and `disabled` are all declared `input: false`, so a sign-up
body cannot set them. Both are covered by tests in `auth.test.ts`.

**The `disabled` flag is enforced, including on sessions that already
exist.**
`databaseHooks.session.create.before` refuses a new session; setting
`"user".disabled` to true deletes the user's sessions in the same transaction
(trigger, `packages/db/migrations/…_disabled_user_ends_sessions`, which also
ended the sessions of anyone already disabled); and for a session row that
somehow survives, `definePayload` refuses to mint a JWT (`/token` and
`/get-session`'s `set-auth-jwt`) and `session.update.before` refuses to refresh
it. There is no admin mutation for disabling; `UPDATE "user" SET disabled =
true` is the supported path, and the trigger is why it is enough.
`disabled-user.test.ts` covers each layer on its own.

**A display name is never an email address** (`display-name.ts`). It is
returned and searched for every signed-in viewer; the email is not. Sign-up —
email or OAuth — stores a neutral `member-xxxxxx` handle when the name is blank
or email-shaped (`user.create.before`), better-auth's `/update-user` refuses one
(`user.update.before`), `UserActor.updateProfile` refuses one, and the
backfill migration `…_display_names_are_not_emails` rewrote existing rows (name
equal to the address, empty, or containing an email) to a handle derived from
the user id. This app's sign-up form defaulted the name to the address until
2026-09-28.

**Rate limiting keys on the real client.** better-auth's limiter (on in
production) reads the client address from `x-cellar-client-ip` only, which
`client-ip.ts` rewrites on every request: the Next proxy's claim when it
presents `AUTH_PROXY_SECRET`, else the nearest proxy's `X-Forwarded-For` entry,
else the socket. The Next server's own `/token` and `/get-session` exchanges,
when verified, are exempt from the per-address rule and counted per session
(`session-exchange-limit.ts`, `AUTH_SESSION_EXCHANGE_LIMIT`). Storage is
in-memory: one replica. The production host refuses to start without a real
`AUTH_PROXY_SECRET` (`readProxyTrust` in `config.ts`). Why the secret and not a
trusted-proxy list, and what breaks without it: `client-ip.ts`'s module doc and
`docs/architecture/deploy-loki.md` §2.5. `rate-limit.test.ts` runs the real
limiter.

**The session cookie is renewed through `/api/graphql`.** better-auth slides a
session forward (and re-issues its cookie) on the first read after a day; the
browser's only session read is the Next server's `/token` exchange, so
`services/client`'s `graphql-proxy.ts` relays the re-issued session cookie
(`session-refresh.test.ts`). A viewer who only ever loads server-rendered pages
is not renewed by this — a server component cannot set cookies.

## Rotating the signing key

`jwks-rotation.ts` and its CLI `rotate-jwks.ts`. The design and the evidence for
every claim below are in the header of `jwks-rotation.ts`; this is the runbook.

`expires_at` on a `jwks` row does **not** mean "this key dies". better-auth
reads it as "this key stops *signing*", and keeps publishing the key — so it
keeps *verifying* — for a further `gracePeriod`. That is the whole overlap
primitive, so rotation needs no new table and **no migration**.

Three states, all of them just `expires_at`:

| state | `expires_at` | signs? | at `/jwks`? |
|---|---|---|---|
| active | `NULL`, newest live | yes | yes |
| standby | **exactly** `created_at` | no | yes, for `gracePeriod` |
| retiring | a past instant after `created_at` | no | yes, for `gracePeriod` after it |

A standby is written with that mark by the `INSERT` that creates it, so it is
never live — not even between two statements — and `promote`/`retire` each
check, inside their own write, that the key is still in the state they read.

```sh
# Run with the actor host's own environment — minting a key encrypts its
# private half under BETTER_AUTH_SECRET.
R="node services/actors/src/auth/rotate-jwks.ts"
# …or inside the actor container, whose working directory is services/actors:
#   R="docker exec cellar-stack-actors-1 node src/auth/rotate-jwks.ts"

$R status     # what each key is, and whether promote is safe yet
$R publish    # mint a standby: at /jwks immediately, signs nothing
#   …wait 900s — `status` counts it down…
$R promote    # the standby starts signing; the old key keeps verifying
#   …wait 1800s — the old key verifies out its grace period…
$R retire     # delete rows /jwks no longer serves
```

Nobody is logged out and **nothing is restarted**: the signing key is read from
the table on every single sign, so `promote` takes effect across every replica
at once.

Two things that will bite:

- **Do not set `jwks.rotationInterval`.** It is better-auth's own scheduled
  rotation and it mints the replacement key *inside the request that first
  signs with it*, so `services/api` can reject every token minted in the next
  30 seconds (jose refuses to refetch an unknown `kid` while its cooldown is
  active). That is the failure this module exists to avoid.
- **`retire` and the running actor host must agree on `gracePeriod`**, because
  each decides independently which keys `/jwks` still serves. They do agree by
  construction — both read `JWKS_PLUGIN_OPTIONS` — but a CLI run against a host
  that has not been redeployed with the current value is reading a different
  rule than the host is.

For a compromised key, `promote --force` skips the soak (accepting up to 30s of
rejections) and `retire --kid <id> --force` deletes it while it is still
published — which *does* log out everyone holding a token it signed, and is the
point. If `BETTER_AUTH_SECRET` itself leaked, rotation is the wrong tool: see
`config.ts`, where a reset is correct.

## Callback URLs to register

`<BETTER_AUTH_URL>/api/auth/callback/<provider>`. Locally:

- Google — `http://localhost:3002/api/auth/callback/google`
- Facebook — `http://localhost:3002/api/auth/callback/facebook`
- Discord — `http://localhost:3002/api/auth/callback/discord`

A provider is registered only when **both** halves of its credentials are
present, so a missing secret disables it rather than half-configuring it.

## Commands

```sh
# The tables come from the baseline, like every other table:
packages/db/baseline/build.sh

# A development environment from nothing: reference rows plus the two test
# accounts, signed up through /api/auth/sign-up/email so their hashes are native
# scrypt. No hand-inserted rows anywhere.
bun run db:seed
```
