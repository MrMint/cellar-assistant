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

### Narrowed search (X12)

Universal search asks for `itemSearch(narrow: true)`: when some hit's name
matches the phrase at `ITEM_SEARCH_NARROW_STRONG_NAME` (0.6) or better, only
the hits whose names match at the lexical threshold (0.5) and the vector-only
hits within `ITEM_SEARCH_NARROW_DISTANCE_GAP` (0.03) of the nearest strong name
hit are kept (`narrowToNamed`). The eval runs every query both ways and
reports `narrowed`; `baseline.json` guards its hit@1, recall@10 and the
irrelevant-hit count.

| When | Tree | narrowed queries | hit@1 | recall@10 | irrelevant hits (all 49 queries) | irrelevant hits (the narrowed queries) | unrelated left (name < 0.5) |
|---|---|---|---|---|---|---|---|
| 2026-10-09 | X12, `nomic-embed-text` | 29 / 49 (10 name, 4 typo, 12 sibling, 2 brand, 1 semantic) | 97.96% (= plain) | 100% (= plain) | 389 → 172 | 241 → 24 | 3 |

The 24 left in the narrowed queries are mostly the named item's siblings by
name (Lagavulin 8 and Distillers Edition for "lagavulin 16"), which the
labels count as wrong answers and a person scanning for the bottle does not.
The three unrelated ones: Cantillon Kriek for "kbs" (+0.020 from Founders KBS)
and Monkey 47 and Tanqueray Ten for "hendricks gin" (gins, within 0.03 of Hendrick's
Orbium). Narrowing never fires on the 16 descriptive queries but one ("pinot
noir wine", where every name says it) and the producer queries whose names do
not say it ("antinori", "russian river").

How the two numbers were chosen (a sweep over the same run's hits, every
combination of strong 0.6–1.0, gap 0.02–0.15 and an optional absolute cap of
0.40–0.50): no setting lost a relevant hit — a producer's other bottles sit
within 0.011 of the named one ("buffalo trace": E.H. Taylor −0.012, Eagle Rare
17 +0.011) — so the choice is how much padding survives.

- **Strong 0.6, not higher:** it is what lets a typo narrow ("blantons" against "Blanton's" 0.70,
  "veuve cliquot" 0.71); at 0.8 only exact names do and 29 narrowed queries
  become 20. Not lower: "wheated bourbon" scores 0.50 against
  "Buffalo Trace … Bourbon", and narrowing it would drop the wheated bourbons
  the vector found (Maker's Mark is lexically 0).
- **Gap 0.03, relative:** unrelated hits left 1 at 0.02, 3 at 0.03, 6 at
  0.05, 28 at 0.10. 0.02 leaves only 0.009 of headroom over Eagle Rare 17;
  0.03 leaves 0.019 for the price of two gins under "hendricks gin". An absolute
  cap (0.45) would also have dropped KBS's neighbour, but absolute distances
  are the embedding model's, not the catalog's — re-measure before relying on
  one with `gemini-embedding-2`.

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
