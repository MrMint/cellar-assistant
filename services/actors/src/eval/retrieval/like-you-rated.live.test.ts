/**
 * X07 — what `MENU_LINE_LIKE_MAX_DISTANCE` admits, measured on N05's catalog.
 *
 * "Like the Lagavulin 16 you rated ★4.5" is the one menu-line reason that
 * rests on a distance rather than a row, so its threshold is a claim about
 * the embedding: that two items of one type under it are alike enough to say
 * so. This embeds the eval catalog exactly as production stores it
 * (`ItemActor.regenerateVector`, `embeddingTextFor`, the model's document
 * task) and prints every same-type pair the threshold admits, beside the
 * distance distribution, so the number can be judged on real neighbours —
 * Lagavulin 16 beside other Islay malts, a Provence rosé beside another —
 * instead of asserted.
 *
 * What it holds, through the same SQL production runs (`likeKindColumns`,
 * `likeComparable`): the rule admits only a small share of same-type pairs
 * (a "like" chip that fires on most of a menu would say nothing), and no
 * pair across what the catalog files as different spirit types or wine
 * styles. Skips without an Ollama daemon serving `nomic-embed-text`, like the
 * N05 harness; `LIKE_EVAL_OUT=<file>` writes the full pair list as JSON.
 */
import { writeFileSync } from "node:fs";
import {
  itemActorId,
  MENU_LINE_LIKE_MAX_DISTANCE,
  systemCtx,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import { ItemActor } from "../../actors/item-actor.ts";
import { readAIProviderConfig } from "../../lib/ai/config.ts";
import { providerFor } from "../../lib/ai/factory.ts";
import type { EmbedDocument } from "../../lib/embedding-client.ts";
import { ARCS } from "../../lib/item-arcs.ts";
import {
  likeComparable,
  likeKindColumns,
} from "../../lib/menu-line-context.ts";
import {
  activate,
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../../lib/testing.ts";
import { embeddingModelKey } from "../../lib/vectors.ts";
import { CATALOG, type CatalogEntry } from "./catalog.ts";
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

/** The catalog's own word for a kind within a type: spirit type, wine style. */
const kindOf = (entry: CatalogEntry): string | null => {
  const attributes = entry.attributes as Record<string, unknown>;
  const kind = attributes.spiritType ?? attributes.style ?? null;
  return typeof kind === "string" ? kind : null;
};

type Pair = {
  readonly type: string;
  readonly a: string;
  readonly b: string;
  readonly distance: number;
};

describe.skipIf(skip)(
  `"like you rated" threshold (X07), live at ${ENDPOINT}`,
  () => {
    afterAll(closeTestDb);

    it("admits a small share of same-type pairs, none across spirit types or wine styles", async () => {
      await withTestDb(async (db) => {
        const userId = await seedUser(db);
        const seeded = await seedCatalog(db, userId, CATALOG);
        const embedDocument: EmbedDocument = async (_ctx, input) => ({
          vector: (
            await provider.generateEmbeddings({
              content: input.text,
              type: "text",
              taskType: "RETRIEVAL_DOCUMENT",
            })
          ).embeddings,
          model: MODEL_KEY,
        });
        for (const item of seeded.items) {
          const actor = await activate(
            new ItemActor(
              new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
              new ActorId(itemActorId(item.ref)),
              db,
              async () => {
                throw new Error("the eval verifies no files");
              },
              embedDocument,
            ),
          );
          await actor.regenerateVector(systemCtx("like-eval-embed"));
        }

        const vec = ARCS.itemVectors;
        const { rows } = await db.execute<{
          type: string;
          a: string;
          b: string;
          distance: number | string;
          comparable: boolean;
        }>(sql`
        with raw as (
          select ${vec.typeExpr("v")} as type, ${vec.idExpr("v")} as id, v.vector
          from public.item_vectors v where v.vector is not null
        ),
        v as (
          select raw.*, ${likeKindColumns(sql`raw.type`, sql`raw.id`)}
          from raw
        )
        select a.type, a.id as a, b.id as b, (a.vector <=> b.vector) as distance,
               ${likeComparable("a", "b")} as comparable
        from v a join v b on a.type = b.type and a.id < b.id
        order by distance
      `);
        const entryOf = new Map(
          seeded.items.map((item) => [item.ref.id, item.entry]),
        );
        // What production admits: within the distance, and of the same kind.
        const admitted = rows.filter(
          (row) =>
            row.comparable &&
            Number(row.distance) <= MENU_LINE_LIKE_MAX_DISTANCE,
        );
        const admittedKeys = new Set(
          admitted.map((row) => `${row.a}:${row.b}`),
        );
        const pairs: (Pair & { readonly admitted: boolean })[] = rows.map(
          (row) => ({
            admitted: admittedKeys.has(`${row.a}:${row.b}`),
            type: row.type,
            a: entryOf.get(row.a)?.name ?? row.a,
            b: entryOf.get(row.b)?.name ?? row.b,
            distance: Number(row.distance),
          }),
        );
        const crossKind = admitted.filter((row) => {
          const a = entryOf.get(row.a);
          const b = entryOf.get(row.b);
          if (a === undefined || b === undefined) return false;
          const ka = kindOf(a);
          const kb = kindOf(b);
          return (
            (a.type === "SPIRIT" || a.type === "WINE") &&
            ka !== null &&
            kb !== null &&
            ka !== kb
          );
        });

        const sorted = pairs.map((pair) => pair.distance).sort((x, y) => x - y);
        const at = (q: number) =>
          sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
        console.log(
          [
            `same-type pairs: ${pairs.length}; admitted (same kind, <= ${MENU_LINE_LIKE_MAX_DISTANCE}): ${admitted.length} (${((100 * admitted.length) / Math.max(1, pairs.length)).toFixed(1)}%)`,
            `distance p1 ${at(0.01)?.toFixed(3)} · p5 ${at(0.05)?.toFixed(3)} · p25 ${at(0.25)?.toFixed(3)} · median ${at(0.5)?.toFixed(3)}`,
            "admitted pairs:",
            ...pairs
              .filter((pair) => pair.admitted)
              .map(
                (pair) =>
                  `  ${pair.distance.toFixed(3)}  ${pair.type}  ${pair.a}  ~  ${pair.b}`,
              ),
            "within the distance but not the same kind:",
            ...pairs
              .filter(
                (pair) =>
                  !pair.admitted &&
                  pair.distance <= MENU_LINE_LIKE_MAX_DISTANCE,
              )
              .map(
                (pair) =>
                  `  ${pair.distance.toFixed(3)}  ${pair.type}  ${pair.a}  ~  ${pair.b}`,
              ),
            "nearest pairs past the threshold:",
            ...pairs
              .filter((pair) => pair.distance > MENU_LINE_LIKE_MAX_DISTANCE)
              .slice(0, 12)
              .map(
                (pair) =>
                  `  ${pair.distance.toFixed(3)}  ${pair.type}  ${pair.a}  ~  ${pair.b}`,
              ),
          ].join("\n"),
        );
        if (process.env.LIKE_EVAL_OUT) {
          writeFileSync(
            process.env.LIKE_EVAL_OUT,
            JSON.stringify(pairs, null, 2),
          );
        }

        expect(pairs.length).toBeGreaterThan(0);
        expect(admitted.length / pairs.length).toBeLessThanOrEqual(0.05);
        expect(crossKind).toEqual([]);
      });
    }, 600_000);
  },
);
