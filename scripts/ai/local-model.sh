#!/usr/bin/env bash
# The local model server, for the `openai-compatible` AI provider.
#
#   scripts/ai/local-model.sh verify     is a server answering, and correctly?
#   scripts/ai/local-model.sh up         start vLLM's two servers
#   scripts/ai/local-model.sh embed-up   start llama-server: text+image embeddings
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
EMBED_INPUT="${OPENAI_COMPAT_EMBEDDING_INPUT:-openai}"

# --- llama-server: the local text+image embedding server ---------------------
#
# llama.cpp's `llama-server` serving Qwen3-VL-Embedding-2B (GGUF + its mmproj
# vision tower), reached with OPENAI_COMPAT_EMBEDDING_INPUT=llamacpp-multimodal
# (`services/actors/src/lib/ai/openai-compatible.ts`, createLlamacppEmbedder).
# Everything below is PINNED, because each of these changes the vectors:
#
#  - the build: b11433 is what was measured against Qwen's reference code
#    (cosine 0.9986 text, 0.994 image). Newer builds probably work; a build
#    without `media_marker` in /props does not, and the provider says so.
#  - the weights: there is no official Qwen GGUF of the embedding model, so
#    this is a community conversion at a fixed revision, checked by sha256.
#  - `--image-max-tokens 576`: resolution is part of a vector's identity
#    (cosine 0.962 between full-res and 576 tokens), and the identity key
#    says 576 (`LLAMACPP_IMAGE_MAX_TOKENS`). `verify` measures it.
#  - `--pooling last`: Qwen3-VL-Embedding pools the last token.
LLAMA_BUILD_PINNED="b11433"
LLAMA_SERVER="${LLAMA_SERVER:-llama-server}"
LLAMA_EMBED_HOST="${LLAMA_EMBED_HOST:-127.0.0.1}"
LLAMA_EMBED_PORT="${LLAMA_EMBED_PORT:-8091}"
LLAMA_IMAGE_MAX_TOKENS=576
LLAMA_GGUF_REPO="mradermacher/Qwen3-VL-Embedding-2B-GGUF"
LLAMA_GGUF_REVISION="bf4d4a2678123d5c0c1b6bd1c6fd72cba753c0b9"
LLAMA_GGUF_MODEL="Qwen3-VL-Embedding-2B.Q8_0.gguf"
LLAMA_GGUF_MODEL_SHA256="26fadde153b2266d244de4752c2dcba35be78872bdeeb005390b74689d45d851"
LLAMA_GGUF_MMPROJ="Qwen3-VL-Embedding-2B.mmproj-Q8_0.gguf"
LLAMA_GGUF_MMPROJ_SHA256="fa5a22b400fcfa32453656fdc7063bd2c80007030a79cb4f07f7c19cb1e40e8e"
# Outside the repo, like the vLLM venv. Also checked: the Hugging Face cache,
# which is where `llama-server -hf` would have put the same revision.
LLAMA_MODEL_DIR="${CELLAR_LLAMA_MODEL_DIR:-$HOME/.cache/cellar-assistant/models/qwen3-vl-embedding-2b/$LLAMA_GGUF_REVISION}"
LLAMA_HF_SNAPSHOT="$HOME/.cache/huggingface/hub/models--mradermacher--Qwen3-VL-Embedding-2B-GGUF/snapshots/$LLAMA_GGUF_REVISION"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

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

# One line about a llama-server's /props: does it embed images? Exit 1 if not.
llamacpp_props_line() {
  local base="${1%/}" body
  base="${base%/v1}"
  local auth=()
  [ -z "${OPENAI_COMPAT_API_KEY:-}" ] || auth=(-H "authorization: Bearer $OPENAI_COMPAT_API_KEY")
  if ! body="$(curl -fsS --max-time 5 ${auth[@]+"${auth[@]}"} "$base/props" 2>/dev/null)"; then
    printf '%-11s %-34s no /props (not a llama-server, down, or needs OPENAI_COMPAT_API_KEY)\n' "images" "$base"
    return 1
  fi
  printf '%s' "$body" | python3 -c '
import json, sys
try:
    p = json.load(sys.stdin)
except Exception:
    print("%-11s %-34s unparseable /props" % ("images", sys.argv[1])); sys.exit(1)
vision = (p.get("modalities") or {}).get("vision") is True
marker = bool(p.get("media_marker"))
state = "embeds images" if vision and marker else (
    "NO vision tower (start with --mmproj)" if not vision else "no media_marker (upgrade llama.cpp)")
print("%-11s %-34s %s, build %s" % ("images", sys.argv[1], state, p.get("build_info", "?")))
sys.exit(0 if vision and marker else 1)
' "$base"
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
  # Under the llama.cpp dialect, /v1/models answering is not enough: the
  # embedding server needs a vision tower and a published media marker.
  if [ "$EMBED_INPUT" = "llamacpp-multimodal" ]; then
    llamacpp_props_line "$EMBED_BASE" || rc=1
  fi
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

  if [ "$EMBED_INPUT" = "llamacpp-multimodal" ]; then
    say "embeddings: llama-server at $EMBED_BASE (llamacpp-multimodal: text + images)"
    verify_llamacpp || failures=$((failures + 1))
  else
    verify_openai_embeddings || failures=$((failures + 1))
  fi

  verify_abstention || failures=$((failures + 1))

  if [ "$failures" -eq 0 ]; then
    say "all checks passed — set AI_PROVIDER=openai-compatible (see \`env\`)"
    return 0
  fi
  die "$failures check(s) failed; see above"
}

# The text-only embedding checks, for OPENAI_COMPAT_EMBEDDING_INPUT=openai.
verify_openai_embeddings() {
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
  [ "$failures" -eq 0 ]
}

# The llama-server checks, for OPENAI_COMPAT_EMBEDDING_INPUT=llamacpp-multimodal.
# Each one is a way this setup was measured to go silently wrong:
#
#  1. No vision tower, or a build with no `media_marker` — the provider refuses
#     both at call time; this says so before anything is stored.
#  2. The text vector: 2048 wide (the server ignores `dimensions`), finite, and
#     no component dominating its 768 Matryoshka prefix. 0.18 of the norm was
#     measured healthy at 768, so the line is 0.25.
#  3. **The image budget.** A 1024 px picture must cost the 576 tokens the
#     stored identity claims, plus mtmd's two wrapper tokens. More means the
#     server was started without `--image-max-tokens 576` (full resolution:
#     cosine 0.962 from what the identity says); fewer means a lower cap.
#     Either way every image vector would be filed under the wrong identity,
#     with no error anywhere.
#  4. **Images actually reach the vector**: text finds the right one of three
#     pictures, and an item with its picture is not the text-only vector. A
#     server that ignored the images would still return plausible vectors.
verify_llamacpp() {
  EMBED_BASE="$EMBED_BASE" API_KEY="${OPENAI_COMPAT_API_KEY:-}" \
    DIMENSIONS="$DIMENSIONS" CAP="$LLAMA_IMAGE_MAX_TOKENS" \
    PINNED="$LLAMA_BUILD_PINNED" FIXTURES="$REPO_ROOT/services/client/src/images" \
    python3 -c '
import base64, json, math, os, re, sys, urllib.request

base = os.environ["EMBED_BASE"].rstrip("/")
root = re.sub(r"/v[0-9]+$", "", base)
want = int(os.environ["DIMENSIONS"])
cap = int(os.environ["CAP"])
fixtures = os.environ["FIXTURES"]
headers = {"content-type": "application/json"}
if os.environ.get("API_KEY"):
    headers["authorization"] = "Bearer " + os.environ["API_KEY"]

def get(path):
    req = urllib.request.Request(root + path, headers=headers)
    return json.load(urllib.request.urlopen(req, timeout=10))

def post(body):
    req = urllib.request.Request(root + "/v1/embeddings",
                                 data=json.dumps(body).encode(), headers=headers)
    return json.load(urllib.request.urlopen(req, timeout=300))

try:
    props = get("/props")
except Exception as exc:
    print("FAIL  GET %s/props: %s" % (root, exc))
    print("      Start it: scripts/ai/local-model.sh embed-up")
    sys.exit(1)

build = str(props.get("build_info", "?"))
if os.environ["PINNED"] in build:
    print("ok    llama-server %s (the pinned build)" % build)
else:
    print("WARN  llama-server %s; %s is the build that was measured." % (build, os.environ["PINNED"]))
if (props.get("modalities") or {}).get("vision") is not True:
    print("FAIL  no vision tower loaded: start it with the mmproj (--mmproj).")
    sys.exit(1)
marker = props.get("media_marker")
if not isinstance(marker, str) or not marker:
    print("FAIL  /props has no media_marker: this build is too old for the")
    print("      llamacpp-multimodal dialect. Upgrade llama.cpp.")
    sys.exit(1)
print("ok    vision tower loaded; media marker published")

DEF = "Represent the user\x27s input."
QUERY = "Represent this search query for retrieving relevant items."
DOC = "Represent this item for retrieval."

def embed(instr, text="", images=()):
    data = [base64.b64encode(open(os.path.join(fixtures, p), "rb").read()).decode()
            for p in images]
    prompt = ("<|im_start|>system\n%s<|im_end|>\n<|im_start|>user\n%s%s<|im_end|>\n"
              "<|im_start|>assistant\n") % (instr, marker * len(data), text)
    raw = post({"input": {"prompt_string": prompt, "multimodal_data": data},
                "encoding_format": "float"})
    return raw["data"][0]["embedding"], (raw.get("usage") or {}).get("prompt_tokens")

def prefix(v):
    s = v[:want]
    n = math.sqrt(sum(x * x for x in s))
    return [x / n for x in s]

def cos(a, b):
    return sum(x * y for x, y in zip(a, b))

ok = True
text, _ = embed(QUERY, "a bottle of red wine")
if not all(isinstance(x, (int, float)) and math.isfinite(x) for x in text):
    print("FAIL  the text vector has a non-numeric or non-finite component"); sys.exit(1)
if len(text) < want:
    print("FAIL  %d dimensions, narrower than the %d-wide halfvec columns" % (len(text), want))
    sys.exit(1)
short = prefix(text)
peak = max(abs(x) for x in short)
print("ok    text: %d dimensions, truncated to %d and renormalised" % (len(text), want))
if peak > 0.25:
    print("WARN  one component is %.0f%% of the %d-d prefix (0.18 measured healthy)" % (100 * peak, want))
else:
    print("ok    peak component %.0f%% of the %d-d prefix" % (100 * peak, want))

_, empty = embed(DEF)
_, one = embed(DEF, images=["wine1.png"])
if not isinstance(empty, int) or not isinstance(one, int):
    print("FAIL  no usage.prompt_tokens: the image budget cannot be measured"); sys.exit(1)
# mtmd wraps each image in <|vision_start|>…<|vision_end|>: two tokens that
# are not the image budget. Measured on b11433: 578 for a 576-token image.
spent = one - empty
if cap <= spent <= cap + 2:
    print("ok    a 1024 px image costs %d tokens (%d + its two wrapper tokens):" % (spent, cap))
    print("      --image-max-tokens %d is in force" % cap)
else:
    print("FAIL  a 1024 px image cost %d tokens; the stored identity says %d." % (spent, cap))
    print("      Restart llama-server with --image-max-tokens %d (embed-up does)," % cap)
    print("      or every image vector is filed under an identity it does not have.")
    ok = False

pictures = ["wine1.png", "coffee1.png", "tea1.png"]
queries = ["a bottle of red wine with a glass", "a bag of roasted coffee beans",
           "a teapot and a cup of tea"]
images = [prefix(embed(DEF, images=[p])[0]) for p in pictures]
hits = 0
for want_index, q in enumerate(queries):
    qv = prefix(embed(QUERY, q)[0])
    got = max(range(len(images)), key=lambda i: cos(qv, images[i]))
    hits += got == want_index
if hits == len(queries):
    print("ok    text -> image: %d/%d phrases found their picture" % (hits, len(queries)))
else:
    print("FAIL  text -> image: %d/%d. The images are not reaching the vectors" % (hits, len(queries)))
    print("      as they should; check the model and mmproj are the pinned pair.")
    ok = False

fused = prefix(embed(DOC, "House red. wine.", ["wine1.png"])[0])
alone = prefix(embed(DOC, "House red. wine.")[0])
if cos(fused, alone) < 0.99:
    print("ok    an item with its picture is not its text-only vector (cosine %.3f)" % cos(fused, alone))
else:
    print("FAIL  an item with its picture embeds to its text-only vector (cosine %.3f):" % cos(fused, alone))
    print("      the image was dropped.")
    ok = False
sys.exit(0 if ok else 1)
'
}

verify_abstention() {
  local failures=0
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
  [ "$failures" -eq 0 ]
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
  if [ "${1:-}" = "llama" ] || [ "$EMBED_INPUT" = "llamacpp-multimodal" ]; then
    cmd_env_llama
    return
  fi
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

# Chat and vision on Ollama's own /v1 route, embeddings on llama-server.
cmd_env_llama() {
  cat <<EOF
export AI_PROVIDER=openai-compatible
export OPENAI_COMPAT_ENDPOINT=http://localhost:11434
export OPENAI_COMPAT_MODEL_LOW=gemma3:4b
export OPENAI_COMPAT_MODEL_MEDIUM=gemma3:4b
export OPENAI_COMPAT_MODEL_HIGH=gemma3:4b
export OPENAI_COMPAT_EMBEDDING_ENDPOINT=http://localhost:$LLAMA_EMBED_PORT
export OPENAI_COMPAT_EMBEDDING_MODEL=Qwen/Qwen3-VL-Embedding-2B
export OPENAI_COMPAT_EMBEDDING_INPUT=llamacpp-multimodal
export AI_EMBEDDING_DIMENSIONS=$DIMENSIONS
EOF
  cat <<EOF

# OPENAI_COMPAT_EMBEDDING_TRUNCATE defaults to true under llamacpp-multimodal
# (Qwen3-VL-Embedding is Matryoshka; llama-server always answers 2048).
#
# In infra/.env (the compose lane) the actor host is a container, so name the
# host, and llama-server has to listen beyond loopback — with a key:
#   OPENAI_COMPAT_ENDPOINT=http://host.docker.internal:11434
#   OPENAI_COMPAT_EMBEDDING_ENDPOINT=http://host.docker.internal:$LLAMA_EMBED_PORT
#   OPENAI_COMPAT_API_KEY=<k>
#   LLAMA_EMBED_HOST=0.0.0.0 OPENAI_COMPAT_API_KEY=<k> $0 embed-up
EOF
}

# ---------------------------------------------------------------------------
# embed-install / embed-up / embed-down — llama-server
# ---------------------------------------------------------------------------

llama_server_bin() {
  command -v "$LLAMA_SERVER" >/dev/null 2>&1 || die "no llama-server on PATH.
  Install llama.cpp (services/actors/README.md · Local image embeddings):
    brew install llama.cpp
  or the pinned release tarball ($LLAMA_BUILD_PINNED), and point LLAMA_SERVER at it."
  command -v "$LLAMA_SERVER"
}

# The pinned GGUF pair: our own download first, then the Hugging Face cache.
llama_weights_dir() {
  local dir
  for dir in "$LLAMA_MODEL_DIR" "$LLAMA_HF_SNAPSHOT"; do
    if [ -f "$dir/$LLAMA_GGUF_MODEL" ] && [ -f "$dir/$LLAMA_GGUF_MMPROJ" ]; then
      printf '%s' "$dir"
      return 0
    fi
  done
  return 1
}

cmd_embed_install() {
  local dir
  if dir="$(llama_weights_dir)"; then
    say "the pinned weights are already at $dir"
    return 0
  fi
  cat >&2 <<EOF
This downloads Qwen3-VL-Embedding-2B (Q8_0 GGUF + its mmproj vision tower,
~2.3 GB) from $LLAMA_GGUF_REPO
at revision $LLAMA_GGUF_REVISION, into
  $LLAMA_MODEL_DIR
and checks both files against pinned sha256 digests. Nothing goes into the repo.
EOF
  printf 'Continue? [y/N] ' >&2
  local answer file sum
  read -r answer
  case "$answer" in [yY]*) ;; *) die "cancelled" ;; esac
  mkdir -p "$LLAMA_MODEL_DIR"
  for pair in "$LLAMA_GGUF_MODEL|$LLAMA_GGUF_MODEL_SHA256" "$LLAMA_GGUF_MMPROJ|$LLAMA_GGUF_MMPROJ_SHA256"; do
    file="${pair%%|*}"
    sum="${pair#*|}"
    curl -fL --progress-bar -o "$LLAMA_MODEL_DIR/$file.part" \
      "https://huggingface.co/$LLAMA_GGUF_REPO/resolve/$LLAMA_GGUF_REVISION/$file"
    if [ "$(shasum -a 256 "$LLAMA_MODEL_DIR/$file.part" | cut -d' ' -f1)" != "$sum" ]; then
      rm -f "$LLAMA_MODEL_DIR/$file.part"
      die "$file does not match its pinned sha256; refusing it"
    fi
    mv "$LLAMA_MODEL_DIR/$file.part" "$LLAMA_MODEL_DIR/$file"
  done
  say "installed. Next: $0 embed-up"
}

cmd_embed_up() {
  local bin dir version
  bin="$(llama_server_bin)"
  dir="$(llama_weights_dir)" || die "the pinned weights are not here yet. Run: $0 embed-install"
  mkdir -p "$RUN_DIR"

  version="$("$bin" --version 2>&1 | sed -n 's/.*build \([0-9][0-9]*\).*/b\1/p' | head -1)"
  if [ "$version" != "$LLAMA_BUILD_PINNED" ]; then
    warn "llama-server is ${version:-an unknown build}; $LLAMA_BUILD_PINNED is the build that was measured."
    warn "\`$0 verify\` with OPENAI_COMPAT_EMBEDDING_INPUT=llamacpp-multimodal checks this one."
  fi

  if curl -fsS --max-time 3 "http://127.0.0.1:$LLAMA_EMBED_PORT/health" >/dev/null 2>&1; then
    say "something already answers on :$LLAMA_EMBED_PORT — not starting a second server"
    return 0
  fi

  # llama-server has no auth by default and allows CORS from every origin, so
  # beyond loopback it gets a key, passed by environment (LLAMA_API_KEY) so it
  # never shows in `ps`.
  local key=""
  case "$LLAMA_EMBED_HOST" in
    127.0.0.1|localhost|::1) ;;
    *)
      key="${OPENAI_COMPAT_API_KEY:-}"
      [ -n "$key" ] || die "LLAMA_EMBED_HOST=$LLAMA_EMBED_HOST listens beyond loopback; set OPENAI_COMPAT_API_KEY
  (the same value the actor host sends) so the server demands it."
      ;;
  esac

  say "starting llama-server: Qwen3-VL-Embedding-2B on $LLAMA_EMBED_HOST:$LLAMA_EMBED_PORT"
  LLAMA_API_KEY="$key" nohup "$bin" \
    -m "$dir/$LLAMA_GGUF_MODEL" --mmproj "$dir/$LLAMA_GGUF_MMPROJ" \
    --embedding --pooling last -ngl 99 \
    --host "$LLAMA_EMBED_HOST" --port "$LLAMA_EMBED_PORT" \
    -np 1 -c 4096 -ub 2048 -b 2048 \
    --image-max-tokens "$LLAMA_IMAGE_MAX_TOKENS" --cache-ram 0 \
    >"$RUN_DIR/llama-embed.log" 2>&1 &
  printf '%s' "$!" >"$RUN_DIR/llama-embed.pid"
  say "  log: $RUN_DIR/llama-embed.log (loads in a few seconds; ~3.6 GB resident)"
  say "then: OPENAI_COMPAT_EMBEDDING_INPUT=llamacpp-multimodal OPENAI_COMPAT_EMBEDDING_ENDPOINT=http://localhost:$LLAMA_EMBED_PORT OPENAI_COMPAT_ENDPOINT=http://localhost:11434 OPENAI_COMPAT_MODEL_MEDIUM=gemma3:4b $0 verify"
}

cmd_embed_down() {
  local pidfile="$RUN_DIR/llama-embed.pid" pid
  if [ -f "$pidfile" ]; then
    pid="$(cat "$pidfile")"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null || true
      say "stopped llama-server (pid $pid)"
    else
      say "llama-server (pid ${pid:-?}) was not running"
    fi
    rm -f "$pidfile"
  else
    say "nothing of ours was running"
  fi
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
  [ "$which" = "llama" ] && f="$RUN_DIR/llama-embed.log"
  [ -f "$f" ] || die "no log at $f (try: $0 logs chat)"
  tail -f "$f"
}

# ---------------------------------------------------------------------------

usage() {
  sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
  cat <<'EOF'

Commands
  verify            width, degeneracy and abstention checks against the server
                    (with OPENAI_COMPAT_EMBEDDING_INPUT=llamacpp-multimodal: the
                    llama-server image checks instead of the text-only ones)
  status            is anything answering /v1/models?
  env [llama]       export lines for AI_PROVIDER=openai-compatible
                    (`llama`: Ollama for chat, llama-server for embeddings)
  embed-install     download the pinned Qwen3-VL-Embedding GGUF pair (prompts)
  embed-up          start llama-server for text+image embeddings (:8091)
  embed-down        stop it
  install           create the vLLM venv outside the repo (prompts first)
  up                start vLLM's embedding + chat servers
  down              stop the servers this script started
  logs [embed|chat|llama] tail a server log

`verify`, `status` and `env` work against ANY OpenAI-compatible server — LM
Studio, llama-server, an MLX shim, Ollama's own /v1. Only `install`/`up`/`down`
are vLLM-specific.

Environment
  OPENAI_COMPAT_ENDPOINT             chat base    (default http://localhost:8000)
  OPENAI_COMPAT_EMBEDDING_ENDPOINT   embed base   (default http://localhost:8001)
  OPENAI_COMPAT_MODEL_MEDIUM         chat model
  OPENAI_COMPAT_EMBEDDING_MODEL      embedding model
  OPENAI_COMPAT_EMBEDDING_INPUT      openai (default) or llamacpp-multimodal
  AI_EMBEDDING_DIMENSIONS            expected width (default 768)
  CELLAR_VLLM_VENV                   venv path (default ~/.cache/cellar-assistant/vllm)
  LLAMA_SERVER                       llama-server binary (default: on PATH)
  LLAMA_EMBED_HOST / LLAMA_EMBED_PORT  where embed-up listens (127.0.0.1:8091)
  CELLAR_LLAMA_MODEL_DIR             where embed-install puts the weights
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
    embed-install) cmd_embed_install "$@" ;;
    embed-up) cmd_embed_up "$@" ;;
    embed-down) cmd_embed_down "$@" ;;
    up)      cmd_up "$@" ;;
    down)    cmd_down "$@" ;;
    logs)    cmd_logs "$@" ;;
    ""|-h|--help|help) usage ;;
    *) printf 'unknown command: %s\n\n' "$cmd" >&2; usage; exit 2 ;;
  esac
}

main "$@"
