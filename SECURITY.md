# Security policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.** A public issue is
visible to everyone the moment it is filed, including before there is a fix.

Report it privately through GitHub's private vulnerability reporting:

**<https://github.com/MrMint/cellar-assistant/security/advisories/new>**

That form is private between you and the maintainers, lets us discuss the issue
and prepare a fix, and can issue a CVE and a published advisory when the fix
ships. It needs no email address and no prior contact.

### What to include

As much of this as you have:

- What the problem is, and what an attacker gets out of it.
- Which part of the system it affects — `services/client`, `services/api`,
  `services/actors`, `packages/db`, `packages/policy`, or the `infra/` stack.
- Steps to reproduce, or a proof of concept.
- The version, branch or commit you tested.
- Whether you have told anyone else, and any disclosure deadline you intend to
  hold us to.

### What to expect

This is a small, hobby-scale project maintained in spare time. We will
acknowledge your report and keep you updated on a fix, but we cannot promise a
response time, and there is no bug bounty.

We will credit you in the advisory unless you would rather stay anonymous.

## Scope

This policy covers the code in this repository.

It does **not** cover any hosted instance operated by someone else, or the
third-party services the app can be configured to talk to (Vercel, Google
Cloud / Vertex AI, MinIO, Grafana, Ollama and other model servers). Report
problems in those to their own maintainers.

## Things that are already known, and not vulnerabilities

Please don't report these — they are deliberate, documented choices:

- **The local development stack has no secrets worth the name.** The seeded
  accounts (`test@test.com` / `test2@test.com`, password `123456789`) and the
  placeholder values in `infra/.env.example` are for local use and are meant to
  be public.
- **The Dapr actor host is not published to the internet**, and does not need
  to be: only better-auth's `/api/auth/*` is proxied to it. It is no longer
  unauthenticated, though — every path except better-auth's and `/healthz`
  requires the `dapr-api-token` its sidecar presents (`APP_API_TOKEN`,
  `services/actors/src/lib/dapr-app-token.ts`), and the sidecars themselves
  require `DAPR_API_TOKEN` from every caller. The development lane uses
  *published* values for both (`infra/docker-compose.yml`), so a report that
  the actor host answers with those on localhost is expected. A report that
  it answers without a token, that some deployment exposes it, or that
  production accepts a published development value, is very much not.
- **The API process holds no database credentials**, by design, and asserts as
  much at boot.
- **Paid AI and Google calls are capped per account as well as globally**
  (`BudgetActor`, `USER_CAPS`): an account that reaches its hourly or daily
  share of a seam gets `BUDGET_EXCEEDED` until the window rolls. That is the
  intended behaviour, not a denial of service. Sign-in is rate-limited per
  client address in production; `AUTH_PROXY_SECRET` is what lets the actor host
  trust the address the Vercel frontend reports, and production refuses to
  start without it.

## Running it yourself

If you self-host this, two things carry real risk and are yours to get right:

- `infra/.env.prod` holds every production secret and is gitignored. Keep it
  off the internet and out of git.
- Only the reverse proxy should be published to the internet. Postgres, MinIO,
  Grafana and the actor host are bound to loopback or to a LAN interface on
  purpose; a port forward routes around that binding.
