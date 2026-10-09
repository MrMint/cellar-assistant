/**
 * The retrieval and menu-match eval (roadmap N05), run against a live
 * embedding model.
 *
 * It seeds the fixture catalog (`catalog.ts`) into a rolled-back transaction,
 * embeds every item by calling the real `ItemActor.regenerateVector` with only
 * its model call pointed at Ollama (`RETRIEVAL_DOCUMENT`), and then drives the
 * real actors over it:
 *
 *  - **search** — `ItemSearchActor.all` for each of `queries.ts`, scored by
 *    hit@k, recall@k and MRR (`metrics.ts`);
 *  - **menu matching** — each of `menus.ts` written as a `menu_scans` row and
 *    its `place_menu_items`, then `MenuMatchJobActor` started and run to
 *    completion, with `ItemSearchActor` in-process behind its searcher seam.
 *
 * ## Skips cleanly
 *
 * Like `lib/ai/ollama.live.test.ts`, it runs only when an Ollama daemon is
 * reachable with `nomic-embed-text` pulled (`OLLAMA_ENDPOINT`, default
 * `http://localhost:11434`). CI and a machine without one skip it.
 *
 * ## The verifier
 *
 * The job asks a model to choose among the candidates in the 0.4–0.9 band.
 * By default this eval swaps in a stand-in that **accepts the first candidate
 * offered**, so the menu numbers score the retrieval and the job's ordering,
 * deterministically, rather than a generation model's mood. Set
 * `RETRIEVAL_EVAL_VERIFIER=model` to use the real verifier through Ollama's
 * generation model instead (slower; `candidateRecall` is its ceiling).
 *
 * ## Baseline
 *
 * `baseline.json` beside this file is the last recorded run. A run that falls
 * below it on a guarded metric fails (`regressions` in `metrics.ts`) — the
 * point of N05 is that "better" is a number. Re-record deliberately with
 * `RETRIEVAL_EVAL_OUT=<path>` and copy the summary in, saying why in the
 * commit. `README.md` keeps the history.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type {
  Ctx,
  ItemSearchInput,
  RecordSuggestionsInput,
} from "@cellar-assistant/contracts";
import {
  itemActorId,
  itemSearchActorId,
  systemCtx,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import { ItemActor } from "../../actors/item-actor.ts";
import { ItemSearchActor } from "../../actors/item-search-actor.ts";
import { MenuMatchJobActor } from "../../actors/menu-match-job-actor.ts";
import { readAIProviderConfig } from "../../lib/ai/config.ts";
import { providerFor } from "../../lib/ai/factory.ts";
import { providerMenuMatchVerifier } from "../../lib/ai/seams.ts";
import type { DbOrTx } from "../../lib/db.ts";
import type { EmbedDocument } from "../../lib/embedding-client.ts";
import type { MenuMatchVerifier } from "../../lib/menu-ai.ts";
import type { MenuSearcher } from "../../lib/menu-matching.ts";
import { seedPlace } from "../../lib/search-testing.ts";
import {
  activate,
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  testDelivery,
  withTestDb,
} from "../../lib/testing.ts";
import { embeddingModelKey } from "../../lib/vectors.ts";
import { CATALOG } from "./catalog.ts";
import { MENUS } from "./menus.ts";
import type {
  GuardedBaseline,
  MenuLineOutcome,
  MenuSummary,
  NarrowingSummary,
  RankedQuery,
  SearchSummary,
} from "./metrics.ts";
import {
  regressions,
  summariseMenus,
  summariseNarrowing,
  summariseSearch,
} from "./metrics.ts";
import type { QueryKind } from "./queries.ts";
import { QUERIES } from "./queries.ts";
import type { SeededCatalog } from "./seed-testing.ts";
import { seedCatalog } from "./seed-testing.ts";

const ENDPOINT = process.env.OLLAMA_ENDPOINT ?? "http://localhost:11434";

const reachable = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${ENDPOINT}/api/tags`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { models?: { name?: string }[] };
    return (body.models ?? []).some((model) =>
      (model.name ?? "").startsWith("nomic-embed-text"),
    );
  } catch {
    return false;
  }
};

const skip = !(await reachable());
if (!skip) await resolveTestDatabase();

const config = readAIProviderConfig({
  AI_PROVIDER: "ollama",
  OLLAMA_ENDPOINT: ENDPOINT,
});
const provider = providerFor(config);
const MODEL_KEY = embeddingModelKey({
  provider: "ollama",
  model: config.embeddingModel,
  dimensions: 768,
});

/** One model call per distinct (purpose, text): queries repeat across menus. */
const cache = new Map<string, Promise<readonly number[]>>();
const embed = (
  text: string,
  purpose: "query" | "document",
): Promise<readonly number[]> => {
  const key = `${purpose}\u0000${text}`;
  let pending = cache.get(key);
  if (pending === undefined) {
    pending = provider
      .generateEmbeddings({
        content: text,
        type: "text",
        taskType:
          purpose === "document" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY",
      })
      .then((result) => result.embeddings);
    cache.set(key, pending);
  }
  return pending;
};

const daprClient = (): DaprClient =>
  new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" });

const searchActor = (db: DbOrTx, input: ItemSearchInput): ItemSearchActor =>
  new ItemSearchActor(
    daprClient(),
    new ActorId(itemSearchActorId(input, null)),
    db,
    async (_ctx, text) => embed(text, "query"),
  );

/**
 * Every item's vector, made by the real `ItemActor.regenerateVector` — its
 * text (`embeddingTextFor`, brands looked up as it looks them up), its write
 * and its identity columns — with only the model call routed to Ollama. So
 * the eval measures what production would store, not a copy of it.
 */
const seedVectors = async (db: DbOrTx, seeded: SeededCatalog) => {
  const embedDocument: EmbedDocument = async (_ctx, input) => ({
    vector: await embed(input.text, "document"),
    model: MODEL_KEY,
  });
  for (const item of seeded.items) {
    const actor = await activate(
      new ItemActor(
        daprClient(),
        new ActorId(itemActorId(item.ref)),
        db,
        async () => {
          throw new Error("the eval verifies no files");
        },
        embedDocument,
      ),
    );
    const result = await actor.regenerateVector(systemCtx("eval-embed"));
    if (result.skipped) throw new Error(`${item.entry.key} was not embedded`);
  }
};

/* -------------------------------------------------------------------------- */
/* Search                                                                      */
/* -------------------------------------------------------------------------- */

/** One query's answer, with each hit's two scores (for tuning, in the output). */
type SearchRun = RankedQuery & {
  readonly kind: QueryKind;
  readonly hits: readonly {
    readonly key: string;
    readonly distance: number | null;
    readonly lexical: number | null;
  }[];
};

const runSearch = async (
  db: DbOrTx,
  ctx: Ctx,
  seeded: SeededCatalog,
  narrow = false,
): Promise<SearchRun[]> => {
  const out: SearchRun[] = [];
  for (const query of QUERIES) {
    const input: ItemSearchInput = {
      text: query.text,
      itemTypes: query.itemTypes ?? null,
      limit: 10,
      ...(narrow ? { narrow: true } : {}),
    };
    const hits = await searchActor(db, input).all(ctx, input);
    out.push({
      id: query.id,
      kind: query.kind,
      relevant: query.relevant,
      ranked: hits.map((hit) => seeded.keyOf.get(hit.id) ?? `?${hit.id}`),
      hits: hits.map((hit) => ({
        key: seeded.keyOf.get(hit.id) ?? `?${hit.id}`,
        distance: hit.distance,
        lexical: hit.lexicalSimilarity ?? null,
      })),
    });
  }
  return out;
};

/* -------------------------------------------------------------------------- */
/* Menu matching                                                               */
/* -------------------------------------------------------------------------- */

const seedScan = async (
  db: DbOrTx,
  userId: string,
  placeId: string,
): Promise<string> => {
  const { rows } = await db.execute<{ id: string }>(sql`
    insert into public.files (key) values (${`menus/${crypto.randomUUID()}.jpg`})
    returning id
  `);
  const id = crypto.randomUUID();
  await db.execute(sql`
    insert into public.menu_scans
      (id, user_id, original_image_id, place_id, processing_status)
    values (${id}::uuid, ${userId}::uuid, ${rows[0]?.id ?? null}::uuid,
            ${placeId}::uuid, 'completed')
  `);
  return id;
};

const standInVerifier: MenuMatchVerifier = async (_ctx, request) => {
  const first = request.candidates[0];
  return {
    acceptedKey: first?.key ?? null,
    confidence: first?.similarity ?? 0,
    reasoning: "retrieval eval stand-in: accepts the first candidate",
    model: "eval-stand-in",
  };
};

/** Verifier answers the seam refused, in `RETRIEVAL_EVAL_VERIFIER=model`. */
const verifierErrors: string[] = [];

const runMenus = async (
  db: DbOrTx,
  userId: string,
  seeded: SeededCatalog,
): Promise<MenuLineOutcome[]> => {
  const searcher: MenuSearcher = {
    searchItems: (ctx, input) => searchActor(db, input).all(ctx, input),
    searchRecipes: async () => {
      throw new Error("the eval's menus have no cocktail lines");
    },
  };
  const inner =
    process.env.RETRIEVAL_EVAL_VERIFIER === "model"
      ? providerMenuMatchVerifier(() => provider)
      : standInVerifier;
  const offered = new Map<string, readonly string[]>();
  const verify: MenuMatchVerifier = async (ctx, request) => {
    // A candidate key is `candidateKey`'s `<TYPE>:<uuid>`; the eval speaks
    // fixture keys.
    offered.set(
      request.placeMenuItemId,
      request.candidates.map((candidate) => {
        const id = candidate.key.slice(candidate.key.indexOf(":") + 1);
        return seeded.keyOf.get(id) ?? `?${candidate.key}`;
      }),
    );
    try {
      return await inner(ctx, request);
    } catch (error) {
      // The real verifier can answer with something that is not a key (a
      // product name, measured with gemma3:4b); the seam refuses it and in
      // production the outbox retries the batch. Here it is counted and the
      // line scored as unmatched, so one bad answer does not void the run.
      verifierErrors.push(
        `${request.menuItemName}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        acceptedKey: null,
        confidence: 0,
        reasoning: "verifier error",
        model: "eval",
      };
    }
  };
  const recorded: RecordSuggestionsInput[] = [];

  const placeId = await seedPlace(db, {
    name: "Retrieval Eval Bar",
    lng: -122.4194,
    lat: 37.7749,
  });
  const lineOf = new Map<string, (typeof MENUS)[number]["lines"][number]>();
  for (const menu of MENUS) {
    const scanId = await seedScan(db, userId, placeId);
    for (const line of menu.lines) {
      const { rows } = await db.execute<{ id: string }>(sql`
        insert into public.place_menu_items
          (place_id, menu_scan_id, menu_item_name, menu_item_description,
           detected_item_type, search_name)
        values (${placeId}::uuid, ${scanId}::uuid, ${line.name},
                ${line.description ?? null}, ${line.detectedType},
                ${line.searchName})
        returning id
      `);
      const id = rows[0]?.id;
      if (id === undefined) throw new Error(`menu line ${line.id} not written`);
      lineOf.set(id, line);
    }
    const job = new MenuMatchJobActor(
      daprClient(),
      new ActorId(crypto.randomUUID()),
      db,
      searcher,
      verify,
      async (_ctx, menuScanId, input) => {
        recorded.push(input);
        return {
          menuScanId,
          replaced: 0,
          created: input.suggestions.length,
          itemsMatched: 0,
        };
      },
    );
    await job.onActivate();
    await job.start(testDelivery(`start-${menu.id}`), { menuScanId: scanId });
    for (let batch = 0; ; batch += 1) {
      const outcome = await job.runBatch(testDelivery(`${menu.id}-${batch}`), {
        batch,
      });
      if (!outcome.ran || outcome.done) break;
    }
  }

  const keyOfTarget = (
    target: RecordSuggestionsInput["suggestions"][number]["target"],
  ) =>
    target.kind === "ITEM"
      ? (seeded.keyOf.get(target.item.id) ?? `?${target.item.id}`)
      : `RECIPE:${target.recipeId}`;

  return [...lineOf.entries()].map(([menuItemId, line]) => {
    const suggestions = recorded
      .flatMap((input) => input.suggestions)
      .filter((suggestion) => suggestion.placeMenuItemId === menuItemId)
      .sort((a, b) => b.confidenceScore - a.confidenceScore);
    const suggested = suggestions.map((s) => keyOfTarget(s.target));
    const verified = offered.get(menuItemId);
    return {
      id: line.id,
      expected: line.expected,
      candidates: verified ?? suggested,
      suggested,
      auto: verified === undefined && suggested.length > 0,
    };
  });
};

/* -------------------------------------------------------------------------- */
/* Reporting                                                                   */
/* -------------------------------------------------------------------------- */

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;

const report = (
  search: SearchSummary,
  byKind: Record<string, SearchSummary>,
  menus: MenuSummary,
  narrowed: NarrowingSummary,
): string =>
  [
    `retrieval eval — ${MODEL_KEY}, ${CATALOG.length} items, ` +
      `${search.queries} queries, ${menus.lines} menu lines`,
    `search  hit@1 ${pct(search.hitAt1)}  hit@3 ${pct(search.hitAt3)}  ` +
      `hit@10 ${pct(search.hitAt10)}  recall@10 ${pct(search.recallAt10)}  ` +
      `MRR ${search.mrr.toFixed(3)}`,
    ...Object.entries(byKind).map(
      ([kind, s]) =>
        `  ${kind.padEnd(9)} n=${String(s.queries).padStart(2)}  hit@1 ` +
        `${pct(s.hitAt1)}  hit@3 ${pct(s.hitAt3)}  MRR ${s.mrr.toFixed(3)}`,
    ),
    `  misses@3: ${search.missesAt3.join(", ") || "none"}`,
    `narrowed (X12) ${narrowed.narrowed}/${narrowed.queries} queries  ` +
      `hit@1 ${pct(narrowed.hitAt1)}  recall@10 ${pct(narrowed.recallAt10)}  ` +
      `irrelevant ${narrowed.irrelevantBefore} -> ${narrowed.irrelevantAfter}  ` +
      `(in narrowed queries ${narrowed.paddingBefore} -> ${narrowed.paddingAfter})`,
    `menus   match ${pct(menus.matchRate)}  candidate recall ` +
      `${pct(menus.candidateRecall)}  auto ${menus.autoSuggested} ` +
      `(precision ${pct(menus.autoPrecision)})  rejections ` +
      `${pct(menus.correctRejections)}  false auto ${menus.falseAutoMatches}  ` +
      `false suggestions ${menus.falseSuggestions}/${menus.notInCatalog}`,
    `  misses: ${menus.misses.join(", ") || "none"}`,
    `  verifier errors: ${verifierErrors.length}`,
  ].join("\n");

const BASELINE = new URL("./baseline.json", import.meta.url);

const readBaseline = (): GuardedBaseline | null => {
  try {
    return JSON.parse(readFileSync(BASELINE, "utf8")) as GuardedBaseline;
  } catch {
    return null;
  }
};

describe.skipIf(skip)(`retrieval eval (N05), live at ${ENDPOINT}`, () => {
  afterAll(closeTestDb);

  it("scores search and menu matching over the fixture catalog, and holds the baseline", async () => {
    await withTestDb(async (db) => {
      const userId = await seedUser(db);
      const seeded = await seedCatalog(db, userId, CATALOG);
      await seedVectors(db, seeded);

      const ranked = await runSearch(
        db,
        { viewerId: userId, kind: "user", requestId: "eval" },
        seeded,
      );
      const search = summariseSearch(ranked);
      // X12: the same queries as universal search asks them.
      const narrowedRanked = await runSearch(
        db,
        { viewerId: userId, kind: "user", requestId: "eval-narrow" },
        seeded,
        true,
      );
      const narrowed = summariseNarrowing(ranked, narrowedRanked);
      const kinds = [...new Set(ranked.map((query) => query.kind))];
      const byKind = Object.fromEntries(
        kinds.map((kind) => [
          kind,
          summariseSearch(ranked.filter((query) => query.kind === kind)),
        ]),
      );
      const lines = await runMenus(db, userId, seeded);
      const menus = summariseMenus(lines);

      console.log(report(search, byKind, menus, narrowed));
      const out = process.env.RETRIEVAL_EVAL_OUT;
      if (out !== undefined && out !== "") {
        writeFileSync(
          out,
          `${JSON.stringify(
            {
              model: MODEL_KEY,
              verifier: process.env.RETRIEVAL_EVAL_VERIFIER ?? "stand-in",
              search,
              byKind,
              menus,
              narrowed,
              ranked,
              narrowedRanked,
              lines,
              verifierErrors,
            },
            null,
            2,
          )}\n`,
        );
      }

      // Sanity: the fixture is all there and every query was answered.
      expect(ranked).toHaveLength(QUERIES.length);
      const baseline = readBaseline();
      if (
        baseline !== null &&
        process.env.RETRIEVAL_EVAL_VERIFIER !== "model"
      ) {
        expect(regressions(baseline, { search, menus, narrowed })).toEqual([]);
      }
    });
  }, 600_000);
});
