# `services/actors`

The actor host: every entity, search, view, collection and job actor, plus
better-auth (`src/auth/README.md`). It is the only process with a Postgres
connection.

## Local AI

Six features are backed by a model, and every one of them reaches it through
an injectable seam rather than an AI client of its own:

| feature | seam | module |
|---|---|---|
| semantic search (`CellarActor.semanticQuery`, `recipeSearch(semanticQuery:)`, every `*SearchActor`) | `Embedder` | `src/lib/embeddings.ts` |
| tier-list insights | `InsightsGenerator` | `src/actors/tier-list-actor.ts` |
| item onboarding label defaults | `ItemDefaultsProvider` | `src/lib/item-defaults.ts` |
| menu extraction, ambiguous-match verification | `MenuExtractionProvider`, `MenuMatchVerifier` | `src/lib/menu-ai.ts` |
| recipe-photo vision | `RecipePhotoExtractor` | `src/lib/recipe-photo-ai.ts` |
| review of a user-submitted place | `PlaceReviewer` | `src/actors/place-creation-actor.ts` |
| image search (`itemSearch(imageFileId:)`), stored-photo vectors | `ImageEmbedder` (query and document slots) | `src/lib/image-embeddings.ts` |

**Image search needs `gemini-embedding-2`** (`AI_PROVIDER=vertex-ai` or
`google-ai`). It embeds the photo on its own into the space the item vectors
live in, which no Ollama or OpenAI-compatible embedding model can. On any other
configuration — including the per-worktree lane's default `ollama` — a photo
search is a `ConflictError` with reason `IMAGE_SEARCH_UNAVAILABLE`, nothing is
fetched or charged, and the client says photo search isn't available. Stored
photos are embedded on attach (`ItemActor.embedImage`, via the outbox) and, for
photos that predate that or another model's, by the vector re-embed job's
`item_image_vectors` table: `scripts/operator.ts reembed --tables
item_image_vectors`.

A search photo (upload kind `image-search`) is short-lived: `ItemSearchActor`
discards it — row and object, through `FileActor.discardSearchPhoto` — once the
search has used it (or refused it as `IMAGE_SEARCH_UNAVAILABLE`), and
`MaintenanceActor`'s daily reap deletes any unattached one older than 24h
(`SEARCH_PHOTO_TTL_MS`), verified or not. Reloading `/search?image=<id>` after
the cached result is gone reads as an expired link. An item's shared vector
takes in only its newest **public** photo; a private one never shapes it.

`src/index.ts` calls `installAI()` at boot, which installs a real implementation
behind all seven seams — or, with no provider configured, installs nothing and
leaves each seam throwing an error that names itself.

Every one of those seven model calls is charged to `BudgetActor` before it runs
(`811cad82`). Each seam has a monthly request cap and a cost cap
(`MODEL_SPENDERS` in `src/actors/budget-actor.ts`). `ollama` and
`openai-compatible` (whatever it points at) are priced at zero (`FREE_PROVIDERS`)
and still hit the request cap. A
refusal is a thrown `BudgetExceededError`, never a synthesised answer. Raise the
money with `setBudget` (no restart) and the request cap with
`AI_BUDGET_MAX_REQUESTS=<seam>=<count>` (restart); that file's doc says which
cap binds first for each seam.

### Which provider, where

Settled by the user on 2026-09-17 and recorded in
`docs/architecture/e4-decisions.md` §12:

| | provider | why |
|---|---|---|
| **local dev (Mac)** | `openai-compatible`, pointed at **`llama-server` or LM Studio** | Metal-accelerated; vLLM is supported but CPU-only here |
| **deployed** | `vertex-ai` — Gemini on GCP | no model is served on the deploy host at all |

`ollama` and `google-ai` are both still here and still work. Ollama in
particular is what `infra/.env.example` defaults to, what
`scripts/stack/stack.sh` exports, and what `scripts/runtime-acceptance.sh` runs
against, because it is the only provider that works with nothing started and no
credentials.

**`openai-compatible` is named for a wire format, not a product.** It speaks
`POST /v1/chat/completions` and `POST /v1/embeddings`, so vLLM,
llama.cpp's `llama-server`, LM Studio, an MLX-backed shim, Ollama's own `/v1`
route and api.openai.com are all the same provider with a different base URL —
**no code change.** That matters here specifically, because:

> **vLLM has no Metal backend**, and the decision's original choice of it was
> revised for this reason. On Apple silicon it installs and runs — a working
> 0.11.0 wheel, contrary to its own docs — but **CPU-only**, with no quantized
> kernels. Measured on an M4 Pro:
>
> | | vLLM (CPU) | MPS | |
> |---|---|---|---|
> | one image embed | **52.4 s** | **1.16 s** | ~45× slower |
> | one short text embed | 95 ms | 226 ms | 2.4× *faster* |
>
> The asymmetry is the point: vLLM is fine for text and catastrophic for
> images, and **four of the seven seams are vision seams**. §6 of
> `docs/architecture/findings/vllm-provider.md` has the measurements, §7 the
> alternatives.
>
> **If you run vLLM anyway, `--no-enable-prefix-caching` is mandatory** — see
> `verify` below.

So the local recommendation is, in order: `llama-server` or LM Studio through
`openai-compatible`; or `AI_PROVIDER=ollama` for zero setup; then vLLM. All of
them are the same provider and the same two variables.

### Running with a model, locally

#### `openai-compatible`, against whichever server

Any of these work with no code change — it is a base URL and a model name:

```bash
# LM Studio (least work; Metal-accelerated). Start its local server, then:
export AI_PROVIDER=openai-compatible
export OPENAI_COMPAT_ENDPOINT=http://localhost:1234      # serves both routes
export OPENAI_COMPAT_MODEL_MEDIUM=<the id LM Studio shows>
export OPENAI_COMPAT_EMBEDDING_MODEL=<an embedding model id>

# llama-server (llama.cpp; Metal-accelerated, needs a GGUF)
export OPENAI_COMPAT_ENDPOINT=http://localhost:8080

# Ollama's own OpenAI-compatible route, if you would rather not use `ollama`
export OPENAI_COMPAT_ENDPOINT=http://localhost:11434
export OPENAI_COMPAT_MODEL_MEDIUM=gemma3:4b
export OPENAI_COMPAT_EMBEDDING_MODEL=nomic-embed-text
```

Whatever you pick, **run `verify` before trusting it** (below). The Ollama
`/v1` row above is what this provider was measured against: 768-dim unit-norm
embeddings, and `PLACE_REVIEW_SCHEMA` (six properties, one required) coming
back with three keys, which is the abstention property holding.

#### vLLM via `openai-compatible`

`scripts/ai/local-model.sh` does the whole lane. It is **optional** — nothing in
`bun run dev:up` calls it, and the stack comes up without it.

```bash
scripts/ai/local-model.sh install   # a vLLM venv at ~/.cache/cellar-assistant
                                    # (several GB; prompts before downloading)
scripts/ai/local-model.sh up        # both servers: chat :8000, embeddings :8001
scripts/ai/local-model.sh verify    # width, degeneracy and abstention checks
scripts/ai/local-model.sh env       # the exports, ready to paste
scripts/ai/local-model.sh status    # is anything answering /v1/models?
scripts/ai/local-model.sh down
```

Two endpoints because **`vllm serve <model>` is one model per process**, while
`AIProvider` needs both a chat model and an embedding model. Every other
compatible server serves both routes from one base, and leaving
`OPENAI_COMPAT_EMBEDDING_ENDPOINT` unset defaults it to the chat endpoint — so
only vLLM pays for vLLM's design.

`verify`, `status` and `env` work against **any** OpenAI-compatible server, so
they are the way to check an LM Studio or `llama-server` setup too. Only
`install` / `up` / `down` are vLLM-specific.

#### `verify` — run it before trusting any local server

Three checks, and the second exists because of a real, silent corruption:

1. The embedding width equals every `halfvec` column here (768).
2. The vector is finite, non-zero, and has no dominating component. **vLLM
   enables prefix caching by default, and with it on, six embeddings sharing a
   long common prefix — which every prompt here has — degraded progressively:
   the first three exact against the reference, the sixth pure noise at cosine
   `-0.0016`.** Unit-norm, no NaN, no error, and it would have inserted into
   `halfvec(768)` happily. `up` passes `--no-enable-prefix-caching`; this check
   is what notices if something starts a server without it.
3. **Structured output preserves abstention** — the schema offers four optional
   fields the prompt cannot answer, and they must come back omitted. If a
   server's grammar compiler promoted them to `required`, the decoder *cannot*
   omit them and the model confabulates instead. See `src/lib/ai/prompts.ts`.

#### The zero-setup path: Ollama

Needs no credentials and nothing installed beyond ollama itself:

```bash
ollama serve                      # usually already running
ollama pull nomic-embed-text      # embeddings: 768-dim, matching every halfvec column
ollama pull gemma3:4b             # multimodal: text and the three vision seams
```

That is the whole setup. `infra/docker-compose.yml` already defaults
`AI_PROVIDER=ollama` and points `OLLAMA_ENDPOINT` at
`http://host.docker.internal:11434`, so `bun run stack:up` picks it up. Running the
host directly instead of in compose wants `OLLAMA_ENDPOINT=http://localhost:11434`.

Verify:

```bash
curl -s localhost:11434/api/embeddings \
  -d '{"model":"nomic-embed-text","prompt":"pinot noir"}' \
  | python3 -c 'import sys,json; print(len(json.load(sys.stdin)["embedding"]))'
# 768
```

### Running with no model

Unset `AI_PROVIDER`. This is a supported state, not a broken one: the host
starts, everything that is not AI-backed works, and each of the features above
fails with its own `ConflictError` saying what is missing — except place
review, whose caller records `review: null` instead of an approval nobody gave.
Nothing degrades to a plausible-looking answer.

### Production — `vertex-ai`

The deployed provider (`e4-decisions.md` §12). `google-ai` is the same Gemini
models behind one API key instead of a service account, and is kept as the
cheaper-to-configure alternative:

```bash
# vertex-ai
AI_PROVIDER=vertex-ai
GOOGLE_GCP_PROJECT_ID=<project>
GOOGLE_GCP_LOCATION=global               # Gemini models are served globally
VERTEX_AI_EMBEDDING_LOCATION=           # leave EMPTY (below)
GOOGLE_APPLICATION_CREDENTIALS_JSON=<the service-account key, inline>
#   or GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
#   the service account needs roles/aiplatform.user

# google-ai
AI_PROVIDER=google-ai
GOOGLE_AI_API_KEY=<key from aistudio.google.com/apikey>
```

Full list with defaults: `infra/.env.example`.

Three things to know before deploying either:

- **The embedding model is `gemini-embedding-2`, and Vertex serves it only at
  `global`** (through `:embedContent`; `:predict` 404s for it in every region).
  Leave `VERTEX_AI_EMBEDDING_LOCATION` empty: blank reads as unset
  (`src/lib/ai/config.ts`), and unset lets `embeddingLocation`
  (`src/lib/ai/vertex-ai.ts`) send `gemini-embedding-2` to `global` and an
  older `text-embedding-*` to `us-central1`. A value set there wins for every
  model, so a region 404s every `gemini-embedding-2` call.
- **The two sanctioned paths do not agree on native embedding width.**
  `gemini-embedding-2` is asked for 768 through `outputDimensionality` and
  re-normalises the shortened vector itself; nothing is done to it here.
  `Qwen3-VL-Embedding-2B` — the local default — emits **2048**, and must be cut
  to 768 server-side with `--override-pooler-config '{"dimensions": 768}'`, or
  by the provider's explicit `OPENAI_COMPAT_EMBEDDING_TRUNCATE=true`, which
  truncates **and renormalises**. That flag asserts the model is Matryoshka and
  the code cannot check it for you: truncating a model that is not yields a
  unit-norm vector that inserts fine and means nothing.
- **`AI_EMBEDDING_DIMENSIONS` is 768** because every `halfvec` column here is.
  `EmbeddingActor` rechecks the width it actually received and refuses a vector
  of any other size, so a model swap fails immediately rather than at a `<=>`
  deep inside a query.
- **Changing the embedding model invalidates every stored vector.** Vectors from
  two different models are not comparable. Every `item_vectors` /
  `recipe_vectors` row records the embedding that made it (`embedding_model`),
  and `VectorReembedJobActor` re-embeds every row another one made:
  `bun scripts/operator.ts reembed` (`docs/architecture/deploy-loki.md` §4.2).
  It does not reach `category_vectors` or `place_vectors`, and it creates no
  vector for an item that has none.
- **So does changing *provider*, even at the same width.** `EmbeddingTaskType`
  is a documented **no-op on `ollama`** and an **instruction prefix** on
  `openai-compatible` — measured cosine **0.9281** between `RETRIEVAL_QUERY`
  and `RETRIEVAL_DOCUMENT` for the same phrase, where ollama would give 1.0. So
  a stored vector's identity is the model *and* the instruction scheme, and
  moving between those two providers in **either direction** is a full
  re-embed. Both are 768 wide, so nothing errors — retrieval just quietly gets
  worse. `src/lib/embeddings.ts` keeps the full list of what forces a re-embed,
  next to the dimension check, because that is where someone looks.

### A set-but-incomplete provider stops the boot

Deliberate, and the one design decision worth reading `src/lib/ai/config.ts` for.
The Nhost stack's `functions/refreshPlaces/_services/factory.ts` answered missing
GCP credentials with a `console.warn` and a mock service reading a fixed JSON
file — in production, with every caller downstream none the wiser. So:

- `AI_PROVIDER` unset → nothing installed, seams throw on use. Fine.
- `AI_PROVIDER` set and complete → installed.
- `AI_PROVIDER` set and incomplete → **throws at boot; the host does not serve.**

`src/lib/ai/no-silent-fallback.test.ts` holds all three, and additionally parses
this directory to assert that every `catch` rethrows, that nothing imports a
JSON fixture or a module named `mock`/`fixture`/`stub`, and that nothing branches
on `NODE_ENV`. Those are the three things the old factory did.

## Tests

```bash
bun run --filter @cellar-assistant/actors test
```

The suite builds and runs against `cellar_test` (`packages/db/transform/test-db.sh`),
never the development database. No test reaches a model: every AI test either
injects a fake at the seam boundary or an injected transport at `fetch`.
`src/lib/ai/ollama.live.test.ts` is the one exception and skips itself unless an
Ollama daemon is actually reachable.

`src/lib/ai/openai-compatible.test.ts` carries the two groups worth reading:
that a schema's `required` array **round-trips verbatim at every node** (the
abstention contract, asserted against all five real production schemas, not a
contrived one), and that a wrong-width embedding is refused rather than reaching
a `halfvec(768)` column.

Note the runtime, because it produces convincing false failures: run the suite
with `bun run --bun vitest run`. A bare `bun run vitest` is a **silent no-op** —
vitest's bin carries a `#!/usr/bin/env node` shebang that `bun run` honours, so
the whole tree goes to Node. And the repo pins Node 24 (`.nvmrc`); under Node 20
several tests fail as ordinary-looking assertion errors rather than as an
environment problem. Check `node -v` before believing a red suite.

## Overture bulk reload (C4b)

`OvertureReloadJobActor` walks a BigQuery table of Overture Maps places and
upserts them on `places_overture_id_key`, through
`PlaceActor.bulkUpsertFromOverture` at the reserved key `overture-bulk`. It
replaces the payload half of the Nhost `refreshPlaces` +
`processPlaceRefreshBatch` pair; C4 had already replaced the cursor loop.

```bash
# Nothing configured is a supported state: the reload job refuses to start and
# every other place feature is unaffected.
OVERTURE_SOURCE=bigquery
OVERTURE_BIGQUERY_TABLE=my-project.places.overture_pois   # project.dataset.table
OVERTURE_GCP_CREDENTIALS_JSON='{"type":"service_account",...}'
#   or GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
#   the service account needs roles/bigquery.jobUser on the billing project and
#   roles/bigquery.dataViewer on the dataset
OVERTURE_GCP_PROJECT_ID=my-project        # optional; defaults to the key's own
OVERTURE_BIGQUERY_LOCATION=US             # optional
OVERTURE_TIMEOUT_MS=120000                # optional; at most 175000 (boot refuses more)
```

Same three outcomes as `AI_PROVIDER`, for the same reason and against the same
original sin: unset installs nothing, complete installs the real client,
**set-but-incomplete throws at boot**. `src/lib/overture.test.ts` holds all
three rows and additionally asserts that `src/index.ts` calls
`installOverture()` — a seam that is declared and never installed fails exactly
like one nobody wrote (B5b).

The reload is **non-destructive**. It deletes nothing (the old one began with
`DELETE FROM places`), it skips any conflicting row whose `source` is not
`'overture'`, it never touches Google's columns or `last_sync_at`, and
`is_active` is set on insert only. Re-running a finished reload writes zero
rows, which is also what makes an interrupted one free to resume.

## The runtime, and how to change your mind about it

The host runs on **bun** (`start`), and there is a first-class way back to Node
24 (`start:node`). Three strings decide which interpreter serves, and all three
have to agree:

| where | bun | node |
|---|---|---|
| `package.json` | `start` | `start:node` |
| `Dockerfile` | `CMD ["bun", "src/index.ts"]` | `docker run … <image> node src/index.ts` |
| `dapr.template.yaml` (host-run lane) | `command: ["bun", …]` | `scripts/soak/run-soak.sh node` |

The production image ships **both** interpreters deliberately — the base stays
`node:24-bookworm-slim` with the bun binary copied in — so rolling back is a
`CMD` override rather than a rebuild. `src/lib/runtime.test.ts` asserts the two
package scripts still say what they say here.

Why the evidence supports that, and what it does not cover, is
`docs/architecture/findings/bun-actor-host.md`.

### Is it actually working? (`scripts/runtime-acceptance.sh`)

Twelve proofs against a real sidecar, a real Scheduler and a real Postgres —
every actor type registered (`EXPECTED_ACTOR_TYPES`), an actor method across
the sidecar hop, a typed `ActorError` as HTTP 200 + `x-daprerrorresponseheader`,
**a one-shot Scheduler-backed reminder firing**, the outbox draining, `pg` under
300 concurrent calls, and better-auth still serving `/api/auth/*`.

```bash
bun run dev:up --detach                     # this worktree's stack
services/actors/scripts/runtime-acceptance.sh
```

It asks the running host which interpreter it is and reports that in its
verdict, so the same script is the gate on either arm of an A/B. Exit status is
the number of failed proofs.

### Does it stay working? (`scripts/soak/`)

The acceptance suite runs in two minutes and proves the host works. It cannot
prove the host *keeps* working — the failure that matters for a long-lived
process is RSS that climbs for six hours, or a reminder that quietly stops
firing, with nothing failing anywhere. That needs a soak.

```bash
# one arm, bounded
services/actors/scripts/soak/run-soak.sh bun  --seconds 1800

# both arms back to back, same stack, same traffic
services/actors/scripts/soak/run-soak.sh ab   --seconds 1800

# unattended, 24 h (survives the shell; log path is printed)
services/actors/scripts/soak/run-soak.sh bun  --seconds 86400 --detach
```

Each arm rewrites the generated run file's actors `command` to the runtime under
test plus `scripts/soak/instrument.mjs` (an in-process sampler: RSS, heap,
event-loop delay, and counters for every `http2`/`tls` session the process
opens), runs the acceptance suite as a gate, then drives representative traffic:
`PingActor` invocations through the sidecar, outbox rows that make the host
*originate* sidecar calls, `ReferenceDataActor` reads against Postgres, jwks
requests, and a timed outbox probe whose delivery latency is the reminder
liveness signal.

Output lands in `.stack/<slug>/soak/<runtime>-<timestamp>/`:
`acceptance.txt`, `host-samples.jsonl`, `samples.jsonl`, `driver.log` and
`summary.json` — the last of which carries the fitted **bytes of RSS retained
per RPC** and, if that slope is positive, an estimated time-to-1-GiB at the
measured request rate. Everything is appended as it is taken, so a run killed at
hour 19 still has 19 hours of evidence.

The harness holds **no database credentials**: it reaches Postgres through
`docker exec … psql`, because this app is the only thing in the system allowed
to hold a connection string (§1.5) and a test harness is not it.
