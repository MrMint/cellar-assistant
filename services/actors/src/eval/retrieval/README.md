# Retrieval and menu-match eval (roadmap N05)

A fixed, seeded catalog and a labelled question set, so a claim that search or
menu matching got "better" is a number with a denominator rather than an
anecdote taken against whatever the development database held that day.

| File | What |
|---|---|
| `catalog.ts` | The target items the queries and menus are about. |
| `distractors.ts` | Hard negatives: siblings (Lagavulin 8 beside 16), same-house products, same-description products. |
| `queries.ts` | 49 search queries in five groups: `name`, `typo`, `sibling`, `brand`, `semantic`. |
| `menus.ts` | 10 menus as OCR text, 61 lines, each labelled with the extractor's fields and its expected item — or `null` for 11 lines that are deliberately not in the catalog. |
| `metrics.ts` | hit@k, recall@k, MRR; menu match rate, candidate recall, auto precision, false matches; the baseline comparison. Pure and unit-tested. |
| `seed-testing.ts` | Writes the catalog through `itemInsertValues`, brands through `item_brands`. |
| `retrieval-eval.live.test.ts` | The harness: seeds, embeds every item as `regenerateVector` would, then drives `ItemSearchActor` and `MenuMatchJobActor` over it. |
| `baseline.json` | The numbers a run is held to. |

## Running it

```bash
ollama serve && ollama pull nomic-embed-text      # once
bun run --filter @cellar-assistant/actors eval:retrieval
```

It needs the test database `test-db.sh` builds (as every actors suite does) and an
Ollama daemon with `nomic-embed-text`; without the daemon it **skips**, so CI is
unaffected. It also runs as part of the ordinary actors suite when a daemon is up,
and fails if a guarded metric falls below `baseline.json`.

- `RETRIEVAL_EVAL_OUT=<file>` writes the full result (every ranking) as JSON.
- `RETRIEVAL_EVAL_VERIFIER=model` uses the real menu-match verifier through
  Ollama's generation model instead of the stand-in, which accepts the first
  candidate offered. The stand-in is the default because it makes the menu numbers
  a deterministic score of retrieval and ordering; the baseline is not enforced in
  model mode.
- `OLLAMA_ENDPOINT` points it at another daemon.

To re-record the baseline, run with `RETRIEVAL_EVAL_OUT`, copy the guarded numbers
into `baseline.json`, and add a row below saying what changed.

## History

All rows: `ollama:nomic-embed-text@768`, 158 items, 49 queries, 61 menu lines,
stand-in verifier unless stated. Three consecutive runs of the final tree gave
identical numbers; one earlier run differed by a single sibling query, so treat
a one-query move (2.0 points of hit@1, 7.1 of sibling hit@1) as noise.

| When | Tree | hit@1 | hit@3 | recall@10 | MRR | brand recall@10 | sibling hit@1 | semantic hit@1 | menu match | candidate recall | auto (precision) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-07 | **Before N08**: vector search only; the embedded text spells vocabulary codes and camelCase keys, no brand | 95.9% | 98.0% | 96.6% | 0.972 | 58.3% | 92.9% | 100% | 92.0% | 98.0% | 4 (100%) |
| 2026-10-07 | ablation: old text, vector only, N08's auto rule | 95.9% | 98.0% | 96.6% | 0.972 | 58.3% | 92.9% | 100% | 92.0% | 98.0% | 2 (100%) |
| 2026-10-07 | ablation: N08 text (labels, brand), vector only | 98.0% | 100% | 100% | 0.990 | 100% | 92.9% | 100% | 92.0% | 98.0% | 1 (100%) |
| 2026-10-07 | ablation: old text, N08 hybrid ranking | 95.9% | 98.0% | 96.6% | 0.969 | 58.3% | 100% | 93.8% | 96.0% | 100% | 4 (100%) |
| 2026-10-07 | **After N08** (`baseline.json`): text v2 + hybrid ranking + separated auto winner | 98.0% | 100% | 100% | 0.986 | 100% | 100% | 93.8% | 96.0% | 100% | 3 (100%) |

What moved what:

- **The embedded text** (labels, values as words, brand) is the whole brand
  gain: "antinori" found nothing of Antinori's before, because Tignanello's
  text never said it.
- **The trigram name arm** fixes the sibling the vector put first wrongly
  ("kenya aa" → Kenya AB) and two menu lines (Macallan 12 Sherry Cask vs
  Double Cask, Kenya AA). Two other lines — Jameson vs Jameson Black Barrel,
  Woodford Reserve vs Double Oaked — went wrong under the new text while the
  name arm ranked on hair-width whole-string differences; name scores within
  0.05 now share a rank so the vector decides between them. Its cost is one
  descriptive query: "wheated bourbon" also matches names containing
  "Bourbon", and Buffalo Trace edges Maker's Mark out of first place (still
  in the top 3).
- Still missed: Caymus 2021 (the vintage is only in the vector text, and the
  Special Selection 2019 sits 0.012 nearer) and "Hendricks" (Orbium vs the
  standard gin: the name cannot tell, and the vector prefers Orbium).
- **The auto rule.** The new text raises nomic's similarities, and without a
  separation rule a 2019 Caymus Special Selection was auto-suggested (0.902)
  for a menu's "Caymus Cabernet Sauvignon 2021", the right bottle 0.012 behind:
  auto precision fell to 75% (3/4). Auto now needs every close runner-up
  separated by the vector (≥ 0.05) or by the name (≥ 0.1), so that line goes to
  the verifier.

### With the real verifier (`RETRIEVAL_EVAL_VERIFIER=model`, Ollama `gemma3:4b`)

| When | Tree | menu match | candidate recall | false suggestions | verifier errors |
|---|---|---|---|---|---|
| 2026-10-07 | Before N08 | 14.0% | 98.0% | 0 / 11 | 0 |
| 2026-10-07 | After N08 | 12.0% | 100% | 0 / 11 | 0 (one earlier run aborted on one, before the eval counted them) |

**This is where "1–2 of 8 matched" comes from, and it is not retrieval.** The
right item is among the three candidates offered 98% of the time, and the local
verifier accepts it 14% of the time — it answers "none" for nearly every line,
including exact names. It also sometimes answers with a product name instead of a
candidate key, which the seam refuses (`ConflictError`, retried by the outbox).
After N08 the right item is offered every time, and the match rate moves by one
line — the stricter auto rule sends one more line to a verifier that rejects it.
The verifier prompt and model choice are a follow-up, not N08; this eval is how
to judge one.

Not recorded yet: a Gemini (`gemini-embedding-2`) baseline — no Vertex or Google
AI credentials were available where this was built. The harness takes any
provider `readAIProviderConfig` accepts; only the reachability probe is
Ollama-specific.
