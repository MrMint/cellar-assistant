# Local AI provider — the findings that still bind

**What this is.** The residue of a 802-line research document (`V1`, 2026-09-12) that asked
whether `Qwen3-VL-Embedding-2B` could restore image search and whether vLLM should serve it.
**Both questions have since been decided, twice**, so the argument is gone and the
*measurements* are what is left. Trimmed 2026-09-19; the full original is in git history at
`3f85fbc2` and earlier.

**Section numbers are the original ones and the gaps are deliberate** — `e4-decisions.md` §12
and `scripts/ai/local-model.sh` cite sections of this file by number, and renumbering would
silently break them. Nothing here has been reworded.

## What was decided, so you don't re-argue it

- **Deployed runs the Gemini models on Vertex AI (GCP); local dev runs a local model on the
  Mac.** Settled by the user 2026-09-17, recorded in `e4-decisions.md` §12 and
  `deploy-loki.md` §2.7. This closed §9 ("what hardware is Loki?") by routing around it: no
  model is served on Loki at all.
- **The provider was built to an OpenAI-compatible contract, not to vLLM** —
  `services/actors/src/lib/ai/openai-compatible.ts`, selected by
  `AI_PROVIDER=openai-compatible`. `llama-server`, LM Studio, an MLX shim, Ollama's `/v1` and
  api.openai.com are all the same provider with a different base URL.
- **The original recommendation against vLLM on the Mac was overruled, then revised again**
  toward llama-server/LM Studio. That is why the comparison chapters (§7 vLLM-vs-MLX-vs-
  llama.cpp, §11 recommendation) are gone: they argue a question answered in both directions.
- **`AI_PROVIDER=ollama` remains the default** in `infra/.env.example` and is what the
  acceptance suite runs against.

**Still open, and still as described below:** §8.6 (image search needs `Embedder` widened past
`{ text }`), and whether image search justifies a 2 B model on the text path at all. The
provider does not commit to Qwen for *deployed* vectors — Vertex deploys, and its
`gemini-embedding-2` (since 2026-09-28; was `text-embedding-005`) is asked for 768 through
`outputDimensionality`. It is multimodal too: since `f3b5db81` `EmbeddingRequest.images` carries
up to six images into one vector, and since `09e5b0c9` an item's *document* vector is embedded with
its label and display images. Searching *by* an image (§8.6) still needs the query side widened.
*(2026-10-05: it has been, and locally through llama-server too — see the update at §8.6.)*

---

## 4. `Qwen3-VL-Embedding-2B`, measured on this Mac

Retained because these are the numbers anyone adopting a multimodal embedding model would
otherwise have to re-measure. Six categories is a **directional** result, not a recall
benchmark.

### 4.1 Shared space — measured, not assumed

Cosine similarity, text × image, full 2048-d, six categories (wine, beer, coffee, spirit,
sake, tea). **Cross-modal top-1: 6/6.** Mean diagonal 0.5147, mean off-diagonal 0.2612,
**margin 0.2535**. The diagonal wins every row and the confusions that exist are the sensible
ones — wine↔spirit 0.42, sake↔spirit 0.40, bottles that look alike. (The full matrix is in git.)

A held-out query never used to build the matrix — *"a bottle of Cabernet Sauvignon red wine from
Napa Valley"* — scored against the six **images**: wine **0.5169**, spirit 0.3014, coffee 0.2267,
sake 0.2389, beer 0.1500, tea 0.0236. Correct image, clear margin.

That is text→image retrieval in one space. **The requirement is met**, and it is exactly what
image search needs.

### 4.2 Dimension, and whether 768 survives truncation

`NATIVE_DIM 2048`, as the card and `1_Pooling/config.json` say. Output vectors arrive
**already L2-normalised** (measured norm 1.0017 / 1.0002 — the drift is bf16).

Truncating to the first 768 components **and re-normalising**:

|  | full 2048 | truncated 768 |
|---|---|---|
| Cross-modal top-1 | 6/6 | **6/6** |
| Mean diagonal | 0.5147 | 0.5243 |
| Mean off-diagonal | 0.2612 | 0.2776 |
| Separation margin | 0.2535 | **0.2467** |

- **Top-1 agreement between full and truncated rankings: 1.000**
- **Pearson correlation of the two full similarity matrices: 0.9763**

**768 is viable by truncation.** Margin loss is ~3% relative on this set. Re-normalisation after
the slice is mandatory — a truncated vector is no longer unit length, and every index here is
`halfvec_cosine_ops`.

> Caveat, stated plainly: six categories is a *directional* result, not a recall benchmark. It
> proves the space is shared and that 768 does not collapse it. It does not measure recall@k on a

---

## 6. Serving it locally — the two findings that outlived the choice of server

### 6.4 The honest part: it is CPU-only here, and the vision path is slow

Confirmed from the engine log: a **CPU** engine, `dtype=float16` (macOS CPU has no bf16),
chunked prefill disabled for ARM, no Triton, no FlashAttention, Torch SDPA backend. No Metal.

**Text embedding on vLLM/CPU was 95 ms/text — actually faster than the 226 ms/text I measured
through `transformers` on MPS**, because vLLM batches and schedules well and these prompts are
short. That was the surprise of the exercise.

**Image embedding is where it falls apart.** Measured, same six images, same machine:

| | per image | 6 images |
|---|---|---|
| `transformers` + **MPS** (bf16) | **1.16 s** | 6.98 s |
| **vLLM CPU** (fp16) | **52.4 s** | ~4 min 21 s (est.) |

**~45× slower on the image path**, at 890 % CPU (≈9 cores) and 8.9 GB RSS with the GPU idle.
The reason is structural: Qwen3-VL uses dynamic resolution, so a 1024×1024 photo becomes a large
number of image tokens, and that prefill runs on CPU with no chunked prefill and no Metal. Note
the shape — vLLM CPU *beats* MPS on short text (95 ms vs 226 ms) and loses catastrophically on
images: text embedding is bandwidth-bound on a tiny sequence, image embedding compute-bound on a
long one, where having no GPU decides it.

So: **vLLM on this Mac is a functional correctness environment, not a performance one.** You can
develop against it and prove the wire format. You should not expect to embed a photo library with
it.


### 6.6 A silent correctness bug: **vLLM's default prefix caching corrupts embeddings**

This is the most important operational finding in this document, and it was not something I went
looking for.

The vLLM run scored **5/6** on the cross-modal test where `transformers`+MPS scored 6/6. The "tea"
text vector was degenerate — cosine ≈ 0.00 against *every* image, and against every other text.

Chasing it down, comparing each vLLM vector against the sentence-transformers vector for the same
caption:

| category | ST vs vLLM (**prefix caching ON**, default) | ST vs vLLM (**prefix caching OFF**) |
|---|---|---|
| wine | 0.9998 | 0.9998 |
| beer | 0.9998 | 0.9998 |
| coffee | 0.9998 | 0.9998 |
| spirit | **0.7486** | 0.9998 |
| sake | **0.6975** | 0.9998 |
| tea | **-0.0016** | 0.9998 |

**With `enable_prefix_caching=False`, all six agree with sentence-transformers at 0.9998.**
With it on — which is vLLM's **default**, logged at startup as `(Enabling) prefix caching by
default` — the batch degrades progressively: the first three requests are exact, then accuracy
decays, and the sixth is pure noise.

Things I ruled out along the way, so nobody repeats the work:

- **Not a dtype problem.** `float32` reproduces the corruption *identically* to `float16`
  (tea: `min=-0.2618 max=0.4811` in fp32 vs `min=-0.2619 max=0.4817` in fp16). My first hypothesis
  was fp16 activation overflow from the forced bf16→fp16 cast. **It was wrong.**
- **Not a prompt-format problem.** The model card builds the system message as a list
  (`content: [{type:"text", text: instruction}]`); I had used a bare string. Both render to a
  byte-identical chat template — verified with `apply_chat_template`.
- **It is the shared prefix.** All six prompts share a long common prefix (the system instruction
  plus the user header), which is exactly what prefix caching deduplicates on the CPU backend.

Why this matters here more than usual: **the corrupted vectors are unit-norm, contain no NaN and
no inf, and arrive with no error.** A 768-slice of one would insert into `halfvec(768)` happily and
sit in an HNSW index being silently wrong — the precise failure mode `embeddings.ts` refuses to
tolerate for zero vectors, and the same class as the Wisconsin mock that `config.ts` is written
against.

**Mandatory for any vLLM embedding deployment:**

1. **Serve pooling models with prefix caching disabled** (`--no-enable-prefix-caching`) until it is
   proven correct on the target backend and version, and pin the vLLM version.
2. **Add an acceptance check that does not trust the server.** Embed a fixed set of phrases, assert
   pairwise cosines against recorded values from a reference implementation. This would have caught
   it in one run; nothing else here would have caught it at all.
3. This was observed on **vLLM 0.11.0, CPU backend, macOS arm64**. It may not reproduce on CUDA —
   but the check in (2) costs little and the failure is invisible without it.

---


---

## 8. What any provider must implement

### 8.3 The thing that will bite: **one vLLM server serves one model**

`AIProvider` requires *both* `generateContent` (a multimodal chat model, for the four vision seams)
*and* `generateEmbeddings` (the embedding model). Ollama serves many models from one daemon, so
`OllamaConfig` needs exactly one `endpoint`. **vLLM does not** — `vllm serve <model>` is one model
per server process.

So such a provider needs **two endpoints** (one pooling server, one chat VLM). This is why
`openai-compatible.ts` has `OPENAI_COMPAT_ENDPOINT` and `OPENAI_COMPAT_EMBEDDING_ENDPOINT`, the
second defaulting to the first, so only a one-model-per-process server pays for that design.

This is the biggest structural difference from every existing provider and the decision most worth
making consciously. Two sane alternatives if running two servers is unattractive:

- **An embeddings-only `vllm` provider is not expressible** under the current contract — the
  interface demands both methods. If the goal is *only* to restore image search, the cheaper change
  may be to leave `AI_PROVIDER=ollama` and give the embedder seam its own configuration, rather
  than to add a fourth provider at all. That is a design decision for the implementing agent, and
  it is worth weighing seriously: **the feature that is lost is image *embedding*, not image
  *chat*** — the four vision seams already work through ollama's `gemma3:4b`.
- Or accept two servers and document the pair in `infra/.env.example`.



### 8.5 Structured output — the `required` hazard carries over exactly

`prompts.ts` records a measured bug worth restating, because it applies to vLLM identically:

> A grammar-level `required` is not a request, it is a compulsion — the decoder *cannot* end the
> object without emitting those keys, so "I could not read a vintage" becomes structurally
> unsayable and the model emits a plausible year instead. Measured: adding the bag to `required`
> turned an empty answer into `{"vintage":"2005","style":"SPARKLING"}` for a wine that does not
> exist.

**vLLM's structured output backends have the same property.** The install pulled
`xgrammar==0.1.25`, and the engine config shows
`structured_outputs_config=StructuredOutputsConfig(backend='auto', …)`. xgrammar, outlines and
llguidance all compile a JSON Schema — including its `required` list — into a decoding grammar
that constrains sampling. There is **no** vLLM backend for which `required` is advisory.

So: the existing discipline in `prompts.ts` (nothing in the attribute bag is `required`, including
`NOT NULL` columns; `enum`s built from live reference tables) transfers unchanged and must be
preserved. The provider should pass `request.schema` through vLLM's structured-output field
(`response_format: {type: "json_schema", …}` or `guided_json`) — the direct analogue of the
`format` field `ollama.ts` passes — and must **not** flatten the schema into prose.

One extra caution specific to vLLM: `backend='auto'` picks a backend per request. Pin it
explicitly if you want the grammar semantics to be reproducible across versions.



### 8.6 Restoring image search needs one more change, beyond the provider

> **Update 2026-10-05: done, on both halves.** G32 (`1dcc0987`) widened the seam —
> `EmbeddingRequest.type: "image"`, `ImageEmbedder`, `item_image_vectors` — for
> `gemini-embedding-2`. The local half is `OPENAI_COMPAT_EMBEDDING_INPUT=llamacpp-multimodal`:
> llama.cpp's `llama-server` (b11433) serving Qwen3-VL-Embedding-2B (community Q8_0 GGUF +
> mmproj, `mradermacher/Qwen3-VL-Embedding-2B-GGUF@bf4d4a26`), reached through
> `openai-compatible` with llama-server's own `{prompt_string, multimodal_data}` input, Qwen's
> chat template, and the per-start media marker read from `/props`. Measured on the M4 Pro
> against Qwen's own transformers code on MPS: mean cosine 0.9986 text / 0.994 image / 0.995
> fused at full resolution; retrieval 9/9 text→image, 9/9 text→document, 4/4 image→image,
> 4/4 image→document, at 2048 and at 768 (Matryoshka); ~1.0 s per image at
> `--image-max-tokens 576`, 30–50 ms per text, 3.6 GB RSS; vectors bit-identical across server
> restarts. `services/actors/README.md` ("Local image embeddings") has the setup. What follows
> is the original analysis, kept for the reasoning.

A provider alone is **not sufficient**. The embedder seam is text-only at both ends —
`Embedder = (input: { readonly text: string }) => Promise<readonly number[]>` in
`services/actors/src/lib/embeddings.ts`, and `providerEmbedder` in `seams.ts` calls
`generateEmbeddings({ content: text, type: "text", … })`. *(Since `811cad82` the `Embedder` also
takes a second `ctx` argument, so the model call can be charged to `BudgetActor`; the input is
still `{ text }` only, so this section's conclusion stands.)*

To embed an image you must widen `Embedder` (e.g. `{ text: string } | { imageFileId: string }`)
and `providerEmbedder` with it. Note also that `EmbeddingRequest.content` is typed `string`, so
image bytes must either be base64 in `content` or the type must widen to `Uint8Array` — the
`GenerateContentRequest.images?: readonly Uint8Array[]` field is the existing precedent.

The good news is that the loading half already exists: `images.ts` exports
`ImageLoader = (ctx, fileIds) => Promise<Uint8Array[]>` with `daprImageLoader`, a 20 MB cap and
presign+download timeouts, and `installSeams` already threads it into the four vision seams. An
image-search endpoint would reuse it directly.

The fix belongs on the server, and `migration-plan.md` says why: `itemSearch(vector:)` would
need an embedding the *client* holds, and A7f deliberately keeps `EmbeddingActor` unexposed
because a public embed endpoint reopens a known hole. **Whatever is built must keep
`EmbeddingActor` unexposed.**


---


---

## 9. Loki's hardware — **ANSWERED, do not re-open**

Nothing is served on Loki. Deployed AI is Gemini on Vertex AI. See the header and
`e4-decisions.md` §12.

---

## 10.3 The check that catches §6.6

Whatever serves embeddings, assert against known-good values before trusting it. With prefix
caching off, vLLM agrees with sentence-transformers at **0.9998** on all six of these; with it on,
`spirit`/`sake`/`tea` came back at 0.75 / 0.70 / **-0.00**:

```
"a bottle of red wine", "a glass of beer", "a cup of coffee",
"a bottle of whiskey spirits", "a bottle of Japanese sake", "a cup of tea"
```

A cheap, model-agnostic version of the same guard: every embedding a provider returns should have
**‖v‖ ≈ 1** and **max|component| well under ~0.15** for this model. The corrupted `tea` vector was
still unit-norm but had `max=0.4811` — a 4× outlier. That single assertion would have caught it.
