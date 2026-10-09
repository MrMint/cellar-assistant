/**
 * X04 — tuning and holding the in-cellar search cutoff on the N05 eval set.
 *
 * A cellar search narrows (`../../lib/cellar-search.ts`): name matches, then
 * items whose vector is within a distance cutoff of the phrase, and nothing
 * else. Where to cut is an empirical question, so this answers it on N05's
 * fixtures rather than on a feel for a development database:
 *
 *  1. the whole fixture catalog (targets and hard negatives, 158 items) goes
 *     into **one** cellar — a harder shelf than any real one, every Lagavulin
 *     beside every Laphroaig;
 *  2. each of the 49 labelled queries is asked of it (narrowed to the query's
 *     types where it has them, as the cellar's type chips would);
 *  3. **the sweep** scores every (absolute cutoff × relative spread) pair on
 *     what the narrowed list keeps (`cellar-metrics.ts`), beside two
 *     reference points: names only, and the old re-sort that kept everything;
 *  4. **the check** then runs the real `CellarActor.itemGroups` with the
 *     shipped constants and requires it to keep exactly what the sweep said
 *     those constants keep, and to hold `cellar-baseline.json`.
 *
 * Skips without an Ollama daemon holding `nomic-embed-text`, like the N05
 * harness beside it, whose embedding and vector-seeding steps this repeats
 * (that file keeps its own copies; it is a test, not a library).
 *
 * `CELLAR_EVAL_OUT=<file>` writes the sweep and every query's kept list.
 */
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import type { ItemRef } from "@cellar-assistant/contracts";
import {
  itemActorId,
  pageArgs,
  systemCtx,
  userCtx,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import { CellarActor } from "../../actors/cellar-actor.ts";
import { ItemActor } from "../../actors/item-actor.ts";
import { readAIProviderConfig } from "../../lib/ai/config.ts";
import { providerFor } from "../../lib/ai/factory.ts";
import {
  CELLAR_NAME_THRESHOLD,
  CELLAR_SEARCH_MAX_DISTANCE,
  CELLAR_SEARCH_RELATIVE_SPREAD,
  nameScores,
  narrowCandidates,
} from "../../lib/cellar-search.ts";
import type { DbOrTx } from "../../lib/db.ts";
import type { EmbedDocument } from "../../lib/embedding-client.ts";
import {
  activate,
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../../lib/testing.ts";
import { embeddingModelKey, vectorDistances } from "../../lib/vectors.ts";
import { CATALOG } from "./catalog.ts";
import {
  type NarrowedQuery,
  type NarrowingSummary,
  summariseNarrowing,
} from "./cellar-metrics.ts";
import { QUERIES } from "./queries.ts";
import { type SeededCatalog, seedCatalog } from "./seed-testing.ts";

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

/** As the N05 harness: the real `regenerateVector`, the model call to Ollama. */
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
/* The sweep                                                                   */
/* -------------------------------------------------------------------------- */

type Signals = {
  readonly query: (typeof QUERIES)[number];
  readonly refs: readonly ItemRef[];
  readonly scores: Awaited<ReturnType<typeof nameScores>>;
  readonly distances: Map<string, number>;
};

const signalsFor = async (
  db: DbOrTx,
  seeded: SeededCatalog,
): Promise<Signals[]> => {
  const out: Signals[] = [];
  for (const query of QUERIES) {
    const types = query.itemTypes ?? null;
    const refs = seeded.items
      .map((item) => item.ref)
      .filter((ref) => types === null || types.includes(ref.type));
    const [scores, distances] = await Promise.all([
      nameScores(db, refs, query.text),
      embed(query.text, "query").then((vector) =>
        vectorDistances(db, refs, vector),
      ),
    ]);
    out.push({ query, refs, scores, distances });
  }
  return out;
};

const keptBy = (
  signals: readonly Signals[],
  seeded: SeededCatalog,
  options: {
    maxDistance: number;
    relativeSpread: number;
    meaning: boolean;
    /**
     * The "not in this cellar" case: every right bottle taken off the shelf
     * first, so whatever the list keeps is noise. A cellar of whisky asked
     * for "champagne" should come back empty, not with its nearest whisky.
     */
    withoutRelevant?: boolean;
  },
): NarrowedQuery[] =>
  signals.map(({ query, refs, scores, distances }) => ({
    id: query.id,
    kind: query.kind,
    relevant: query.relevant,
    kept: narrowCandidates(
      refs
        .filter(
          (ref) =>
            options.withoutRelevant !== true ||
            !query.relevant.includes(seeded.keyOf.get(ref.id) ?? ""),
        )
        .map((ref) => ({ value: ref, itemId: ref.id, id: ref.id })),
      scores,
      options.meaning ? distances : null,
      {
        maxDistance: options.maxDistance,
        relativeSpread: options.relativeSpread,
        nameThreshold: CELLAR_NAME_THRESHOLD,
      },
    ).map((hit) => seeded.keyOf.get(hit.value.id) ?? `?${hit.value.id}`),
  }));

const ABSOLUTE = Array.from({ length: 31 }, (_, at) => 0.3 + at * 0.01);
const SPREAD = [0.03, 0.05, 0.06, 0.08, 0.1, 0.12, 0.15, 0.2, 2];

type Row = {
  readonly maxDistance: number;
  readonly relativeSpread: number;
  readonly summary: NarrowingSummary;
  /** Mean bottles kept per query with every right bottle removed. */
  readonly absentKept: number;
  /** Share of those queries that came back empty, as they should. */
  readonly absentEmpty: number;
};

const absence = (
  kept: readonly NarrowedQuery[],
): { absentKept: number; absentEmpty: number } => ({
  absentKept:
    kept.reduce((sum, query) => sum + query.kept.length, 0) / kept.length,
  absentEmpty:
    kept.filter((query) => query.kept.length === 0).length / kept.length,
});

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
const line = (label: string, summary: NarrowingSummary): string =>
  `${label.padEnd(26)} hit ${pct(summary.hitRate).padStart(6)}  recall ` +
  `${pct(summary.recall).padStart(6)}  precision ${pct(summary.precision).padStart(6)}  ` +
  `F1 ${summary.f1.toFixed(3)}  extra ${summary.extra.toFixed(2).padStart(6)}  ` +
  `empty ${summary.empty}`;

const BASELINE = new URL("./cellar-baseline.json", import.meta.url);
/** Half the last recorded decimal of `cellar-baseline.json`. */
const ROUNDING = 5e-5;
type Baseline = {
  readonly hitRate: number;
  readonly recall: number;
  readonly precision: number;
  readonly f1: number;
};
const readBaseline = (): Baseline | null => {
  try {
    return JSON.parse(readFileSync(BASELINE, "utf8")).summary as Baseline;
  } catch {
    return null;
  }
};

describe.skipIf(skip)(
  `in-cellar search eval (X04), live at ${ENDPOINT}`,
  () => {
    afterAll(closeTestDb);

    it("tunes the cutoff on N05 and holds it through CellarActor.itemGroups", async () => {
      await withTestDb(async (db) => {
        const userId = await seedUser(db);
        const seeded = await seedCatalog(db, userId, CATALOG);
        await seedVectors(db, seeded);
        const signals = await signalsFor(db, seeded);

        // ---- the sweep --------------------------------------------------
        const rows: Row[] = [];
        for (const maxDistance of ABSOLUTE) {
          for (const relativeSpread of SPREAD) {
            rows.push({
              maxDistance,
              relativeSpread,
              summary: summariseNarrowing(
                keptBy(signals, seeded, {
                  maxDistance,
                  relativeSpread,
                  meaning: true,
                }),
              ),
              ...absence(
                keptBy(signals, seeded, {
                  maxDistance,
                  relativeSpread,
                  meaning: true,
                  withoutRelevant: true,
                }),
              ),
            });
          }
        }
        const nameOnly = summariseNarrowing(
          keptBy(signals, seeded, {
            maxDistance: 0,
            relativeSpread: 0,
            meaning: false,
          }),
        );
        const everything = summariseNarrowing(
          signals.map(({ query, refs }) => ({
            id: query.id,
            kind: query.kind,
            relevant: query.relevant,
            kept: refs.map((ref) => seeded.keyOf.get(ref.id) ?? ref.id),
          })),
        );
        const shippedKept = keptBy(signals, seeded, {
          maxDistance: CELLAR_SEARCH_MAX_DISTANCE,
          relativeSpread: CELLAR_SEARCH_RELATIVE_SPREAD,
          meaning: true,
        });
        const shipped = summariseNarrowing(shippedKept);
        const shippedAbsence = absence(
          keptBy(signals, seeded, {
            maxDistance: CELLAR_SEARCH_MAX_DISTANCE,
            relativeSpread: CELLAR_SEARCH_RELATIVE_SPREAD,
            meaning: true,
            withoutRelevant: true,
          }),
        );
        const byKind = Object.fromEntries(
          [...new Set(shippedKept.map((query) => query.kind))].map((kind) => [
            kind,
            summariseNarrowing(
              shippedKept.filter((query) => query.kind === kind),
            ),
          ]),
        );

        const best = [...rows].sort(
          (a, b) =>
            b.summary.f1 - a.summary.f1 ||
            b.summary.hitRate - a.summary.hitRate,
        );
        const absoluteOnly = rows
          .filter((row) => row.relativeSpread === 2)
          .sort((a, b) => b.summary.f1 - a.summary.f1);
        console.log(
          [
            `in-cellar search eval — ${MODEL_KEY}, one cellar of ${CATALOG.length} items, ${QUERIES.length} queries`,
            line("old re-sort (keeps all)", everything),
            line("names only", nameOnly),
            line(
              `shipped ${CELLAR_SEARCH_MAX_DISTANCE} / +${CELLAR_SEARCH_RELATIVE_SPREAD}`,
              shipped,
            ),
            `  not in the cellar: kept ${shippedAbsence.absentKept.toFixed(2)} a query, ` +
              `empty ${pct(shippedAbsence.absentEmpty)}`,
            ...Object.entries(byKind).map(([kind, summary]) =>
              line(`  ${kind}`, summary),
            ),
            `  misses: ${shipped.misses.join(", ") || "none"}`,
            "best by F1:",
            ...best
              .slice(0, 12)
              .map((row) =>
                line(
                  `  ${row.maxDistance.toFixed(2)} / +${row.relativeSpread}`,
                  row.summary,
                ),
              ),
            "absolute cutoff alone, best by F1:",
            ...absoluteOnly
              .slice(0, 6)
              .map((row) =>
                line(`  ${row.maxDistance.toFixed(2)}`, row.summary),
              ),
          ].join("\n"),
        );
        const out = process.env.CELLAR_EVAL_OUT;
        if (out !== undefined && out !== "") {
          writeFileSync(
            out,
            `${JSON.stringify(
              {
                model: MODEL_KEY,
                shipped: {
                  maxDistance: CELLAR_SEARCH_MAX_DISTANCE,
                  relativeSpread: CELLAR_SEARCH_RELATIVE_SPREAD,
                  summary: shipped,
                  ...shippedAbsence,
                  byKind,
                },
                nameOnly,
                everything,
                sweep: rows,
                kept: shippedKept,
              },
              null,
              2,
            )}\n`,
          );
        }

        // ---- the check: the real actor, the shipped constants ------------
        const cellarId = randomUUID();
        await db.execute(sql`
        insert into public.cellars (id, name, created_by_id, privacy)
        values (${cellarId}::uuid, 'Eval cellar', ${userId}::uuid, 'PRIVATE')
      `);
        const owner = userCtx(userId, "cellar-eval");
        const cellar = await activate(
          new CellarActor(
            daprClient(),
            new ActorId(cellarId),
            db,
            async (_ctx, text) => embed(text, "query"),
          ),
        );
        for (const item of seeded.items) {
          await cellar.addItem(owner, { item: item.ref });
        }
        const viaActor: NarrowedQuery[] = [];
        for (const query of QUERIES) {
          const result = await cellar.itemGroups(owner, {
            page: pageArgs({ first: 100 }),
            search: query.text,
            types: query.itemTypes ?? null,
            group: false,
          });
          expect(result.meaning).toBe("USED");
          viaActor.push({
            id: query.id,
            kind: query.kind,
            relevant: query.relevant,
            kept: result.entries.map(
              (entry) =>
                seeded.keyOf.get(entry.node.lead.item.id) ??
                entry.node.lead.item.id,
            ),
          });
        }
        expect(viaActor).toEqual(shippedKept);

        const baseline = readBaseline();
        if (baseline !== null) {
          // The baseline is recorded to four decimals.
          const held = (value: number, floor: number) =>
            expect(value).toBeGreaterThanOrEqual(floor - ROUNDING);
          held(shipped.hitRate, baseline.hitRate);
          held(shipped.recall, baseline.recall);
          held(shipped.precision, baseline.precision);
          held(shipped.f1, baseline.f1);
        }
      });
    }, 600_000);
  },
);
