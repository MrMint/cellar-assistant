#!/usr/bin/env bash
# The local model server, for the `openai-compatible` AI provider.
#
#   scripts/ai/local-model.sh verify     is a server answering, and correctly?
#   scripts/ai/local-model.sh up         start vLLM's two servers
#   scripts/ai/local-model.sh env        the exports the actor host needs
#
# Full documentation: services/actors/README.md · Local AI
#
# ## Optional, on purpose
#
# Nothing in `bun run dev:up` calls this, and nothing should. With `AI_PROVIDER`
# unset the stack comes up and the five AI-backed features each fail with an
# error naming themselves — a supported state, not a broken one
# (`services/actors/src/lib/ai/install.ts`). This script is how you opt *in*.
#
# ## Why not Docker
#
# Two reasons, and the first is fatal. A container on macOS reaches no Metal
# device, so a model in Docker on this machine is CPU-bound *and* virtualised.
# And `infra/docker-compose.yml` already points the actor host at
# `host.docker.internal` for exactly this reason — the model runs on the host,
# outside compose, the same arrangement ollama has always had here.
#
# ## The standing decision, and its sharp edge
#
# Local dev = vLLM; deployed = Gemini on Vertex (`docs/architecture/e4-decisions.md`
# §12). But **vLLM has no Metal backend**: on Apple silicon it builds CPU-only,
# and `docs/architecture/findings/vllm-provider.md` §6 measured 52 s/image
# against 1.16 s on MPS. So this script serves *any* OpenAI-compatible server —
# `verify` and `status` work against LM Studio or `llama-server` untouched, and
# only `up` is vLLM-specific. Revising the decision is a base URL, not a rewrite.
#
# ## bash 3.2
#
# macOS ships bash 3.2. No associative arrays, no `${var,,}`, no `mapfile`.
# There is also no `timeout(1)` on this machine — curl's `--max-time` is used.
set -euo pipefail

# Outside the repo: multi-gigabyte venvs must never land in a worktree, where
# they would be seen by `bun install`, biome, turbo and every `git status`.
VENV="${CELLAR_VLLM_VENV:-$HOME/.cache/cellar-assistant/vllm}"
RUN_DIR="${CELLAR_VLLM_RUN_DIR:-$HOME/.cache/cellar-assistant/run}"

CHAT_PORT="${OPENAI_COMPAT_PORT:-8000}"
EMBED_PORT="${OPENAI_COMPAT_EMBEDDING_PORT:-8001}"
CHAT_BASE="${OPENAI_COMPAT_ENDPOINT:-http://localhost:$CHAT_PORT}"
EMBED_BASE="${OPENAI_COMPAT_EMBEDDING_ENDPOINT:-http://localhost:$EMBED_PORT}"

# Defaults mirror `readAIProviderConfig`'s `openai-compatible` case exactly. If
# you change one, change the other.
CHAT_MODEL="${OPENAI_COMPAT_MODEL_MEDIUM:-Qwen/Qwen3-VL-2B-Instruct}"
EMBED_MODEL="${OPENAI_COMPAT_EMBEDDING_MODEL:-Qwen/Qwen3-VL-Embedding-2B}"
DIMENSIONS="${AI_EMBEDDING_DIMENSIONS:-768}"

say()  { printf '==> %s\n' "$*" >&2; }
warn() { printf 'WARN %s\n' "$*" >&2; }
die()  { printf 'ERROR %s\n' "$*" >&2; exit 1; }

need_python() {
  command -v python3 >/dev/null 2>&1 ||
    die "python3 is needed to parse the server's JSON (it ships with macOS)"
}

# ---------------------------------------------------------------------------
# status
# ---------------------------------------------------------------------------

# Does an OpenAI-compatible server answer /v1/models here? Prints its models.
probe_base() {
  local base="$1"
  curl -fsS --max-time 5 "${base%/}/v1/models" 2>/dev/null || return 1
}

cmd_status() {
  need_python
  local base label body rc=0
  for pair in "chat|$CHAT_BASE" "embeddings|$EMBED_BASE"; do
    label="${pair%%|*}"
    base="${pair#*|}"
    if body="$(probe_base "$base")"; then
      printf '%-11s %-34s up    %s\n' "$label" "$base" \
        "$(printf '%s' "$body" | python3 -c '
import json,sys
try:
    data = json.load(sys.stdin).get("data") or []
    print(",".join(m.get("id","?") for m in data) or "(no models listed)")
except Exception:
    print("(unparseable /v1/models)")
')"
    else
      printf '%-11s %-34s DOWN\n' "$label" "$base"
      rc=1
    fi
  done
  # A single-base server (LM Studio, llama-server, Ollama's /v1) serves both
  # routes from one port, which is the config default and not a problem.
  if [ "$CHAT_BASE" = "$EMBED_BASE" ]; then
    say "chat and embeddings share one base — fine for every server but vLLM"
  fi
  return $rc
}

# ---------------------------------------------------------------------------
# verify — the part that matters
# ---------------------------------------------------------------------------

# Three checks, in increasing order of what they would have caught.
#
#  1. The embedding width equals every `halfvec` column in this database. A
#     mismatch fails at insert time otherwise, or worse produces meaningless
#     distances.
#  2. The vector is not degenerate: finite, non-zero, and no single component
#     dominating. This is the cheap, model-agnostic form of the guard in
#     `findings/vllm-provider.md` §10.3 — vLLM's *default* prefix caching
#     silently corrupted 3 of 6 embeddings there, unit-norm, no NaN, no error,
#     and a 4x component outlier was the only visible symptom.
#  3. **Structured output preserves abstention.** The schema offers an optional
#     field the prompt cannot answer. A server whose grammar compiler promoted
#     it to required cannot omit it, so it confabulates — which is the single
#     failure mode this codebase's schemas are shaped to avoid
#     (`services/actors/src/lib/ai/prompts.ts`).
cmd_verify() {
  need_python
  local failures=0

  say "embeddings: $EMBED_BASE ($EMBED_MODEL, expecting ${DIMENSIONS}d)"
  local embed_body
  embed_body="$(curl -fsS --max-time 300 "${EMBED_BASE%/}/v1/embeddings" \
    -H 'content-type: application/json' \
    -d "$(embedding_probe_body)" 2>&1)" || {
    warn "the embeddings endpoint did not answer:"
    printf '%s\n' "$embed_body" | sed 's/^/     /' >&2
    failures=$((failures + 1))
    embed_body=""
  }

  if [ -n "$embed_body" ]; then
    printf '%s' "$embed_body" | DIMENSIONS="$DIMENSIONS" python3 -c '
import json, os, sys, math
want = int(os.environ["DIMENSIONS"])
try:
    payload = json.load(sys.stdin)
except Exception as exc:
    print("FAIL  response is not JSON: %s" % exc); sys.exit(1)
data = payload.get("data") or []
if not data:
    print("FAIL  no `data` in the response: %s" % json.dumps(payload)[:200]); sys.exit(1)
v = data[0].get("embedding")
if isinstance(v, str):
    print("FAIL  base64 embedding despite encoding_format=float"); sys.exit(1)
if not isinstance(v, list) or not v:
    print("FAIL  no embedding array"); sys.exit(1)
if not all(isinstance(x, (int, float)) and math.isfinite(x) for x in v):
    print("FAIL  embedding has a non-numeric or non-finite component"); sys.exit(1)

ok = True
if len(v) != want:
    print("FAIL  %d dimensions, but every halfvec column here is %d wide." % (len(v), want))
    print("      Serve %d directly:  --override-pooler-config \x27{\"dimensions\": %d}\x27"
          % (want, want))
    print("      Or, ONLY if the model is documented Matryoshka, set")
    print("      OPENAI_COMPAT_EMBEDDING_TRUNCATE=true and the provider will")
    print("      truncate and renormalise.")
    ok = False
else:
    print("ok    %d dimensions" % len(v))

norm = math.sqrt(sum(x * x for x in v))
if norm == 0:
    print("FAIL  zero vector: cosine distance 1.0 from everything, so search")
    print("      would return an arbitrary ordering and look like it worked.")
    ok = False
else:
    print("ok    norm %.4f" % norm)

peak = max(abs(x) for x in v)
# The corrupted vectors in findings/vllm-provider.md 6.6 were unit-norm with a
# 4x component outlier. Scaled by norm so it holds for unnormalised models too.
if norm > 0 and peak / norm > 0.35:
    print("WARN  one component is %.1f%% of the norm." % (100 * peak / norm))
    print("      For a healthy 768d vector this is suspicious. If this is vLLM,")
    print("      confirm the server was started with --no-enable-prefix-caching:")
    print("      prefix caching silently corrupted 3 of 6 embeddings in")
    print("      findings/vllm-provider.md 6.6 with no error of any kind.")
else:
    print("ok    peak component %.1f%% of norm" % (100 * peak / norm if norm else 0))
sys.exit(0 if ok else 1)
' || failures=$((failures + 1))
  fi

  say "structured output: $CHAT_BASE ($CHAT_MODEL) — is abstention sayable?"
  # Five properties, exactly one required, and a prompt asking for only that
  # one. This isolates the SERVER's grammar from the MODEL's willingness: if
  # the grammar promoted every property to `required`, the decoder *cannot*
  # end the object without them, so the extra keys appear no matter what the
  # prompt says. That is the hard failure. A model that merely chooses to fill
  # an optional field is a quality problem, and is reported as a warning.
  #
  # `style` carries an enum with a value the prompt does not ask for, which
  # doubles as a check that guided decoding is active at all — an inert
  # grammar lets an out-of-enum value through and those become foreign-key
  # violations inside the outbox (prompts.ts · X1b).
  local schema_body
  schema_body="$(curl -fsS --max-time 300 "${CHAT_BASE%/}/v1/chat/completions" \
    -H 'content-type: application/json' \
    -d "$(abstention_probe_body)" 2>&1)" || {
    warn "the chat endpoint did not answer:"
    printf '%s\n' "$schema_body" | sed 's/^/     /' >&2
    failures=$((failures + 1))
    schema_body=""
  }

  if [ -n "$schema_body" ]; then
    printf '%s' "$schema_body" | python3 -c '
import json, sys
OPTIONAL = ("vintage", "region", "abv", "style")
try:
    payload = json.load(sys.stdin)
except Exception as exc:
    print("FAIL  response is not JSON: %s" % exc); sys.exit(1)
choices = payload.get("choices") or []
if not choices:
    print("FAIL  no choices: %s" % json.dumps(payload)[:300]); sys.exit(1)
choice = choices[0]
if choice.get("finish_reason") == "length":
    print("FAIL  truncated (finish_reason: length) — raise OPENAI_COMPAT_MAX_TOKENS")
    sys.exit(1)
text = (choice.get("message") or {}).get("content") or ""
try:
    obj = json.loads(text)
except Exception:
    print("FAIL  the completion is not JSON, so the schema did not constrain")
    print("      decoding at all: %s" % text[:200])
    sys.exit(1)
if not isinstance(obj, dict):
    print("FAIL  the completion is not a JSON object: %s" % text[:200]); sys.exit(1)
print("ok    schema-constrained JSON: %s" % json.dumps(obj)[:160])

if "name" not in obj:
    print("FAIL  `name` is the one required key and it is missing"); sys.exit(1)

present = [k for k in OPTIONAL if k in obj]
if len(present) == len(OPTIONAL):
    print("FAIL  all four optional keys came back (%s)." % ",".join(present))
    print("      The grammar promoted every property to required, so the")
    print("      decoder CANNOT end the object without them and abstention is")
    print("      structurally unsayable. A field the model cannot honestly fill")
    print("      gets confabulated instead: prompts.ts measured this turning an")
    print("      empty answer into {\"vintage\":\"2005\",\"style\":\"SPARKLING\"}")
    print("      for a wine that does not exist. This server cannot be used for")
    print("      menu extraction or item onboarding as configured.")
    sys.exit(1)

style = obj.get("style")
if style is not None and style not in ("RED", "WHITE", "SPARKLING"):
    print("FAIL  style=%r is outside the schema enum, so guided decoding is" % style)
    print("      inert. Enums here are built from live reference tables, and an")
    print("      unconstrained value becomes a foreign-key violation raised")
    print("      inside the outbox rather than at the call site.")
    sys.exit(1)

print("ok    optionality preserved: %d of %d optional keys omitted"
      % (len(OPTIONAL) - len(present), len(OPTIONAL)))
if present:
    print("WARN  the model still filled %s despite being told it had no" % ",".join(present))
    print("      information. The grammar is fine — this is the model choosing")
    print("      to guess, which will show up as confabulated item attributes.")
    print("      Consider a stronger chat model for the vision seams.")
sys.exit(0)
' || failures=$((failures + 1))
  fi

  if [ "$failures" -eq 0 ]; then
    say "all checks passed — set AI_PROVIDER=openai-compatible (see \`env\`)"
    return 0
  fi
  die "$failures check(s) failed; see above"
}

# The abstention probe's request body. Built in python3 rather than printf:
# the payload nests quotes three deep, and a mis-escaped body comes back as a
# bare 400 that looks exactly like a server that cannot do structured output.
abstention_probe_body() {
  CHAT_MODEL="$CHAT_MODEL" python3 -c '
import json, os
print(json.dumps({
    "model": os.environ["CHAT_MODEL"],
    "stream": False,
    "messages": [{"role": "user", "content": [{"type": "text", "text":
        "Emit JSON containing ONLY the key \"name\", with the value "
        "\"probe\". You have no information for any other field, so include "
        "no other keys whatsoever. Do not guess and do not write placeholders."
    }]}],
    "response_format": {"type": "json_schema", "json_schema": {
        "name": "response",
        # Pinned false deliberately: strict=true requires `required` to list
        # every property, which is what would make abstention unsayable. The
        # provider sends the same thing (openai-compatible.ts · STRICT).
        "strict": False,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "name": {"type": "string"},
                "vintage": {"type": "string"},
                "region": {"type": "string"},
                "abv": {"type": "number"},
                "style": {"type": "string",
                          "enum": ["RED", "WHITE", "SPARKLING"]},
            },
            "required": ["name"],
        },
    }},
}))
'
}

# The embeddings request body, for the same reason.
embedding_probe_body() {
  EMBED_MODEL="$EMBED_MODEL" DIMENSIONS="$DIMENSIONS" python3 -c '
import json, os
print(json.dumps({
    "model": os.environ["EMBED_MODEL"],
    "input": "a bottle of red wine",
    "dimensions": int(os.environ["DIMENSIONS"]),
    "encoding_format": "float",
}))
'
}

# ---------------------------------------------------------------------------
# env
# ---------------------------------------------------------------------------

cmd_env() {
  cat <<EOF
export AI_PROVIDER=openai-compatible
export OPENAI_COMPAT_ENDPOINT=$CHAT_BASE
export OPENAI_COMPAT_EMBEDDING_ENDPOINT=$EMBED_BASE
export OPENAI_COMPAT_MODEL_LOW=$CHAT_MODEL
export OPENAI_COMPAT_MODEL_MEDIUM=$CHAT_MODEL
export OPENAI_COMPAT_MODEL_HIGH=$CHAT_MODEL
export OPENAI_COMPAT_EMBEDDING_MODEL=$EMBED_MODEL
export AI_EMBEDDING_DIMENSIONS=$DIMENSIONS
EOF
  # The actor host in compose reaches the host's model server the same way it
  # reaches ollama. Worth printing, because localhost inside the container is
  # the container.
  cat <<'EOF'

# In infra/.env (the compose lane), the actor host is a container, so:
#   OPENAI_COMPAT_ENDPOINT=http://host.docker.internal:8000
#   OPENAI_COMPAT_EMBEDDING_ENDPOINT=http://host.docker.internal:8001
EOF
}

# ---------------------------------------------------------------------------
# install / up / down — the vLLM-specific half
# ---------------------------------------------------------------------------

cmd_install() {
  command -v uv >/dev/null 2>&1 ||
    die "uv is not installed. \`brew install uv\`, then re-run this."
  cat >&2 <<EOF
This creates a venv at
  $VENV
and downloads vLLM plus torch — several GB, several minutes. The model weights
are a further ~4 GB each on first serve, into ~/.cache/huggingface.

Nothing is installed into the repo or into any worktree.
EOF
  printf 'Continue? [y/N] ' >&2
  local answer
  read -r answer
  case "$answer" in [yY]*) ;; *) die "cancelled" ;; esac

  # Python 3.12: vLLM needs 3.10-3.13, and a system python 3.14 will not work.
  uv venv --python 3.12 "$VENV"
  uv pip install --python "$VENV/bin/python" vllm
  # REQUIRED. transformers 5.x breaks vLLM 0.11.0 — the engine dies at startup
  # in a way that reads like "vLLM is broken on macOS" when it is not.
  # findings/vllm-provider.md 6.2 burned real time on this.
  uv pip install --python "$VENV/bin/python" "transformers==4.57.1"
  say "installed. Next: $0 up"
}

vllm_bin() {
  [ -x "$VENV/bin/vllm" ] ||
    die "no vLLM at $VENV. Run: $0 install"
  printf '%s' "$VENV/bin/vllm"
}

cmd_up() {
  local vllm
  vllm="$(vllm_bin)"
  mkdir -p "$RUN_DIR"

  warn "vLLM on Apple silicon is CPU-only — there is no Metal backend."
  warn "Expect ~52 s/image and ~95 ms/text (findings/vllm-provider.md 6.5)."
  warn "Text is usable; the vision seams are slow enough to feel broken."

  # --- the embedding server ------------------------------------------------
  #
  # `--no-enable-prefix-caching` is NOT optional and NOT a performance tweak.
  # vLLM enables prefix caching by default, and with it on, six embeddings
  # sharing a long common prefix (which every prompt here does, via the
  # instruction preamble) degraded progressively: the first three exact, the
  # sixth pure noise at cosine -0.0016 against the reference. Unit-norm, no
  # NaN, no error. findings/vllm-provider.md 6.6.
  if probe_base "$EMBED_BASE" >/dev/null 2>&1; then
    say "embeddings already up at $EMBED_BASE"
  else
    say "starting embeddings: $EMBED_MODEL on :$EMBED_PORT"
    nohup "$vllm" serve "$EMBED_MODEL" \
      --port "$EMBED_PORT" \
      --runner pooling \
      --no-enable-prefix-caching \
      --override-pooler-config "{\"dimensions\": $DIMENSIONS}" \
      --dtype float32 \
      --max-model-len 4096 \
      --enforce-eager \
      --trust-remote-code \
      >"$RUN_DIR/vllm-embed.log" 2>&1 &
    printf '%s' "$!" >"$RUN_DIR/vllm-embed.pid"
    say "  log: $RUN_DIR/vllm-embed.log"
  fi

  # --- the chat server -----------------------------------------------------
  if probe_base "$CHAT_BASE" >/dev/null 2>&1; then
    say "chat already up at $CHAT_BASE"
  else
    say "starting chat: $CHAT_MODEL on :$CHAT_PORT"
    nohup "$vllm" serve "$CHAT_MODEL" \
      --port "$CHAT_PORT" \
      --dtype float32 \
      --max-model-len 8192 \
      --enforce-eager \
      --trust-remote-code \
      >"$RUN_DIR/vllm-chat.log" 2>&1 &
    printf '%s' "$!" >"$RUN_DIR/vllm-chat.pid"
    say "  log: $RUN_DIR/vllm-chat.log"
  fi

  say "first start loads weights and can take minutes. Then: $0 verify"
}

cmd_down() {
  local name pidfile pid stopped=0
  for name in embed chat; do
    pidfile="$RUN_DIR/vllm-$name.pid"
    [ -f "$pidfile" ] || continue
    pid="$(cat "$pidfile")"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      # vLLM spawns its engine core in a separate process, so the whole group
      # has to go or the child keeps the port.
      kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
      say "stopped vllm-$name (pid $pid)"
      stopped=$((stopped + 1))
    fi
    rm -f "$pidfile"
  done
  [ "$stopped" -gt 0 ] || say "nothing of ours was running"
}

cmd_logs() {
  local which="${1:-embed}"
  local f="$RUN_DIR/vllm-$which.log"
  [ -f "$f" ] || die "no log at $f (try: $0 logs chat)"
  tail -f "$f"
}

# ---------------------------------------------------------------------------

usage() {
  sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
  cat <<'EOF'

Commands
  verify            width, degeneracy and abstention checks against the server
  status            is anything answering /v1/models?
  env               export lines for AI_PROVIDER=openai-compatible
  install           create the vLLM venv outside the repo (prompts first)
  up                start vLLM's embedding + chat servers
  down              stop the servers this script started
  logs [embed|chat] tail a server log

`verify`, `status` and `env` work against ANY OpenAI-compatible server — LM
Studio, llama-server, an MLX shim, Ollama's own /v1. Only `install`/`up`/`down`
are vLLM-specific.

Environment
  OPENAI_COMPAT_ENDPOINT             chat base    (default http://localhost:8000)
  OPENAI_COMPAT_EMBEDDING_ENDPOINT   embed base   (default http://localhost:8001)
  OPENAI_COMPAT_MODEL_MEDIUM         chat model
  OPENAI_COMPAT_EMBEDDING_MODEL      embedding model
  AI_EMBEDDING_DIMENSIONS            expected width (default 768)
  CELLAR_VLLM_VENV                   venv path (default ~/.cache/cellar-assistant/vllm)
EOF
}

main() {
  local cmd="${1:-}"
  [ $# -gt 0 ] && shift || true
  case "$cmd" in
    verify)  cmd_verify "$@" ;;
    status)  cmd_status "$@" ;;
    env)     cmd_env "$@" ;;
    install) cmd_install "$@" ;;
    up)      cmd_up "$@" ;;
    down)    cmd_down "$@" ;;
    logs)    cmd_logs "$@" ;;
    ""|-h|--help|help) usage ;;
    *) printf 'unknown command: %s\n\n' "$cmd" >&2; usage; exit 2 ;;
  esac
}

main "$@"
