# First deploy to Loki

**Status:** written by E3a, 2026-09-10; the edge reworked on 2026-10-04 to sit
behind Loki's existing nginx-proxy instead of a Caddy of its own (§1). Not yet
executed on Loki — see
[§8](#8-what-is-unverified-from-here) for exactly which parts of this have been
run and which have only been reasoned about.
**Audience:** whoever does the first production deploy of the post-Nhost stack.

This covers the public edge, TLS and identity. The deploy *pipeline* (GitHub
Actions building the images, the self-hosted runner pulling them) and backups
are E3b's, in `.github/workflows/` and `docs/architecture/backup-restore.md`.

---

## 1. The shape of it

```
   browser
      │  https://cellar.example.com            ← PUBLIC_APP_ORIGIN
      ▼
   Next.js on Vercel  ──── /api/auth/* ────┐   (server-side proxy;
      │                     /graphql       │    src/lib/api/{auth,graphql}-proxy.ts)
      │                                    ▼
      │                        https://loki.example.com     ← PUBLIC_EDGE_HOST
      │                 nginx-proxy on Loki (the host's, shared; 80/443)
      │                              ├── /graphql, /healthz  → api:3001     (exact)
      │                              ├── /api/auth/*         → actors:3002  (prefix)
      │                              └── anything else       → 404
      │
      └──── presigned PUT / GET ───► https://files.example.com  ← PUBLIC_FILES_HOST
                                   nginx-proxy → minio:9000 (Host and path untouched)

   certificates: nginx-proxy-acme (the host's acme-companion, its existing LE account)
   Grafana:      http://<LAN_BIND_ADDR>:3010, published on the LAN interface only
```

**The edge is not part of this stack.** Loki already runs `nginx-proxy` (with
`nginx-proxy-acme`) on 80/443 for other services, managed outside this
repository (the "edge stack" below). This stack sits behind it. Until 2026-10-04 the plan was a Caddy container of our
own publishing 80/443, which cannot coexist with a proxy that already owns
those ports; it is gone, and every guarantee it carried is restated in §3 with
where it now lives.

How nginx-proxy is told what to serve, since none of it is a file you edit on
the host:

- **Routing is environment on the containers.** `api`, `actors` and `minio`
  carry `VIRTUAL_HOST`, `VIRTUAL_PATH` and `VIRTUAL_PORT`
  (`infra/docker-compose.prod.yml`); nginx-proxy's bundled docker-gen turns them
  into `server`/`location` blocks whenever a container starts, stops or changes
  network. `api` claims `~ ^/(graphql|healthz)$`, `actors` claims
  `^~ /api/auth/`, and because nobody claims `/` the template adds
  `location / { return 404; }`. `minio` claims its whole hostname.
- **Per-host nginx settings are files** in the proxy's `vhost.d`
  (`<vhost.d path>` — the host directory bind-mounted at `/etc/nginx/vhost.d`
  in the proxy; `docker inspect nginx-proxy` shows it). Ours are
  `infra/nginx-proxy/vhost.d/{edge,files}.conf`, installed under each hostname
  by `scripts/deploy/edge.sh install`: the 128 KiB body cap on the edge, the
  21 MiB cap and unbuffered streaming on the files host.
- **The proxy reaches containers over a shared network**, and on Loki that is
  Docker's default `bridge` — nginx-proxy is `network_mode: bridge`, and the
  edge stack keeps it there for its other services. Compose cannot attach a service to `bridge` next to the
  project network (measured: the daemon refuses the alias Compose always adds),
  so `scripts/deploy/edge.sh attach` does it with `docker network connect`
  after every `up`, for exactly the services that carry `VIRTUAL_HOST`.
- **Certificates are acme-companion's.** It issues for every container with
  `LETSENCRYPT_HOST` using the account it already has (its `DEFAULT_EMAIL`), by
  HTTP-01, answered by nginx-proxy's built-in `/.well-known/acme-challenge/`
  location.

Three things follow from this picture, and every one of them has bitten a
migration somewhere:

- **The auth origin is Vercel's, not Loki's.** `BETTER_AUTH_URL` is
  `PUBLIC_APP_ORIGIN`. better-auth derives its OAuth redirect URIs, the JWT
  `iss`/`aud` and its `__Secure-` cookie prefix from that one value, and the
  browser only ever addresses Vercel. Pointing it at `PUBLIC_EDGE_HOST` would
  send OAuth callbacks straight past the Next proxy and set session cookies on
  an origin the app never reads.
- **`services/api`'s `AUTH_ISSUER` and `AUTH_AUDIENCE` are the same string**, byte
  for byte. `services/actors` stamps them verbatim and `jose` compares them as
  strings. `infra/docker-compose.prod.yml` derives all three from
  `PUBLIC_APP_ORIGIN` so they cannot drift, and both processes assert it at
  startup anyway (`assertPublicAuthOrigins`, `assertAuthIdentityCoherence`).
- **MinIO needs a hostname, not a path.** Every file URL is SigV4-presigned and
  the signature covers the `Host` header *and* the URI path; the upload signer
  produces path-style `/<bucket>/<key>`. A `/files` prefix on the edge would
  break the signature twice over. Hence `PUBLIC_FILES_HOST`.

---

## 2. What only you can do

Nothing in this section can be automated from a repository. Do all of it before
§4.

### 2.1 DNS — two names pointing at Loki

Both must resolve, publicly, to something that reaches Loki's 80 and 443:

| Name | Value |
|---|---|
| `loki.example.com` (`PUBLIC_EDGE_HOST`) | your WAN address |
| `files.example.com` (`PUBLIC_FILES_HOST`) | your WAN address |

Follow whatever shape the zone's other public names already use (an `A`
record, or a `CNAME` to a name that is kept current). If the DNS provider can
also proxy traffic (Cloudflare's "orange cloud", for example), proxied or
DNS-only is yours to choose; what each changes here:

- **DNS-only.** nginx sees the real client address. Nothing else changes.
- **Proxied.** Works for both names provided the proxy passes HTTP-01 through
  on port 80, passes `Host` and the path through unchanged (the S3 signature
  covers only those), and allows request bodies above the 20 MiB upload limit.
  But nginx's peer becomes a proxy address, which matters only for traffic
  *without* the proxy secret (§2.5): it is then rate-limited per proxy edge
  address instead of per client. Unproxied WebSockets or long polls are not
  used by this stack.

**Verify (from off the LAN, e.g. a phone on cellular):**

```bash
dig +short loki.example.com
dig +short files.example.com
# both must reach your current WAN address (directly, or via the CNAME chain)
curl -s https://api.ipify.org; echo    # run on Loki: what your WAN address is
```

### 2.2 Router — 80 and 443 already go to Loki; check, do not add

nginx-proxy owns `0.0.0.0:80` and `0.0.0.0:443` on Loki (check with
`docker inspect` and `ss -ltn`) and already serves other public names, so the
TCP forward of both ports to Loki should already exist.
What to check, from off the LAN, against a name that already works:

```bash
curl -sI https://<an existing public name on Loki>/ | head -1   # any answer at all
nc -zv loki.example.com 80     # after §2.1: the new names reach the same box
nc -zv loki.example.com 443
```

Port 80 is load-bearing: acme-companion's HTTP-01 challenge is answered there.
nginx-proxy does not advertise HTTP/3 (no `ENABLE_HTTP3` on the container), so
there is nothing to do about UDP 443.

Do not forward anything else. In particular 5433, 9100, the API's loopback port
and 3010 must stay off the router; `infra/docker-compose.prod.yml` binds them to
loopback or the LAN interface, but a port forward would route around that.

### 2.3 OAuth — register three redirect URIs

Exactly these, with your own `PUBLIC_APP_ORIGIN` substituted. They are derived
from better-auth's own routing, not transcribed:

| Provider | Console | Redirect URI |
|---|---|---|
| Google | console.cloud.google.com → Credentials → OAuth client | `https://cellar.example.com/api/auth/callback/google` |
| Facebook | developers.facebook.com → Facebook Login → Settings | `https://cellar.example.com/api/auth/callback/facebook` |
| Discord | discord.com/developers → OAuth2 → Redirects | `https://cellar.example.com/api/auth/callback/discord` |

Print them for your origin rather than retyping:

```bash
cd services/actors && PUBLIC_APP_ORIGIN=https://cellar.example.com \
  node -e 'import("./src/auth/config.ts").then(m => console.log(m.oauthRedirectUris(process.env.PUBLIC_APP_ORIGIN)))'
```

Leave the existing Nhost redirect URIs in place until E4's 30-day rollback
window closes — providers allow several, and removing them early makes rollback
impossible.

`services/actors/src/auth/config.test.ts` pins these against the mounted base path,
so a change in either one fails CI rather than production.

### 2.4 Secrets — generate and place them

```bash
cp infra/.env.prod.example infra/.env.prod   # gitignored; never commit it
```

Fill in every REQUIRED value. Six are generated, not chosen:

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET   (rotating it kills every session AND
                          #   strands the stored JWKS private key, which is encrypted
                          #   under it: delete the `jwks` rows too so a fresh keypair
                          #   is minted — services/actors/src/auth/config.ts)
openssl rand -base64 24   # POSTGRES_PASSWORD
openssl rand -base64 24   # MINIO_ROOT_PASSWORD
openssl rand -base64 24   # GRAFANA_ADMIN_PASSWORD
openssl rand -hex 32      # DAPR_API_TOKEN   (every sidecar refuses a caller of its API
                          #   that does not present it as `dapr-api-token`)
openssl rand -hex 32      # APP_API_TOKEN    (what a sidecar presents to its app; the
                          #   actor host refuses /actors/* without it)
```

`DAPR_API_TOKEN` and `APP_API_TOKEN` are two different values, and
`docker-compose.prod.yml` refuses to start without either. They are what stands
between anything on the compose network and every actor method — including
`ProbeJobActor`, which can end the actor process — so treat them as the
credentials they are: rotating one means restarting every sidecar and app
together (target-stack.md §3.1, "Dapr API tokens").

`MINIO_ROOT_USER` is a name, not a secret, but do not leave it as `cellar`.
`LAN_BIND_ADDR` is this machine's LAN address, `<loki-lan-ip>` (`ip -4 addr`
on Linux) — leave it at the default and Grafana is reachable only from the box
itself. `API_PORT` must be a free port: on Loki the default 3001 is already
taken by another service (check with `ss -ltn`), and `up` fails on it. There is no ACME address to set: the
certificates come from acme-companion's existing account.

`GRAFANA_ADMIN_PASSWORD` is read **once**, when Grafana creates its database on
the first start, and never again — Grafana's data now lives on a volume that
outlives the container. Pick it before the first `up`; changing it later is §9.2,
not an edit to this file.

Never run `docker compose ... config` into anything shared: it renders the whole
file, secrets included.

### 2.5 Vercel — point the frontend at Loki

First, the project's **Root Directory must be `services/client`** (Project
Settings → Build and Deployment). The Next app moved out of the repository root
(R1, `migration-plan.md` §8.1), and the root is no longer a package at all, so a
project still building from the root fails its Production build — or, if it
somehow succeeds, serves nothing this stack recognises. It is a dashboard
setting; nothing in this repository can change it. Mind the ordering hazard in
`e4-decisions.md` decision 15: once it is set, the *next* Production build
builds the new frontend.

Then four server-side environment variables on the Vercel project (none is
`NEXT_PUBLIC_`; the browser never learns the first two, and must never learn
`AUTH_PROXY_SECRET`):

| Variable | Value |
|---|---|
| `BETTER_AUTH_ORIGIN` | `https://loki.example.com` — where the Next proxy forwards `/api/auth/*` |
| `GRAPHQL_API_URL` | `https://loki.example.com/graphql` |
| `PUBLIC_FILES_HOST` | `files.example.com` — same value as `infra/.env.prod`, bare hostname |
| `AUTH_PROXY_SECRET` | **the same value as `infra/.env.prod`'s** (`openssl rand -hex 32`, ≥ 32 characters) |

`AUTH_PROXY_SECRET` is how the actor host tells this Next server's requests from
anyone else's at the edge. Every request the Next server makes to
`/api/auth/*` carries it (`services/client/src/lib/api/proxy-secret.ts`), and
the browser passthrough adds the browser's address from Vercel's `x-real-ip`,
which Vercel overwrites so a client cannot set it. The actor host believes
that address **only** when the secret matches
(`services/actors/src/auth/client-ip.ts`), and better-auth's rate limiter
(on in production: 3 sign-ins per 10 s, 100 requests per 10 s, per address and
path) counts it. Without the secret, every request is keyed on the address
nginx-proxy accepted it from — Vercel's egress, the same for everybody — so one
person's three wrong passwords would lock every user out of sign-in. The
server's own session exchanges (`/token` on every `/api/graphql` request,
`/get-session` on SSR) are counted per session instead
(`AUTH_SESSION_EXCHANGE_LIMIT`, default `300/60`), so a campus NAT does not
throttle its own users. The actor host **refuses to start** in production
without the secret; the Vercel side cannot refuse anything, so a missing or
different value there degrades silently to the shared bucket — the check
(better-auth records the keyed address in `session.ip_address`) is step (0e) in
`migration-plan.md`'s E4 runbook.
nginx-proxy's access log format (`vhost`) records the request line and no
request headers, so the secret is not logged at the edge. It is not
`NEXT_PUBLIC_`, not in `next.config.mjs`'s `env`, and not a Docker build `ARG`,
and `proxy-secret.test.ts` holds all three. Rotating it means setting the new
value in both places and redeploying both; between the two, sign-in works but
is rate-limited as one bucket.

The first two are the edge host, **not** `PUBLIC_APP_ORIGIN`. They are the one
pair that points *at* Loki; everything in §2.4 points at Vercel. Setting
`BETTER_AUTH_ORIGIN` to the Vercel origin makes the proxy forward to itself.

`PUBLIC_FILES_HOST` is the odd one out and is easy to forget, because it is the
only variable that has to be set in *two* places — here and in
`infra/.env.prod`. Vercel needs it because `next.config.mjs` puts it in the
`connect-src` of the Content-Security-Policy, without which the browser refuses
every presigned upload (§7.1). Two consequences:

- **Set it as a build-time variable**, available to Production (and to Preview,
  if previews should upload). `headers()` in `next.config.mjs` is evaluated when
  the app is *built*, so a value added afterwards does nothing until the next
  deploy.
- A build with it missing is not silent: `next.config.mjs` logs a `[csp]`
  warning naming the variable into the Vercel build log. `FILES_S3_PUBLIC_URL`
  (`https://files.example.com`) is accepted as an alternative spelling.

> The doc comment on `authOrigin()` in `src/lib/api/config.ts` used to say this
> value "must equal the actors app's own `BETTER_AUTH_URL`". That is true only
> in development, where both happen to be `http://localhost:3002`; in
> production they are deliberately different hosts. The comment has been
> corrected.

### 2.6 GitHub — what the deploy pipeline needs

> ⚠️ **Do not register a persistent self-hosted runner on Loki while this
> repository is public.** A pull request from a fork runs *the workflow files
> in that pull request*, not the ones on `main`, so anyone who can get a PR's
> workflows run (a past contributor, or a first-time one once approved) can
> add `runs-on: [self-hosted, loki]` to a workflow of their own and execute
> arbitrary code on Loki — with Docker (root-equivalent on the host), write
> access to the shared nginx-proxy's `vhost.d`, and `infra/.env.prod` on disk.
> Nothing in `deploy-loki.yaml` can prevent that: its repository/event guard
> and SHA-pinned actions protect that file, not the runner. GitHub's own
> guidance is to use self-hosted runners only with private repositories.
>
> **Recommended instead — pick one; neither puts a runner on Loki:**
>
> 1. **Pull-based deploy (preferred).** The `build` job stays as it is on
>    GitHub-hosted runners and publishes `sha-<7>` images to GHCR. On Loki, a
>    systemd timer (or cron) under a dedicated deploy user polls GHCR for a
>    new `sha-*` tag of both images, confirms that sha is a commit on `main`,
>    checks it out, and runs the same steps as the `deploy` job — the secret
>    guard, migrate, `scripts/deploy/edge.sh install`, `up -d --wait`,
>    `edge.sh attach` and `verify`. GitHub never reaches Loki and nothing on
>    Loki accepts work from GitHub; a fork PR's `GITHUB_TOKEN` is read-only, so
>    it cannot push an image for Loki to pick up.
> 2. **GitHub-hosted job reaching Loki over SSH with a forced command.** The
>    deploy job runs on `ubuntu-latest` and connects to Loki (port forward or
>    a Tailscale ACL) with a key whose `authorized_keys` entry is
>    `command="/opt/cellar-assistant/deploy.sh",restrict` — the key can run that
>    one script, which takes only the commit sha and validates it, and nothing
>    else. Keep the private key as a secret of a GitHub *environment*
>    (`production`) whose deployment branches are limited to `main`, so fork
>    PRs never see it.
>
> Either means replacing the `deploy` job in `.github/workflows/deploy-loki.yaml`
> (it still targets `[self-hosted, loki]`, so with no runner registered it
> queues and never runs). **If a self-hosted runner is used anyway:** make it
> `--ephemeral` (one job, then re-registered by a wrapper), run it as a
> dedicated non-login user, set *Settings → Actions → Fork pull request
> workflows* to require approval for **all** external contributors, keep every
> action SHA-pinned, and never add a `pull_request*` trigger to a workflow
> that can reach it.

**No repository secret.** `.github/workflows/deploy-loki.yaml` pushes and pulls
GHCR images with the `GITHUB_TOKEN` every job is issued (self-hosted runners
included), and reads every application secret from `infra/.env.prod` on Loki
itself, which never passes through GitHub. What it does need:

- **A self-hosted runner on Loki carrying the `loki` label** — none is
  registered yet (the workflow's header), so the `deploy` job queues until one
  is. **Read the warning above before registering one.** It needs Docker with
  the compose v2 plugin ≥ 2.24, permission to run both, `jq` and `curl`, and
  **write access to nginx-proxy's `vhost.d`** (`<vhost.d path>`; grant it to
  the runner's user or group specifically — see §7).
- **Optionally, repository *variables*** (paths and names, not secrets), each
  only if the default is wrong: `LOKI_ENV_FILE_PATH`
  (`/opt/cellar-assistant/infra/.env.prod`), `LOKI_NGINX_PROXY_CONTAINER`
  (`nginx-proxy`), `LOKI_NGINX_PROXY_NETWORK` (`bridge`). Take the last two
  from `docker inspect nginx-proxy`; if the edge stack is ever rebuilt with
  different names, set them here rather than editing the workflow.
- **One required repository variable, `LOKI_NGINX_PROXY_VHOST_DIR`** — the
  host path of nginx-proxy's `vhost.d` (`<vhost.d path>`; the `Source` of the
  mount whose `Destination` is `/etc/nginx/vhost.d` in `docker inspect
  nginx-proxy`). It has no default in the repository: the deploy job fails
  before touching anything if it is unset.

- **A decision, not a secret: whether `stack-ci` gates merges.** The deploy
  cannot wait on another workflow, so it smoke-tests its own images before
  pushing them (`scripts/ci/image-smoke.sh`, the same check `stack-ci`'s
  `images` job runs on every PR). Everything else `stack-ci` checks — the
  suites, typecheck, the schema drift check — gates a deploy only if it is a
  *required status check* on `main` (branch protection). It is not one today,
  and because it is path-filtered, making it required as-is would leave PRs it
  never ran on waiting for it forever; it would need its `paths` dropped, or a
  small always-run summary job to require instead.

An earlier version of this section asked for "registry credentials" secrets;
the workflow has never read one.

### 2.7 AI — Vertex AI, not a model on the box

**Settled 2026-09-17** (`e4-decisions.md` §12): **deployed runs the Gemini models on Vertex AI.**
Local dev on the Mac runs a local model (vLLM when this was written; revised the same day to
`llama-server` or LM Studio, see below); **Loki serves no model at all.** That is what makes Loki's
hardware — never stated in this document, and the open question in
`findings/vllm-provider.md` §9 — stop mattering for AI.

So the manual step here is a GCP service account, not an `ollama pull`:

```bash
# infra/.env.prod
AI_PROVIDER=vertex-ai
GOOGLE_GCP_PROJECT_ID=<project>
GOOGLE_GCP_LOCATION=global                # Gemini models are served globally
VERTEX_AI_EMBEDDING_LOCATION=            # leave EMPTY: gemini-embedding-2 is served only at global
GOOGLE_APPLICATION_CREDENTIALS_JSON=<the service-account key, inline>
#   or GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
#   the service account needs roles/aiplatform.user
```

The key is read **from the environment only**. There is no checked-in credentials file and no
database lane for it — the Nhost stack's `admin_credentials` fallback was deliberately not ported
(`services/actors/src/lib/ai/config.ts`). Which raises the one thing to do before day 30:

> **`admin.credentials` may hold the only copy of this key.** `e4-decisions.md` decision 4: if
> production ran with `CREDENTIALS_GCP_ID` set and no credentials file, that row is a live
> service-account private key. Run `scripts/cutover/preflight.sql:302-308` and dump it before
> Nhost is deleted, or rotate the service account in GCP instead. This decision makes Vertex the
> deployed AI path, so that key is now load-bearing rather than vestigial.
>
> **Since resolved (decision 4, 2026-09-18):** the table is empty in the rollback database, so
> there was never a key in it to rescue. The preflight query still reports production's count, and
> the key this section needs comes from a GCP service account either way.

Two properties of the deployed embedding path worth knowing before something fails at 2am:

- **The embedding model is `gemini-embedding-2`**, and Vertex serves it **only** at
  `locations/global`, only through `:embedContent` (`:predict` 404s for it in every region —
  ax-llm/ax#715, weaviate/weaviate#13280). That is why `VERTEX_AI_EMBEDDING_LOCATION` stays
  **empty**: empty reads as unset (`services/actors/src/lib/ai/config.ts`), and unset lets
  `embeddingLocation` (`vertex-ai.ts`) send `gemini-embedding-2` to `global` and an older
  `text-embedding-*` to `us-central1`. **Any value set there wins**, so `us-central1` — what this
  section and the env examples said before 2026-09-28 — 404s every embedding call.
- **`AI_EMBEDDING_DIMENSIONS` is 768**, because all four `halfvec` columns are.
  `gemini-embedding-2` is asked for 768 via `outputDimensionality` and re-normalises the shortened
  vector itself. `EmbeddingActor` rechecks the width it received and refuses any other, so a
  model swap fails immediately rather than inside a `<=>`.
- **Changing the embedding model invalidates every stored vector.** Two models are two spaces.
  Every `item_vectors` / `recipe_vectors` row records the model that made it (`embedding_model`),
  and `VectorReembedJobActor` re-embeds every row another model made:
  `bun scripts/operator.ts reembed` (§4.2). **The cutover is such a switch** — every migrated
  vector has `embedding_model` NULL — so §4.2 is a step of the first deploy, not an option.

Unset `AI_PROVIDER` entirely to deploy with no model — every AI feature then fails with an error
naming itself, which is a supported state. A provider that is *set but incomplete* makes the actor
host refuse to start, on purpose.

**Ollama on Loki is no longer the plan**, but it still works and is the fallback if the GCP account
is not ready on the day: `AI_PROVIDER=ollama` reaches the host's ollama at
`host.docker.internal:11434`, needing `ollama pull nomic-embed-text` (768-dim) and
`ollama pull gemma3:4b` on the box. It is a downgrade in quality, not in correctness.

**Careful, if you do fall back:** switching between `ollama` and `openai-compatible` invalidates
every stored vector, in either direction, because `EmbeddingTaskType` is a no-op on one and an
instruction prefix on the other. That is a re-embed of `item_vectors`, `recipe_vectors`,
`category_vectors` and `place_vectors`, not a config flip.
`services/actors/src/lib/embeddings.ts` has the full list. Falling back from `vertex-ai` to
`ollama` is the same problem: both are 768 wide, so nothing errors — retrieval just quietly gets
worse.

### Local dev, for contrast — not this host

Nothing below runs on Loki; it is here so the two halves of the decision are in one place.
Local dev uses `AI_PROVIDER=openai-compatible` against a Metal-accelerated server on the
developer's Mac — **`llama-server` (llama.cpp) or LM Studio preferred**. vLLM is supported but
CPU-only on Apple silicon, at **52.4 s per image** against **1.16 s** on MPS, and four of the
seven seams are vision seams. If vLLM is used anyway, **`--no-enable-prefix-caching` is
mandatory**: with vLLM's default caching on, 3 of 6 embeddings came back silently corrupted —
unit-norm, no NaN, no error, and one at cosine `-0.0016` against the reference.
`scripts/ai/local-model.sh verify` checks for it. Full reasoning: `e4-decisions.md` §12.

---

## 3. What is automated

- **The edge, and what it refuses.** Each guarantee the Caddyfile carried, and
  where it lives now:

  | Guarantee | Now |
  |---|---|
  | Only `/graphql`, `/healthz` → api; only `/api/auth/*` → actors; everything else 404 | `VIRTUAL_PATH` on `api` (`~ ^/(graphql\|healthz)$`) and `actors` (`^~ /api/auth/`); nobody claims `/`, so nginx-proxy generates `location / { return 404; }` |
  | The actor host sees the raw path (its canonical-path gate answers 400 for dot segments, empty segments, …) | `VIRTUAL_DEST` unset, so `proxy_pass` carries no URI and nginx forwards the request line as sent. nginx *matches* on the normalised path, so `/api/auth/../../actors/…` is the edge's 404, and `/actors/../api/auth/jwks` or `//api/auth/jwks` reach the actor host raw and get its 400 (§8) |
  | 128 KiB body cap on the edge, counted, not declared | `client_max_body_size 128k;` in `infra/nginx-proxy/vhost.d/edge.conf` — chunked bodies included (§8) |
  | Files host: Host header and path untouched, so SigV4 verifies | nginx-proxy sends `Host: $host` (bare on 443) and no URI rewrite; a presigned PUT verified through it (§8) |
  | (Caddy had **no** files-host cap — a known gap) | `client_max_body_size 21m;` + `proxy_request_buffering off` in `files.conf`: the 20 MiB upload limit plus headroom, streamed, not spooled. Nginx's 1 MB default would have refused every image over a megabyte |
  | Proxy secret not logged at the edge | nginx-proxy's `vhost` log format records no request headers |
  | A caller cannot choose the client address the actor host trusts | nginx-proxy *appends* its peer to `X-Forwarded-For` and the actor host reads only the right-most entry (or the proxy-secret-verified `x-cellar-client-ip`); measured with a spoofed `X-Real-IP`, `X-Forwarded-For` and `x-cellar-client-ip` (§8, and `services/actors/src/auth/client-ip.ts`) |
  | Internal file calls do not depend on router hairpin NAT | The sidecars' `files` binding and the actor host's own S3 calls go to `minio:9000` in-network (`infra/docker-compose.prod.yml`, header note 5) — the Caddy network alias is gone, not replaced |
  | Grafana LAN-only | `${LAN_BIND_ADDR}:3010:3000` on `otel-lgtm` itself — the kernel-level bind that was always the lock that held. Caddy's `remote_ip private_ranges` second lock is gone (§8 had already recorded that it could pass traffic through Docker's userland proxy) |
  | HTTP/3 off | nginx-proxy does not enable it (no `ENABLE_HTTP3`) |

  `scripts/deploy/check-prod-config.mjs` refuses a production render in which
  any row of that table that lives in the compose file changes: a service other
  than api/actors/minio carrying `VIRTUAL_HOST`, either `VIRTUAL_PATH` dropped or
  widened, `VIRTUAL_DEST` set, the files host equal to the edge host, or any port
  published on every interface. stack-ci self-tests each refusal, and runs both
  vhost files through `nginx -t` in the nginx-proxy image Loki runs
  (`scripts/deploy/prod-config-selftest.sh`).
- **Installing the edge config, safely for everyone else on the proxy.**
  `scripts/deploy/edge.sh install` (the deploy's step before `up`) copies the
  two vhost files to `<vhost.d>/<hostname>`, but first: refuses if
  `NGINX_PROXY_VHOST_DIR` is not the directory the proxy actually mounts;
  refuses to overwrite a file at that path that lacks our ownership marker (it
  belongs to another service); runs each file through the proxy's own
  `nginx -t` on its own, before nginx-proxy could include it; then the full
  `nginx -t`, restoring the previous files if that fails; and only then
  `nginx -s reload`, and only if something changed. A broken file in `vhost.d`
  would not be a cellar outage but every service on Loki — the next docker-gen
  reload would fail and a restart of the proxy would not come back.
- **Attaching to the proxy.** `scripts/deploy/edge.sh attach` connects exactly
  the services carrying `VIRTUAL_HOST` to nginx-proxy's network, disconnects any
  other container of this project it finds there, and `verify` then proves the
  routing on loopback, addressed as the public names (`/healthz` and
  `/api/auth/jwks` answer; `/`, `/actors/*`, `/dapr/*` and a dot-segment walk
  are 404; the two non-canonical spellings that do reach the actor host are its
  400; the files host's `/minio/health/live` answers). **A recreate drops the
  attachment** (measured), so `attach` follows every `up`; until it runs, a
  recreated service answers 502 at the edge.
- **Certificates.** acme-companion issues and renews them for every container
  with `LETSENCRYPT_HOST`, with the account the host already uses. Nothing of
  ours stores certificates; they live in the edge stack's `certs` volume.
- **The identity triple.** `infra/docker-compose.prod.yml` derives
  `BETTER_AUTH_URL`, `AUTH_ISSUER` and `AUTH_AUDIENCE` from the single
  `PUBLIC_APP_ORIGIN`, and both apps refuse to start if they disagree.
- **Port exposure.** Nothing of this stack publishes on `0.0.0.0` — the guard
  above refuses it. Postgres, MinIO's S3 port and the API are on loopback;
  Grafana is on the LAN address; the actor host publishes nothing.
- **Missing configuration.** Every required variable uses compose's `:?`, so an
  incomplete `infra/.env.prod` fails the `up` naming the variable —
  `DISCORD_WEBHOOK_URL` included, since a blank one used to fall back to the
  base file's `discord.invalid` placeholder.
- **Published development secrets.** Before anything starts, the deploy refuses
  any secret-named variable that equals a default `infra/docker-compose.yml`
  publishes for the development lane (`cellar-dev-dapr-api-token`,
  `cellar-dev-app-api-token`, `cellar-dev-secret`, Postgres's `cellar`, the
  `discord.invalid` placeholder, …). The list is derived from the base file, not
  written down (`scripts/deploy/check-prod-config.mjs`); stack-ci self-tests it
  (`scripts/deploy/prod-config-selftest.sh`). Run it by hand from §4.1. The
  apps hold the same line where the values are spent, for a deployment that
  skipped the script: `services/api` will not boot with an empty or published
  `DAPR_API_TOKEN`, the actor host with a missing, short or published
  `AUTH_PROXY_SECRET`, and its file signer refuses a missing or published
  `MINIO_ROOT_PASSWORD` instead of falling back to `cellar-dev-secret`.
- **Schema migrations.** Every deploy applies the new image's migrations
  before the new images start, and a failed migration stops the deploy (§4.1).
- **Health.** `up -d --wait` waits for every healthcheck — the actor host's
  included — and the deploy then requires the edge routing above, `services/api`'s
  `/healthz` (asked inside the container), and one real actor turn through the
  actors sidecar (§4.1).
- **Restarts.** Everything but the one-shot bucket bootstrap is
  `restart: unless-stopped`, with healthchecks. A restart keeps the `bridge`
  attachment (measured); only a recreate loses it.
- **The bucket.** `minio-init` (the base file's, reused here) creates it, keeps
  it private and sets its lifecycle on every `up`: objects under `uploads/`
  expire after one day. Uploads are PUT there and copied out by `verify`, so
  anything left is a late PUT or an upload never verified. The actor host
  waits for `minio-init` to finish successfully. Check it with
  `mc ilm rule ls <alias>/<bucket>`.
- **Config-only changes.** The deploy workflow hashes `infra/grafana` and
  `infra/dapr` into a label on the services that mount them, so a commit that
  only changes an alert rule or a Dapr component recreates exactly that service
  (§9.4). The nginx-proxy vhost files are mounted into nothing of ours, so they
  get no label: `edge.sh install` copies them and reloads the proxy explicitly,
  and `infra/nginx-proxy/**` is in the workflow's `paths`.
- **Observability data.** Loki, Prometheus, Tempo and Grafana's own state live
  on the `otel-lgtm-data` volume with bounded retention (§9.3), so recreating
  `otel-lgtm` keeps its history.

---

## 4. First deploy

There is no edge container to start and no staging dance of our own: the first
deploy is the workflow (or the same steps by hand), with certificates from
Let's Encrypt **staging** first, so a wrong DNS record costs nothing against the
production rate limit the host's other names share.

```bash
cd /path/to/cellar-assistant
C="docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml --env-file infra/.env.prod"
export COMPOSE_ENV_FILE=infra/.env.prod NGINX_PROXY_VHOST_DIR='<vhost.d path>'

# 1 — rehearse against Let's Encrypt staging: ACME_STAGING=true in infra/.env.prod.
#     It sets LETSENCRYPT_TEST on this stack's three containers only; every other
#     certificate on the host is untouched.
scripts/deploy/edge.sh install           # vhost files in, tested, proxy reloaded
$C up -d --wait                          # (after §4.1's migrate step on a real deploy)
scripts/deploy/edge.sh attach            # onto nginx-proxy's network
EDGE_VERIFY_INSECURE=1 scripts/deploy/edge.sh verify

docker logs -f nginx-proxy-acme          # the companion's log, not ours
```

Watch the companion's log for both hostnames being issued (it runs with
`DEBUG=true` on Loki, so it is verbose). Staging certificates land under
`_test_<hostname>` in the `certs` volume and are untrusted by browsers — that is
the tell. What the failures mean:

| Symptom | Cause |
|---|---|
| challenge timeout / `Connection refused` in the companion log | The name does not reach Loki's port 80: DNS (§2.1) or the forward (§2.2) |
| `urn:ietf:params:acme:error:dns` | The name does not resolve |
| `edge.sh verify` gets 502/503 for one host | That service is not attached (run `attach`), or not healthy |
| `edge.sh verify` gets 000 | nginx-proxy is not answering on `EDGE_VERIFY_ADDR:443` at all |

```bash
# 2 — real certificates: ACME_STAGING=false (or delete the line), then
$C up -d api actors minio                # LETSENCRYPT_TEST changed → recreated
scripts/deploy/edge.sh attach            # a recreate drops the attachment
scripts/deploy/edge.sh verify            # strict TLS this time, once issued
```

The companion issues production certificates because the directory changed,
and repoints `<hostname>.crt` at them; the staging ones stay in the volume,
unused. (Reasoned from acme-companion's `letsencrypt_service`, which keys the
staging path off the directory URL; not yet run on Loki.)

**After any manual `up` that recreates `api`, `actors` or `minio`, run
`scripts/deploy/edge.sh attach`.** The workflow does it for you; by hand it is
the one step that is easy to forget, and the edge answers 502 until it runs.

### 4.1 Every deploy after the first — schema first, then code

The first deploy's database comes out of the cutover (`scripts/cutover/`), whose
`migrate` phase seeds the migration ledger (`cellar_meta.schema_migrations`).
From then on, **every schema change reaches production through the deploy
workflow, before the image that needs it starts**. `deploy-loki.yaml` does this
in order, and any failing step stops the deploy with the previous images still
running:

1. `pull`, then `build postgres` (so an `infra/postgres` change is applied, not
   just triggered).
2. **Refuse published development secrets**, and an edge shape that widened
   (§3).
3. **Install the edge's nginx config** into nginx-proxy (`edge.sh install`,
   §3) — before anything is recreated, because nginx-proxy only includes a
   `vhost.d/<host>` file that exists when it regenerates.
4. **Migrate.** `up -d --wait postgres`, then a one-shot container of the *new*
   actors image runs `db:migrate` (`packages/db/src/migrate/cli.ts`) against
   the DATABASE_URL the overlay gives the actor host. The image carries
   `packages/db`, so the migrations applied are exactly the ones the new code
   was built with, and the credential never leaves the container. The CLI
   takes an advisory lock, runs each migration in its own transaction, refuses
   a checksum mismatch or a half-present adoption, and re-reads the ledger
   afterwards; any of those is a non-zero exit.
5. `up -d --remove-orphans --wait` — every healthcheck, the actor host's
   included.
6. **Attach and verify the edge** (`edge.sh attach`, then `edge.sh verify` with
   `EDGE_VERIFY_INSECURE=1`: routing, not the certificate).
7. `services/api`'s `/healthz` from inside the container, then one `PingActor`
   turn through actors-dapr (sidecar → placement → app channel → the new actor
   host).

The same, by hand (a manual deploy, or re-running a step the workflow failed):

```bash
C="docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml --env-file infra/.env.prod"
export COMPOSE_ENV_FILE=infra/.env.prod NGINX_PROXY_VHOST_DIR='<vhost.d path>'

# What is pending? Read-only; exit 3 means "pending", 0 "up to date".
$C run --rm --no-deps -T actors \
  sh -c 'MIGRATE_DATABASE_URL="$DATABASE_URL" exec node /workspace/packages/db/src/migrate/cli.ts --status'

# Apply — ACTORS_IMAGE in infra/.env.prod must already name the image you are
# about to deploy, since its migrations are the ones that run.
scripts/deploy/edge.sh install
$C up -d --wait postgres
$C run --rm --no-deps -T actors \
  sh -c 'MIGRATE_DATABASE_URL="$DATABASE_URL" exec node /workspace/packages/db/src/migrate/cli.ts'
$C up -d --remove-orphans --wait
scripts/deploy/edge.sh attach
scripts/deploy/edge.sh verify
```

**A migration runs while the previous actor host is still serving.** Write
migrations the running code tolerates: add a column or table in one release,
start using it in the same or a later one, and drop what the old code reads
only in a release after that. The same rule is what makes §6's image rollback
safe — rolling the image back does **not** roll the schema back, and the older
image's `db:migrate` only warns about ledger rows it does not know.

**The actor host refuses to boot on a database `db:migrate` has not reached** (since `9b5de517`,
`services/actors/src/lib/boot-preflight.ts`). Before it serves anything it compares
`cellar_meta.schema_migrations` with the migrations its image ships, and if any is missing — or
was recorded from a different `migration.sql` — it exits and prints each one (`missing: <name>`,
`changed: <name>`) with the command to run. A migration the database has and the image lacks is
allowed: that is §6's rollback. So skipping step 3 above no longer boots and fails at query time
hours later; it fails the `up --wait` in step 4, naming the migration. Under `NODE_ENV=production`
(the image sets it) the same preflight also refuses `DAPR_API_TOKEN`, `APP_API_TOKEN` or
`MINIO_ROOT_PASSWORD` holding the development default `infra/docker-compose.yml` publishes — by
sha256, naming the variable and never the value — so a deploy that skipped
`check-prod-config.mjs` still cannot run on them.

### 4.2 The re-embed — once, right after the cutover deploy

**Every migrated vector has to be re-embedded, and nothing does it on its own.** Legacy production
embedded with `gemini-embedding-2-preview`; this stack embeds with `gemini-embedding-2` (§2.7), a
different space. Every `item_vectors` / `recipe_vectors` row records the embedding that made it
in `embedding_model` (`<provider>:<model>@<dims>/RETRIEVAL_DOCUMENT`, migration
`20260928162504_vector_embedding_identity`), and every migrated row has it **NULL**, deliberately.
`VectorReembedJobActor` walks `item_vectors` then `recipe_vectors` in `id` order, picks every row
whose `embedding_model` is not the configured one, and has its owner re-embed it —
`ItemActor.regenerateVector` (the item's text plus its front label, back label and newest image:
at most three, inside the model's six) or `RecipeActor.regenerateVector` (text only). Until it
finishes, semantic search compares new query vectors against old document vectors, so run it as
soon as the deploy is healthy, before step (6) flips Vercel.

**Count first**, on the production database, so the cost and the progress have a denominator:

```bash
C="docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml --env-file infra/.env.prod"
$C exec -T postgres psql -U cellar -d cellar -c "
  select (select count(*) from item_vectors   where embedding_model is null) as item_vectors,
         (select count(*) from recipe_vectors where embedding_model is null) as recipe_vectors,
         (select count(*) from place_vectors)    as place_vectors,
         (select count(*) from category_vectors) as category_vectors;"
```

**Cost.** One embedding call per vector, charged to the `embedding` seam at `gemini-embedding-2`'s
paid rate: **$0.20 per million text tokens and $0.00012 per image**
(ai.google.dev/gemini-api/docs/pricing, "Gemini Embedding 2", read 2026-09-28 — the `MODEL_RATES`
row in `services/actors/src/actors/budget-actor.ts` and `EMBEDDING_IMAGE_TEXT_TOKENS` in
`services/actors/src/lib/ai/budget.ts` cite the same page). A generous 1,000 text tokens per
vector bounds a call at **$0.0002**, plus **$0.00036** for an item with all three images. For
scale, the shared `cellar-stack` database (2026-09-28, read-only count) holds **90 `item_vectors`
and 151 `recipe_vectors`**, with at most **1** item image an embed would send: at most
241 × $0.0002 + 1 × $0.00012 ≈ **$0.05**, 241 of the seam's 200,000 monthly requests.
Production's own count from the query above is the number that matters. **The re-embed spends the
same monthly `embedding` budget live search does** (`MODEL_SPENDERS.embedding`: 200 cents, 200,000
requests, unless `setBudget` or `AI_BUDGET_MAX_REQUESTS` raised them). At the image-heavy worst
case, $2 covers roughly 3,500 items, so if the count is anywhere near that, raise the budget with
`setBudget` on `ai_model/embedding` first (`budget-actor.ts`, "What to do at 3am when one binds"),
or live search is refused for the rest of the month once the job has spent it.

**Run it**, canary first — ten vectors, then the rest:

```bash
$C exec actors bun scripts/operator.ts reembed --max-vectors 10
$C exec actors bun scripts/operator.ts reembed
```

`scripts/operator.ts reembed` (`6f0a8e86`) starts `VectorReembedJobActor` under a fresh job id
with a `system` ctx — the job is admin/system-only, and refuses to start at all when no embedding
model is configured — prints that id first, then polls the job every `--poll-seconds` (5) and
prints a line whenever its progress changes. Flags: `--batch-size N` (default 10, at most 50), `--max-vectors N`,
`--tables item_vectors,recipe_vectors`, `--poll-seconds N`, `--job-id <uuid>`.

Its exit status (the full table is in `operator.ts`'s header):

| exit | the job | what to do |
|------|---------|------------|
| **0** | `completed`: walked every row, no budget stop, no failed rows | run the stale-count query below — done means it reads **zero**, not the exit status |
| **3** | `completed`, but the embedding budget stopped it; stale vectors left | raise the budget (`setBudget` on `ai_model/embedding`, see **Cost**) and run `reembed` again without `--job-id` |
| **4** | `completed` its walk, but rows **failed** to re-embed and are still stale | check the failures (`row_failed` lines, below), fix their cause, and run `reembed` again without `--job-id` |
| 1 | `failed` or `cancelled`, a refused call, or the watch gave up after three failed polls | read the job's `last_error` (query below); a lost watch is resumed with `--job-id` |
| 2 | usage | fix the flags |

A job that both stopped on the budget and had failed rows exits 3: the rerun after raising the
budget retries the failed rows too.

**Watching it.** The script's own lines, or from anywhere:

```bash
$C exec -T postgres psql -U cellar -d cellar -c "
  select id, status, processed, attempts, last_error,
         cursor->'value' as progress   -- table, lastId, model, reembedded, skipped, failed, stopped
  from jobs where kind = 'vector-reembed' order by created_at desc limit 3;"
```

and in Grafana, `{service_name="actors"} | event_name=~"vector_reembed.+"` — `row_failed`
(WARN, one per row that failed to re-embed, with its `vector.id`) and `stopped` (WARN, the budget
refused the embed).

**When it is done**, both counts must be zero:

```bash
$C exec -T postgres psql -U cellar -d cellar -c "
  select (select count(*) from item_vectors
            where embedding_model is distinct from 'vertex-ai:gemini-embedding-2@768/RETRIEVAL_DOCUMENT') as items_stale,
         (select count(*) from recipe_vectors
            where embedding_model is distinct from 'vertex-ai:gemini-embedding-2@768/RETRIEVAL_DOCUMENT') as recipes_stale;"
```

**Exit 0 does not by itself mean every vector.** A job the budget stopped ends `completed`, with
`cursor->'value'->>'stopped'` holding the refusal (exit 3), and a row that failed for any other
reason is counted in `failed` and walked past (exit 4) — the script reads both off the cursor now,
but a vector a replica with another model wrote after the walk passed it is invisible to either.
Finish on the query above reading zero, not on the exit status.

**If it stops or fails midway, re-run it — that is the resume.** A job is a chain of batches, each
committing its cursor, so a killed actor host resumes the *same* job from its last batch on
restart, embedding nothing twice. A job that ended — `completed` after a budget stop or with
failed rows, `failed` after its batch dead-lettered, or `cancelled` — is finished; a **new** run
(plain `reembed`, which takes a fresh id) starts at `id > 0` but selects only rows still not on the
configured model, so it visits exactly what the last one did not re-embed and nothing it did.
`--job-id <id>` does not restart a finished job: `start` on an existing id returns it unchanged.
Use it only to go back to *watching* a running job after the script was interrupted or lost the
sidecar — the job keeps running without the script. Before re-running after `row_failed` lines,
read one: a row that fails the same way twice is a bug in its item, not a reason to loop.

**What it does not do**, both known gaps:

- **It creates no vector for an item or recipe that has none** — it only walks rows that exist in
  `item_vectors` / `recipe_vectors`. On the shared `cellar-stack` database (2026-09-28) that is
  **0 of 90 items and 0 of 151 recipes**; on production, count it before relying on search
  coverage (items without a row get one the next time they change, through
  `regenerateVector`).
- **It does not touch `place_vectors` or `category_vectors`**, which have no `embedding_model`
  column. Both are empty on the shared database; if the count above says otherwise on production,
  they stay in the old space until re-seeded (`CategoryVectorsActor`) or refreshed.

### 4.3 The operator commands

`services/actors/scripts/operator.ts` is how the on-call operator reaches the privileged outbox
and job methods — through the actor host's own Dapr sidecar, with a `system` ctx, inside the
actors container (neither compose file publishes `actors-dapr`'s port). It prints the method's
answer; exit 0 done, 1 the call was refused or failed, 2 usage — and for `reembed` also 3 (budget
stop) and 4 (rows failed), §4.2.

```bash
C="docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml --env-file infra/.env.prod"

$C exec actors bun scripts/operator.ts drain    # OutboxActor.drain: one drain turn now
$C exec actors bun scripts/operator.ts report   # MaintenanceActor.reportDeadLetters: the dead-letter report now
# MaintenanceActor.acknowledgeDeadLetters: record a triage decision so the dead-letter
# alarm stops paging for those rows (only rows already `dead`; --by is stored)
$C exec actors bun scripts/operator.ts ack --by <you> --note "<why>" \
  [--ids <id,…> | --target-actor <Type> --method <m>] [--before <ISO-8601>]
$C exec actors bun scripts/operator.ts reembed [--max-vectors N] …   # §4.2
```

`--env-file infra/.env.prod` is not optional even for `exec`: without it the production overlay
does not render (its `:?` variables), and compose refuses before reaching the container. On the
shared development lane the same commands are
`docker exec cellar-stack-actors-1 bun scripts/operator.ts <command>`.

---

## 5. Verifying the deploy

Run these from **off the LAN** — a phone on cellular, or any box elsewhere.
On-LAN results can be right for the wrong reason.

```bash
# TLS is real, not staging, on BOTH names. Issuer must be a Let's Encrypt
# intermediate, not "(STAGING) ...".
for h in loki.example.com files.example.com; do
  echo | openssl s_client -connect $h:443 -servername $h 2>/dev/null \
    | openssl x509 -noout -issuer -dates
done

# The API answers. This is E3's acceptance line.
curl -s https://loki.example.com/healthz                       # -> ok
curl -s -X POST https://loki.example.com/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"{ __typename }"}'                              # -> {"data":{"__typename":"Query"}}

# The key set is public and is EdDSA.
curl -s https://loki.example.com/api/auth/jwks | head -c 200; echo

# Nothing else on the edge is reachable. All four must be 404 — nginx's own
# page, not a JSON body from the actor host.
curl -s -o /dev/null -w '%{http_code}\n' https://loki.example.com/
curl -s -o /dev/null -w '%{http_code}\n' https://loki.example.com/actors/PingActor/1/method/ping
curl -s -o /dev/null -w '%{http_code}\n' https://loki.example.com/dapr/config
curl -s -o /dev/null -w '%{http_code}\n' --path-as-is \
  'https://loki.example.com/api/auth/../../actors/PingActor/1/method/ping'

# These two DO reach the actor host (nginx matches the normalised path) and
# must be its 400 {"code":"NON_CANONICAL_PATH"}, never a 200.
curl -s --path-as-is 'https://loki.example.com/actors/../api/auth/jwks'; echo
curl -s --path-as-is 'https://loki.example.com//api/auth/jwks'; echo

# The body caps: 413 on the edge for 200 KiB, chunked or not.
head -c 204800 /dev/zero | curl -s -o /dev/null -w '%{http_code}\n' --http1.1 \
  -H 'Transfer-Encoding: chunked' --data-binary @- https://loki.example.com/graphql

# Grafana is NOT on the WAN. Must hang or refuse, never answer.
curl -s -m 5 -o /dev/null -w '%{http_code}\n' http://loki.example.com:3010/

# Grafana IS on the LAN (run this from another machine on the LAN;
# <loki-lan-ip> is `LAN_BIND_ADDR` from infra/.env.prod).
curl -s -o /dev/null -w '%{http_code}\n' http://<loki-lan-ip>:3010/login   # -> 200

# ...and it wants a login. Both must be 401, not 200 (§9.1).
curl -s -o /dev/null -w '%{http_code}\n' http://<loki-lan-ip>:3010/api/datasources
curl -s -o /dev/null -w '%{http_code}\n' http://<loki-lan-ip>:3010/api/admin/settings
```

A signed file URL is the one check that cannot be written blind, because the key
is minted per object. Sign one and follow it:

```bash
# On Loki. Prints a URL whose authority must be exactly https://files.example.com
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml \
  --env-file infra/.env.prod exec actors node -e '
    import("./src/lib/s3-presign.ts").then(async m => {
      const c = m.filesS3Config();
      console.log("signed origin:", m.signedOrigin(c));
      console.log(await m.presignedPutUrl(c, "deploy-check.txt", 300));
    })'
```

Then, from off the LAN, `curl -X PUT --data hello "<that url>"` must return 200 —
and a 5 MB body must too (`head -c 5000000 /dev/urandom | curl -X PUT -T - "<url>"`),
which is what proves `files.conf` is installed: without it nginx refuses
anything over 1 MB with a 413.
A `SignatureDoesNotMatch` here means the signed authority and the addressed
authority differ — check `FILES_S3_ENDPOINT` is a bare hostname and that no
`FILES_S3_PORT` is set.

Finally, the plan's remaining E3 acceptance lines: a Dapr trace for one actor
call visible in Grafana (Explore → Tempo), and a merge to `main` redeploying
without manual steps (E3b). A merge to `main` also redeploys production **Nhost
Cloud** through the `nhost` GitHub app — `e4-decisions.md` decision 15 — so that
merge is never a Loki-only event.

---

## 6. Rolling back and stopping

```bash
# Roll the apps back to a previous image without touching data (or the schema —
# see §4.1: migrations are forward-only, so the older image must tolerate them):
#   edit API_IMAGE / ACTORS_IMAGE in infra/.env.prod, then
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml \
  --env-file infra/.env.prod up -d api actors
COMPOSE_ENV_FILE=infra/.env.prod scripts/deploy/edge.sh attach   # the recreate dropped it

# Stop everything, keeping volumes (database, objects, telemetry):
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml \
  --env-file infra/.env.prod down
```

`down` leaves nginx-proxy running and our two `vhost.d` files in place; with
no container carrying the hostnames, docker-gen drops their `server` blocks and
both names answer nginx-proxy's default 503. To take the edge config away for
good, delete `<vhost.d>/<PUBLIC_EDGE_HOST>` and `<vhost.d>/<PUBLIC_FILES_HOST>`
**after** `down` (a file the generated config still includes cannot be removed
without breaking the proxy's next reload), then `docker exec nginx-proxy
nginx -t && docker exec nginx-proxy nginx -s reload`. The certificates are the
edge stack's, in its `certs` volume, and outlive all of this.

Never `down -v` on this stack: it destroys the Postgres data, the MinIO
objects, the Dapr scheduler's reminder store **and** the observability volume (every log, metric and trace, Grafana's alert state,
silences and annotations, and the admin password as last rotated).

The E4 rollback is a different thing — redeploying the pre-cutover frontend
against Nhost. The `epic-burnell-*` Nhost containers exist for that and must be
left alone for the 30-day window.

---

## 7. Known gaps this deploy will hit

The first three are closed — the two file-upload blockers by E3c on
2026-09-10, the third by E3b — and kept with their resolutions, because each is
a thing a failure will send you looking for. The rest came with the move behind
Loki's shared nginx-proxy (2026-10-04) and are open: each is a decision or an
accepted cost, not a bug waiting for a fix.

1. ~~**The app's CSP blocks the file host.**~~ **Fixed.** `next.config.mjs` now
   builds `connect-src` from the environment and appends the origin derived from
   `PUBLIC_FILES_HOST` (or `FILES_S3_PUBLIC_URL`), so a browser PUT to
   `https://files.example.com` is allowed and nothing else was widened. The
   variable must be set **on Vercel at build time** as well as in
   `infra/.env.prod` — see §2.5. `src/lib/dev-checks/csp.test.ts` fails if the
   entry is ever dropped, and also fails if someone re-opens the hole by
   widening the directive to `*` or a bare `https:`.

   This one failed *asymmetrically*, which is worth remembering: `img-src`
   allows `https:`, so existing images kept rendering while every new upload was
   blocked with no network request at all.
2. ~~**MinIO's CORS behaviour for the cross-origin PUT is unconfirmed.**~~
   **Confirmed working; no bucket CORS configuration is needed.** Probed against
   the running MinIO (`minio/minio:RELEASE.2025-02-28T09-55-16Z`) with a real
   preflight:

   ```bash
   curl -i -X OPTIONS "http://localhost:9100/cellar-files/item-image/probe.jpg" \
     -H "Origin: https://cellar.example.com" \
     -H "Access-Control-Request-Method: PUT" \
     -H "Access-Control-Request-Headers: content-type"
   # 204, Access-Control-Allow-Origin: https://cellar.example.com
   #      Access-Control-Allow-Methods: PUT
   #      Access-Control-Allow-Headers: content-type
   ```

   MinIO answers the preflight itself and reflects the requesting origin under
   the default `MINIO_API_CORS_ALLOW_ORIGIN=*`, so nothing needs adding to the
   `minio` service. The preflight is genuinely required — an image
   `Content-Type` is not a CORS-safelisted value — and `putToUploadTarget` reads
   only `response.ok`, so no `Access-Control-Expose-Headers` is needed either.
   The same preflight through the pinned nginx-proxy image with `files.conf`
   installed answered `204` with the same two headers (2026-10-04, §8), so the
   edge hop holds too. If an upload fails at the edge on Loki, re-run the probe
   against `https://files.example.com` before suspecting anything else.
3. ~~**Grafana provisioning is a shadowing mount.**~~ **Filled.**
   `infra/grafana/provisioning` is bind-mounted over the path where
   `grafana/otel-lgtm` keeps its *own* datasource and dashboard providers, so
   that directory must carry copies of them or Grafana comes up with no data
   sources. It does: `datasources/grafana-datasources.yaml` carries the four
   originals (Prometheus, Tempo, Loki, Pyroscope) and
   `dashboards/grafana-dashboards.yaml` the original dashboard providers, since
   E3b (`dfce815b`). The compose file still records the command that dumps the
   originals, for when the image's own set changes.

4. **The actor host, the API and MinIO share Loki's default `bridge` network
   with every other container on it.** That is how nginx-proxy reaches them
   (§1), and it widens who can open a TCP connection to `actors:3002`,
   `api:3001` and `minio:9000` from "this compose project" to "any container on
   Loki's `bridge`", some of which may be internet-facing. What
   they can do there is what the internet can do plus the paths the edge
   hides: the actor host still refuses everything but `/api/auth/*` and
   `/healthz` without `APP_API_TOKEN` (deny-by-default, every spelling;
   `actor-host-bypass.test.ts`), and MinIO still needs its credentials. A
   compromised neighbour therefore gets a shorter path to the same doors, not
   an open one. The alternative that avoids it — a user-defined network that
   nginx-proxy also joins — is a change to the edge stack, which keeps
   nginx-proxy on `bridge` for its other services; raise it there if this
   matters.
   Postgres, the sidecars and the Dapr control plane stay off `bridge`
   (`edge.sh attach` disconnects any that appear).
5. **`vhost.d` is shared and owned by another repository.** Make sure it is
   **not world-writable**: anyone who can write there can put nginx config into
   a proxy that serves every public name on the host. Give the deploy user (or
   a group it belongs to) write access, and nobody else. Our two files are
   named after our hostnames and carry an ownership marker `edge.sh` checks
   before writing, but
   nothing in the edge stack's repository knows they exist. Tell it, so a
   rebuild of the edge stack does not wipe them silently (the edge then serves
   nginx's 1 MB default body cap, and uploads over a megabyte 413).
6. **The edge answers 502 between a recreate and `edge.sh attach`.** Every
   deploy that changes `api`, `actors` or `minio` has that window (seconds,
   bounded by `up --wait`); a manual `up` that recreates them has it until
   someone runs `attach`. Measured: a recreated container drops a
   `docker network connect` attachment; a restart keeps it.
7. **Port 3001 on Loki is already taken by another service.** `API_PORT` must
   be set to something free in `infra/.env.prod` or `up` fails on the loopback
   publish (§2.4). The deploy's `/healthz` check no longer touches the host
   port at all, because its old default would have asked that other service.
8. **The edge's floating dependency is someone else's pin.** nginx-proxy and
   acme-companion are digest-pinned rolling builds in the edge stack's
   repository; a bump there can change the template this stack's routing
   depends on (`VIRTUAL_PATH` handling, the default-404 location). stack-ci
   runs the vhost files through `nginx -t` in a digest-pinned nginx-proxy image
   (`NGINX_PROXY_IMAGE` in `prod-config-selftest.sh`); keep that pin in step
   with the edge stack's, and re-run `edge.sh verify` after any edge-stack
   change.

---

## 8. What is unverified from here

Stated plainly, because the difference matters when something fails at 2am.

**Verified by running it:**

- **Loki's edge, read-only (2026-10-04, `docker inspect` / `ss` over ssh, nothing
  changed)** — what this stack's routing assumes, each checked: `nginx-proxy`
  is `network_mode: bridge`, publishing `0.0.0.0:80` and `:443`, with `vhost.d`
  bind-mounted from a host directory (`<vhost.d path>`); no `conf.d` mount;
  `DEFAULT_ROOT`, `TRUST_DOWNSTREAM_PROXY`, `ENABLE_HTTP3` and `ENABLE_IPV6`
  at their defaults. `nginx-proxy-acme` (acme-companion) has no `ACME_CA_URI`
  (so Let's Encrypt production) and `ACME_HTTP_CHALLENGE_LOCATION` at its
  default (off: it writes nothing into `vhost.d`). Compose and Docker are new
  enough for everything below.
- **The routing, through the nginx-proxy image pinned in
  `prod-config-selftest.sh`**, in a throwaway
  compose project on a Mac (`lokiedge-proxy`, nginx-proxy on the default
  `bridge` as on Loki, self-signed certificates), with `edge.sh install`,
  `attach` and `verify` doing the work and this change's tree (parent
  `fecbbd6e`) providing the `VIRTUAL_*` values from the rendered prod config.
  The `actors` upstream was a stub that ran the real `nonCanonicalPath`
  (`host-app.ts`) and `resolveClientIp` (`client-ip.ts`) from the worktree;
  `minio` was the real `minio/minio:RELEASE.2025-02-28T09-55-16Z`. Results:
  - `/graphql`, `/healthz` → api; `/api/auth/jwks` → actors; `/`,
    `/actors/PingActor/x/method/ping`, `/dapr/config`, `/GRAPHQL`, `/graphql/`,
    `/API/AUTH/jwks`, `/api/auth/../../actors/…` and its `%2e%2e` spelling →
    nginx's 404. `/actors/../api/auth/jwks`, `//api/auth/jwks` and
    `/api//auth/jwks` reached the actor host **raw** and got its 400
    `NON_CANONICAL_PATH`. `/api/auth` (no slash) → nginx's 301 to `/api/auth/`.
  - A direct caller sending `X-Real-IP`, `X-Forwarded-For` and
    `x-cellar-client-ip` all `6.6.6.6` (and `x-cellar-verified-proxy: 1`), with
    no or a wrong proxy secret: the actor host received `X-Forwarded-For:
    6.6.6.6, 172.17.0.1` and resolved the client to `172.17.0.1`, the proxy's
    peer, `verified: false`. With the right secret, the claimed address was
    used and `verified: true`.
  - 200 KiB to the edge → 413, declared, HTTP/1.1 chunked, and HTTP/2 with no
    length; 100 KiB chunked → passed.
  - A presigned PUT of 5 MiB signed by the app's own `presignedPutUrl` for
    `https://files.test` → 200 through the proxy, and the presigned GET
    returned the same sha256; the same signature on a different key →
    `SignatureDoesNotMatch` (MinIO really verifies); 22 MiB → 413 at the edge;
    the CORS preflight → 204 with the reflected origin. All of it repeated
    with the object store swapped for `pgsty/silo:RELEASE.2026-09-16T00-00-00Z`
    (the MinIO replacement): same results, and the preflight's
    `Access-Control-*` and `Vary` headers through the proxy were byte-identical
    to silo's own answer without it — nginx passes `OPTIONS` through and adds
    only `Server` and HSTS.
  - `edge.sh install`: unchanged files are left alone; a file at the hostname
    without our marker is refused; a snippet with a bad directive fails the
    isolated `nginx -t` and nothing is installed; a `NGINX_PROXY_VHOST_DIR` that
    is not the proxy's mount is refused; a changed file is reloaded (and the
    reload measurably lands about a second after the signal, hence a 2 s wait).
  - A compose recreate drops the `bridge` attachment (edge → 502), `attach`
    restores it (→ 200); `up -d` with no change and a restart keep it. The
    first version of `attach` disconnected the proxy itself when the proxy
    shared the compose project; fixed, and only possible in a test lane.
  - Compose (v5.5.1, Docker 29.8.1) cannot declare `bridge` as an external
    network for a service: the daemon refuses the alias Compose always adds.
    Loki's older pair was not tried (no containers are created there).
- The merged compose file parses with **no** `caddy` service, and the port
  bindings read back out of `docker compose config` are all loopback or
  `LAN_BIND_ADDR`; nothing on `0.0.0.0`. The guard now enforces that, and
  stack-ci proves the guard refuses nine ways the edge could widen. (The
  earlier version of this check caught Compose *appending* port lists, which
  is why every overlay port list is `!override`.)
- The render also exposed, and this change fixed, `FILES_S3_PORT` leaking from
  the base file (`${MINIO_PORT:-9100}`) into production, which would have
  signed every file URL for `https://files.example.com:9100` (reported by the
  LokiTestLane agent, 2026-10-04).
- `!reset` removes the base's workspace bind mount from `api` and `actors`.
- The identity assertions, against every divergence they are meant to catch.
- Grafana on the prod config (§9, 2026-09-27): login required, the admin
  password rotation, the data volume across recreates, retention as read back
  from each server, plugin refresh on a version change, the healthcheck (which
  now fails when Loki is dead — the image's own reported that state healthy),
  config fingerprints forcing exactly one recreate, and alert delivery to a
  webhook for four rules (two pages, two tickets), each with a negative control.

**Not verified, and cannot be from a laptop:**

- **Anything on Loki itself.** No container was created there. So: ACME
  issuance for the two new names (staging first, §4); `docker network connect
  bridge` against Loki's Compose and Docker (reasoned to behave as
  measured on the Mac — it is a plain daemon call — but not run); the
  runner's write access to `vhost.d`; and the whole public path, DNS and
  any DNS proxy included. §5 is the first test of each.
- **The switch from staging to production certificates.** Reasoned from
  acme-companion's source (staging keys off the directory URL and lands in
  `_test_<host>`); not run.
- **The edge's 60 s idle keep-alive against the apps' 5 min.** nginx's default
  upstream `keepalive_timeout` is documented, not measured here; the apps'
  timeout is above any value nginx-proxy's template could set without a
  vhost change.
- **The container images.** Built by E3b; this file only consumes them.
- **Vertex AI itself.** No GCP credentials exist in this repository or on this machine, so the
  deployed AI path (§2.7) is unit-tested against an injected transport — including the
  service-account signing, against a throwaway RSA key generated inside the test — and has never
  been run against `aiplatform.googleapis.com`. The first real call is the first deploy. The
  provider it shares its `generateContent` body with, `google-ai`, is equally unexercised. What
  *is* verified live is the **local** `openai-compatible` path
  (`e4-decisions.md` §12): 768-dim embeddings and schema-constrained output that preserves
  abstention, measured against a running OpenAI-compatible server.
- **Postgres builds from source here.** The base compose file uses
  `build: ./postgres` (postgis + pgvector), so the first `up` on Loki compiles
  an image rather than pulling one. Expect it to take a while, and expect the
  build to need the repository checked out on the box.

---

## 9. Observability — Grafana on Loki

`otel-lgtm` is Grafana, Loki, Prometheus, Tempo, Pyroscope and an OpenTelemetry
collector in one container. Both compose files pin it to
`grafana/otel-lgtm:0.32.1` (Grafana 13.2.0, Loki 3.7.7, Prometheus 3.14.0,
Tempo 3.0.3); `OTEL_LGTM_IMAGE` in `infra/.env.prod` still overrides it, with
the caveat in §9.5.

Everything below was measured on 2026-09-27 against that image, in two places:
the shared `cellar-stack` lane (compose files as committed in `cc489371`,
provisioning as in `82481bc5` and `76c32d6a`; `otel-lgtm` mounts only
`infra/grafana/**`, so no other agent's working-tree edits were in play), and a
throwaway compose project running this overlay's **rendered prod config**
(`docker compose -p otelprobe … -f infra/docker-compose.yml -f
infra/docker-compose.prod.yml --env-file <stub> up -d --no-deps otel-lgtm`: the
same environment, mounts, healthcheck and no published ports).

### 9.1 Signing in

The overlay sets `GF_AUTH_ANONYMOUS_ENABLED=false`. The image's
`run-grafana.sh` defaults anonymous access **on, with org role Admin**, and
until this change the overlay left that in place — so production Grafana was an
unauthenticated admin console for anyone who could reach the LAN-bound
`:3010` (then Caddy's, now the container's own publish). Sign in as `admin` with `GRAFANA_ADMIN_PASSWORD`.

Measured on the prod config: anonymous `GET /api/datasources`,
`/api/admin/settings` and `/api/v1/provisioning/alert-rules` answer **401**;
`/api/health` answers 200 (the healthcheck needs no credentials); `admin` with
the password answers 200 and `admin:admin` 401. The same anonymous requests
against the dev lane answer 200 — which is deliberate there (loopback-only,
single developer; see the comment on `otel-lgtm` in `infra/docker-compose.yml`)
and is the negative control that the check discriminates.

**Grafana locks an account for five minutes after five failed logins.**
Observed during the rotation test below: a correct new password answered 401
until the window had passed, then 200. Anything still sending an old password —
a script, a browser tab — keeps the admin account locked out.

### 9.2 Rotating the Grafana admin password

`GF_SECURITY_ADMIN_PASSWORD` seeds the admin user **only when `grafana.db` is
created**, and `grafana.db` is on the `otel-lgtm-data` volume. Measured: after
changing `GRAFANA_ADMIN_PASSWORD` and recreating the container, the old
password still answered 200 and the new one 401. The edit alone does nothing.

Two procedures work; both were run against the prod config.

**Keep `.env.prod` the source of truth (recommended).** Edit
`GRAFANA_ADMIN_PASSWORD`, recreate so the container carries it, then copy it
into the database from inside the container — the password never appears on a
command line or in shell history:

```bash
DC="docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml --env-file infra/.env.prod"
$DC up -d otel-lgtm            # env changed -> recreate; the volume is kept
$DC exec -T otel-lgtm sh -c 'printf "%s\n" "$GF_SECURITY_ADMIN_PASSWORD" |
  GF_PATHS_DATA=/data/grafana/data GF_PATHS_PLUGINS=/data/grafana/plugins \
  /otel-lgtm/grafana/bin/grafana cli --homepath /otel-lgtm/grafana \
  admin reset-admin-password --password-from-stdin'
# -> Admin password changed successfully ✔
```

**The two `GF_PATHS_*` variables are not optional.** `run-grafana.sh` exports
them for the server process only; a `docker exec` shell does not have them
(`GF_PATHS_DATA` is unset there). Without them the CLI opens
`/otel-lgtm/grafana/data`, **creates and migrates a brand-new database there,
and prints "Admin password changed successfully"** — measured — while the real
admin password is untouched. Verify with one login afterwards, not with the
CLI's word.

**If you know the current password,** the API does it in one call:
`PUT /api/user/password` with `{"oldPassword":…, "newPassword":…,
"confirmNew":…}` as `admin` (`{"message":"User password changed"}`). Then put
the same value in `.env.prod`.

Keep the two in step either way: a fresh volume seeds from `.env.prod`, and the
image's start-up script creates its `ai-tools` service account with the env
value as the admin password.

### 9.3 Observability data and retention

`/data` is the named volume `otel-lgtm-data` in both compose files. It holds
Loki's chunks and WAL, Prometheus' TSDB, Tempo's blocks, Pyroscope, and
Grafana's database — alert state, silences, annotations (alert state history
included), the notification log, the admin password — plus its downloaded
plugins. It survives `docker compose down`; `down -v` destroys it (§6). Before
this change the image's writable layer held all of it: `docker restart` kept
it, a **recreate** — an env change, an image bump, a deploy — wiped it, and the
dead-letter reporter's dead-man's switch then paged about five minutes later.

**Proven across three recreates of `cellar-stack-otel-lgtm-1`.** A synthetic
marker line pushed to Loki before each was queryable after it; Grafana's alert
annotations (20, then 22) and a synthetic silence survived; two alerts firing
at the moment of the recreate came back **still firing with their original
`activeAt`**, and the sink behind the contact point received no duplicate
notification (the notification log survived too); Prometheus still answered
for samples from 2026-09-20. The first of those recreates migrated the old
container's data: stop it, stream its `/data` into the volume, recreate:

```bash
docker stop -t 30 <project>-otel-lgtm-1
docker volume create --label com.docker.compose.project=<project> \
  --label com.docker.compose.volume=otel-lgtm-data <project>_otel-lgtm-data
docker cp <project>-otel-lgtm-1:/data - | \
  docker run --rm -i -v <project>_otel-lgtm-data:/dst alpine:3 tar -x -C /dst --strip-components=1
docker compose … up -d --no-deps --force-recreate otel-lgtm
```

(748 MB on `cellar-stack`, 38 seconds of telemetry gap end to end.) Only needed
on a host whose `otel-lgtm` predates the volume; a new host starts empty.

**Retention.** Set through the image's own `*_EXTRA_ARGS` hooks, so no config
file is overridden for it. Before, measured from each server's effective config:

| | before | now | why |
|---|---|---|---|
| Loki (logs) | **none** — `retention_enabled: false`, `retention_period: 0s` | 30 days | the alert source; a month of triage history |
| Prometheus (metrics) | 15 days (built-in default) | 30 days **or 5 GB**, whichever first | the size cap is the only hard ceiling in the stack |
| Tempo (traces) | 14 days (default; its hourly retention job was seen deleting blocks) | 14 days, explicit | bulkiest per event, least re-read |
| Pyroscope | 31 days (default) | unchanged | only profiles itself; nothing here sends profiles |

Each was read back from the running server after the change: Prometheus
`storageRetention: "30d or 5GiB"`, Loki `retention_enabled: true`,
`delete_request_store: filesystem`, `retention_period: 30d`, Tempo
`block_retention: 336h0m0s` — and a control run with a different value confirmed
the Tempo flags override its config file.

**Disk, estimated from the dev lane's measured ingest** — 2026-09-19 to 09-27,
8.7 days of agent and e2e traffic, not production; treat it as a shape, not a
forecast:

| store | measured | at retention |
|---|---|---|
| Prometheus | 146 samples/s after the Dapr scrape was added, at 2.61 bytes/sample (read from the existing blocks' `meta.json`) ≈ 33 MB/day | ≈ 1 GB at 30 days; 5 GB cap |
| Tempo | 39 MB in 8.7 days ≈ 4.5 MB/day | ≈ 65 MB at 14 days |
| Loki | 0.7 MB in 8.7 days (actors only; api logging landed 2026-09-27, unmeasured) | tens of MB at 30 days |
| Pyroscope | 125 MB, 64 MB of it a fixed raft WAL; blocks ≈ 6.7 MB/day | ≈ 270 MB at 31 days |
| Grafana | 537 MB plugins + 2 MB database | flat |

About 2 GB at these rates, with Prometheus' 5 GB cap as the ceiling on the only
store that grows with series count. Loki and Tempo are bounded by time only, so
a log storm is bounded by 30 days of it; check with `docker system df -v`.

**Plugins on a persisted volume.** Grafana downloads its Drilldown apps into
`/data/grafana/plugins` on first start, so they survive into the next image.
The image's `refresh_stale_managed_plugins` handles that, verified: with the
version marker set to `v13.1.0` and the container restarted, it logged
`Grafana version changed (v13.1.0 -> v13.2.0)`, removed the four managed
plugins, Grafana re-downloaded them within 20 seconds, and the marker read
`v13.2.0`. Two caveats: it needs internet egress at start, and
`grafana-llm-app` and `grafana-advisor-app` are not in its list, so they are
never refreshed — if one errors after an upgrade, delete its directory under
`/data/grafana/plugins` and restart.

**Stopping cleanly.** `run-all.sh` SIGKILLs any server still running after
`LGTM_SHUTDOWN_TIMEOUT_SECONDS` (image default 5). Measured after SIGTERM: Loki
stops at about +16 s and Tempo at +30 s, so the default killed both on every
stop. The compose file sets 40 (and `stop_grace_period: 50s`); a stop now
takes about 30 seconds and every server logs its own shutdown.

### 9.4 Config changes reach the container

`docker compose up -d` recreates a container when its compose config changes,
never because a bind-mounted file did, and Grafana reads alerting provisioning
only at start. So the deploy workflow hashes `infra/grafana` and `infra/dapr`
(Markdown excluded) into a `cellar.config-fingerprint` label on `otel-lgtm` and
both sidecars (Caddy, and `infra/caddy`, were in this list until the edge moved
to the host's nginx-proxy; its vhost files are installed and reloaded by
`edge.sh install` instead, §3). Measured with `up --dry-run`: the same
fingerprint answers `Running`; a changed one answers `Recreate` for that service
only. An in-place reload is not a substitute, because several of these are
**single-file** mounts and a single-file bind mount does not follow a checkout
that replaces the file — on Docker Desktop the container's view became "No such
file" after an atomic rename; on Linux it keeps serving the old inode.

Deploying by hand? Either export the two hashes the workflow computes, or
`up -d --force-recreate otel-lgtm` after a config change. With the data on
a volume, recreating `otel-lgtm` costs a telemetry gap of well under a minute
and nothing else.

### 9.5 Upgrading `otel-lgtm`

In one commit: bump the tag in both compose files; re-copy the upstream half of
`infra/grafana/otel-lgtm/prometheus.yaml` from the new image (its header has
the command); re-check the retention flags against each server's `-help`; and
re-read the new image's `run-grafana.sh` for its anonymous-access default.
Setting `OTEL_LGTM_IMAGE` alone skips all of that.

### 9.6 Dapr runtime metrics

`infra/grafana/otel-lgtm/prometheus.yaml` adds two scrape jobs:
`dapr-sidecar` (`actors-dapr:9090`, `api-dapr:9090`) and `dapr-control-plane`
(`placement:9090`, `scheduler:9090`), every 30 seconds. The addresses are
service names because each sidecar is its own container on the compose network
(`x-daprd` does not use `network_mode: service:`). Size histograms are dropped
from the sidecars and everything but Dapr's own series and three process
metrics from the control plane, whose scheduler otherwise serves ~1,500 etcd and
gRPC series. On `cellar-stack` all four targets report `up`, and
`dapr_runtime_actor_pending_actor_calls`, `dapr_http_server_request_count`,
`dapr_placement_actor_runtimes_total` and `dapr_scheduler_*` all answer through
`/api/datasources/proxy/uid/prometheus/api/v1/query`. The Actor Observability
dashboard's Dapr row reads them. (The per-worktree host-run lane, where the
sidecars are host processes, scrapes a generated copy of this file instead —
`docs/architecture/local-dev-stacks.md`, "Dapr runtime metrics". Production and
`cellar-stack` never load it.)

### 9.7 Alert delivery — what is proven, and what is left to you

Proven on `cellar-stack` with `DISCORD_WEBHOOK_URL` pointed, at `up` time, at a
throwaway sink container on the compose network that recorded every POST:
SYNTHETIC-tagged OTLP records pushed to `otel-lgtm:4318` made real rules fire,
and each one reached the sink as a Discord-shaped payload (`username`,
`content`, `embeds[]`) on the route its labels select — page route at 10 s,
root at 30 s — followed by a `[RESOLVED]` message. Each rule had a negative
control that left it Normal and the sink empty. The rule comments in
`infra/grafana/provisioning/alerting/` carry the timestamps. The synthetic
records remain in Loki, tagged `synthetic=true`.

What cannot be proven from here is **your** webhook. `DISCORD_WEBHOOK_URL` is
blank in `infra/.env.prod.example`, and the production overlay now refuses to
render with it blank (`:?`) — before that, blank meant the base file's reserved
`discord.invalid` placeholder, so every alert fired and every notification
failed with nothing refusing to start. The deploy also refuses the placeholder
spelled out. A *wrong* URL is still undetectable from here, so after deploying, send the test message whose command is at the top of
`contact-points-and-policies.yaml` — with `-u admin:<GRAFANA_ADMIN_PASSWORD>`,
since anonymous access is off — and look for it in the channel. It tests the
URL Grafana actually stored, and it answers HTTP 200 whether or not delivery
worked: read the body for `"status":"success"`. (The command that file used to
give no longer exists on Grafana 13.2.0 — 404 — and the receivers/test route
before it answers 410; both measured.)
