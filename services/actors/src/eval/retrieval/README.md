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
| `seed.ts` | Writes the catalog through `itemInsertValues`, brands through `item_brands`. |
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

All runs: `ollama:nomic-embed-text@768`, stand-in verifier, 158 items.

| When | Change | hit@1 | hit@3 | recall@10 | MRR | brand recall@10 | sibling hit@1 | menu match | candidate recall |
|---|---|---|---|---|---|---|---|---|---|
| 2026-10-07 | Baseline: vector search only; embedded text spells vocabulary codes and camelCase keys, no brand | 95.9% | 98.0% | 96.6% | 0.972 | 58.3% | 92.9% | 92.0% | 98.0% |

Not recorded yet: a Gemini (`gemini-embedding-2`) baseline — no Vertex or Google
AI credentials were available where this was built. The harness takes any
provider `readAIProviderConfig` accepts; only the reachability probe is
Ollama-specific.
