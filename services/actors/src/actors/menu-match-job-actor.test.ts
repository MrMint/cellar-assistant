import { fileURLToPath } from "node:url";
import {
  moduleSpecifiers,
  PROGRAM_TIMEOUT_MS,
  type Project,
  sourceFileAt,
} from "@cellar-assistant/analysis";
import type {
  ItemSearchInput,
  RecipeSearchInput,
} from "@cellar-assistant/contracts";
import {
  adminCtx,
  ConflictError,
  ForbiddenError,
  pageArgs,
  systemCtx,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import type ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actorsProject } from "../lib/analysis-testing.ts";
import type { DbOrTx } from "../lib/db.ts";
import type { MenuMatchVerifier } from "../lib/menu-ai.ts";
import { unconfiguredMenuMatchVerifier } from "../lib/menu-ai.ts";
import type { MenuSearcher } from "../lib/menu-matching.ts";
import { routeFor } from "../lib/menu-matching.ts";
import { seedPlace, seedRecipe, seedWine } from "../lib/search-testing.ts";
import { sidecarTargetsOf } from "../lib/sidecar-targets.ts";
import {
  activate,
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  testDelivery,
  withTestDb,
} from "../lib/testing.ts";
import type { SuggestionRecorder } from "./menu-match-job-actor.ts";
import {
  MenuMatchJobActor,
  scannedTypeOf,
  searchTextOf,
} from "./menu-match-job-actor.ts";
import { MenuScanActor } from "./menu-scan-actor.ts";

const daprClient = (): DaprClient =>
  new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" });

/* -------------------------------------------------------------------------- */
/* Seams                                                                       */
/* -------------------------------------------------------------------------- */

type Recorded = {
  readonly items: ItemSearchInput[];
  readonly recipes: RecipeSearchInput[];
};

/**
 * A searcher that records every input it was handed. This is what makes the
 * routing claim testable: the sidecar hop is the only place the choice of
 * `ItemSearchActor` vs `RecipeSearchActor` is expressed.
 */
const recordingSearcher = (
  answers: {
    readonly items?: {
      type: "WINE" | "BEER";
      id: string;
      name: string;
      distance: number;
    }[];
    readonly recipes?: {
      recipeId: string;
      name: string;
      distance: number | null;
    }[];
  } = {},
): MenuSearcher & { readonly seen: Recorded } => {
  const seen: Recorded = { items: [], recipes: [] };
  return {
    seen,
    searchItems: async (_ctx, input) => {
      seen.items.push(input);
      return (answers.items ?? []).map((hit) => ({
        type: hit.type,
        id: hit.id,
        name: hit.name,
        distance: hit.distance,
      }));
    },
    searchRecipes: async (_ctx, input) => {
      seen.recipes.push(input);
      return (answers.recipes ?? []).map((hit) => ({
        recipeId: hit.recipeId,
        name: hit.name,
        description: null,
        type: "cocktail",
        recipeGroupId: null,
        distance: hit.distance,
      }));
    },
  };
};

const neverVerify: MenuMatchVerifier = async () => {
  throw new Error("no verification should have run in this test");
};

/** In-process stand-in for the `job → entity` sidecar hop (§8.5). */
const localRecorder =
  (db: DbOrTx): SuggestionRecorder =>
  async (ctx, menuScanId, input) => {
    const actor = await activate(
      new MenuScanActor(daprClient(), new ActorId(menuScanId), db),
    );
    return actor.recordSuggestions(ctx, input);
  };

const newJobActor = (
  id: string,
  db: DbOrTx,
  search: MenuSearcher,
  verify: MenuMatchVerifier = neverVerify,
  record: SuggestionRecorder = localRecorder(db),
): MenuMatchJobActor =>
  new MenuMatchJobActor(
    daprClient(),
    new ActorId(id),
    db,
    search,
    verify,
    record,
  );

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const SAN_FRANCISCO = { lng: -122.4194, lat: 37.7749 };

const seedScan = async (
  db: DbOrTx,
  userId: string,
  placeId: string,
): Promise<string> => {
  const rows = await db.execute<{ id: string }>(sql`
    insert into public.files (key) values (${`menus/${crypto.randomUUID()}.jpg`})
    returning id
  `);
  const fileId = rows.rows[0]?.id;
  const id = crypto.randomUUID();
  await db.execute(sql`
    insert into public.menu_scans
      (id, user_id, original_image_id, place_id, processing_status)
    values (${id}::uuid, ${userId}::uuid, ${fileId}::uuid, ${placeId}::uuid,
            'completed')
  `);
  return id;
};

const seedMenuItem = async (
  db: DbOrTx,
  options: {
    readonly placeId: string;
    readonly menuScanId: string;
    readonly name: string;
    readonly scanItemType: string;
    readonly searchName?: string;
  },
): Promise<string> => {
  const rows = await db.execute<{ id: string }>(sql`
    insert into public.place_menu_items
      (place_id, menu_scan_id, menu_item_name, detected_item_type,
       search_name)
    values (${options.placeId}::uuid, ${options.menuScanId}::uuid,
            ${options.name}, ${options.scanItemType},
            ${options.searchName ?? options.name})
    returning id
  `);
  const id = rows.rows[0]?.id;
  if (id === undefined) throw new Error("seedMenuItem: no row");
  return id;
};

const startJob = async (
  actor: MenuMatchJobActor,
  menuScanId: string,
): Promise<void> => {
  await actor.start(testDelivery("start"), { menuScanId });
};

const suggestionsOf = async (db: DbOrTx, menuScanId: string) => {
  const actor = await activate(
    new MenuScanActor(daprClient(), new ActorId(menuScanId), db),
  );
  const [{ userId }] = [await actor.get(systemCtx("r-read"))];
  const page = await actor.suggestions(
    userCtx(userId, "r-read"),
    pageArgs({ first: 50 }),
  );
  return page.entries.map((entry) => entry.node);
};

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("MenuMatchJobActor (B8)", () => {
  afterAll(closeTestDb);

  it("is tagged job — §8.5's only caller allowed to reach a search actor", () => {
    expect(MenuMatchJobActor.category).toBe("job");
  });

  /**
   * It used to inherit `JobActor.start`'s "anyone but anonymous", so a
   * signed-in user who reached the actor id could start a paid matching run
   * over someone else's scan. `services/api`'s actor-surface registry says
   * its methods are system-only; this holds it to that.
   */
  it("start is system-only: a signed-in user and an admin are refused, before anything is written", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const admin = await seedUser(db);
      const scanId = crypto.randomUUID();
      const jobId = crypto.randomUUID();
      const job = await activate(newJobActor(jobId, db, recordingSearcher()));

      for (const ctx of [userCtx(owner, "r1"), adminCtx(admin, "r2")]) {
        await expect(
          job.start(ctx, { menuScanId: scanId }),
        ).rejects.toBeInstanceOf(ForbiddenError);
      }
      const { rows } = await db.execute<{ id: string }>(
        sql`select id from public.jobs where id = ${jobId}::uuid`,
      );
      expect(rows).toHaveLength(0);

      const started = await job.start(testDelivery("start"), {
        menuScanId: scanId,
      });
      expect(started.status).toBe("running");
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Routing                                                                 */
  /* ---------------------------------------------------------------------- */

  it("routeFor: a cocktail goes to recipe search, everything else to item search", () => {
    expect(routeFor("cocktail", "Negroni")).toEqual({
      kind: "RECIPE",
      input: {
        semanticQuery: "Negroni",
        type: "cocktail",
        maxDistance: 1.2,
        limit: 3,
      },
    });
    expect(routeFor("wine", "Chateau Test 2019")).toEqual({
      kind: "ITEM",
      input: {
        text: "Chateau Test 2019",
        itemTypes: ["WINE"],
        maxDistance: 1.2,
        limit: 3,
      },
    });
    expect(routeFor("sake", "Dassai 45").input).toMatchObject({
      itemTypes: ["SAKE"],
    });
    // An unrecognised line searches every item type rather than being dropped.
    expect(routeFor("unknown", "Mystery").input).toMatchObject({
      itemTypes: null,
    });
  });

  it("a cocktail line reaches RecipeSearchActor and a wine line reaches ItemSearchActor — nothing crosses", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const placeId = await seedPlace(db, { name: "Bar", ...SAN_FRANCISCO });
      const scanId = await seedScan(db, owner, placeId);
      const wine = await seedWine(db, owner, "Chateau Test 2019");
      const recipeId = await seedRecipe(db, { name: "Negroni" });
      await seedMenuItem(db, {
        placeId,
        menuScanId: scanId,
        name: "Ch. Test '19",
        scanItemType: "wine",
        searchName: "Chateau Test 2019",
      });
      await seedMenuItem(db, {
        placeId,
        menuScanId: scanId,
        name: "House Negroni",
        scanItemType: "cocktail",
        searchName: "Negroni",
      });

      const search = recordingSearcher({
        items: [
          {
            type: "WINE",
            id: wine.id,
            name: "Chateau Test 2019",
            distance: 0.1,
          },
        ],
        recipes: [{ recipeId, name: "Negroni", distance: 0.05 }],
      });
      const job = await activate(newJobActor(crypto.randomUUID(), db, search));
      await startJob(job, scanId);
      const outcome = await job.runBatch(testDelivery("b0"), { batch: 0 });
      expect(outcome).toEqual({ ran: true, processed: 2, done: true });

      // The routing claim, asserted at the call boundary.
      expect(search.seen.items).toEqual([
        {
          text: "Chateau Test 2019",
          itemTypes: ["WINE"],
          maxDistance: 1.2,
          limit: 3,
        },
      ]);
      expect(search.seen.recipes).toEqual([
        {
          semanticQuery: "Negroni",
          type: "cocktail",
          maxDistance: 1.2,
          limit: 3,
        },
      ]);

      // …and at the rows it produced: a cocktail becomes a `suggested_recipe_id`
      // and a wine a `suggested_wine_id`.
      const suggestions = await suggestionsOf(db, scanId);
      expect(
        suggestions
          .map((s) =>
            s.target.kind === "RECIPE"
              ? `RECIPE:${s.target.recipeId}`
              : `${s.target.item.type}:${s.target.item.id}`,
          )
          .sort(),
      ).toEqual([`RECIPE:${recipeId}`, `WINE:${wine.id}`].sort());
    });
  });

  it("reads the scanned type and search phrase from their columns, never the JSONB", () => {
    expect(scannedTypeOf({ detected_item_type: "sake" })).toBe("sake");
    expect(scannedTypeOf({ detected_item_type: null })).toBe("unknown");
    expect(scannedTypeOf({ detected_item_type: "SAKE" })).toBe("unknown");
    expect(
      searchTextOf({ search_name: " Dassai 45 ", menu_item_name: "Dassai" }),
    ).toBe("Dassai 45");
    // Blank means "none": the menu's own wording is searched instead.
    expect(
      searchTextOf({ search_name: "  ", menu_item_name: " Dassai " }),
    ).toBe("Dassai");
    expect(searchTextOf({ search_name: null, menu_item_name: "Dassai" })).toBe(
      "Dassai",
    );
  });

  it("routes by detected_item_type even when a stale extracted_attributes.scanItemType disagrees", async () => {
    // `place_menu_items_scan_columns` removed the JSONB keys, but a row written
    // by any other path could still carry one. The column is the one a user's
    // match rewrites, so it is the one that routes.
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const placeId = await seedPlace(db, { name: "Bar", ...SAN_FRANCISCO });
      const scanId = await seedScan(db, owner, placeId);
      await db.execute(sql`
        insert into public.place_menu_items
          (place_id, menu_scan_id, menu_item_name, detected_item_type,
           search_name, extracted_attributes)
        values (${placeId}::uuid, ${scanId}::uuid, 'Ch. Test', 'wine',
                'Chateau Test 2019',
                '{"scanItemType": "spirit", "search_name": "stale"}'::jsonb)
      `);
      const search = recordingSearcher();
      const job = await activate(newJobActor(crypto.randomUUID(), db, search));
      await startJob(job, scanId);
      await job.runBatch(testDelivery("b0"), { batch: 0 });
      expect(search.seen.items).toEqual([
        {
          text: "Chateau Test 2019",
          itemTypes: ["WINE"],
          maxDistance: 1.2,
          limit: 3,
        },
      ]);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* The confidence bands                                                    */
  /* ---------------------------------------------------------------------- */

  it("a candidate at or above 0.9 is suggested without a model call", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const placeId = await seedPlace(db, { name: "Bar", ...SAN_FRANCISCO });
      const scanId = await seedScan(db, owner, placeId);
      const wine = await seedWine(db, owner, "Chateau Test 2019");
      await seedMenuItem(db, {
        placeId,
        menuScanId: scanId,
        name: "Chateau Test",
        scanItemType: "wine",
      });

      // distance 0.1 -> similarity 0.95
      const search = recordingSearcher({
        items: [{ type: "WINE", id: wine.id, name: "Chateau", distance: 0.1 }],
      });
      const job = await activate(newJobActor(crypto.randomUUID(), db, search));
      await startJob(job, scanId);
      await job.runBatch(testDelivery("b0"), { batch: 0 });

      const [suggestion] = await suggestionsOf(db, scanId);
      expect(suggestion?.confidenceScore).toBeCloseTo(0.95, 2);
      expect(suggestion?.matchReasoning).toContain(">= 0.9");
      expect(suggestion?.similarityMetrics).toMatchObject({
        route: "ITEM",
        scanItemType: "wine",
      });
    });
  });

  /**
   * Every other test here hands the job exactly one hit, so reversing the
   * candidate sort survived: with more than one, the *worst* candidate became
   * `best`, and a 0.95 match was sent to the verifier as if it were ambiguous.
   * The weak hit comes first on purpose — the searcher's order must not matter.
   */
  it("ranks several hits best-first: the 0.95 is suggested and the verifier is never asked", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const placeId = await seedPlace(db, { name: "Bar", ...SAN_FRANCISCO });
      const scanId = await seedScan(db, owner, placeId);
      const weak = await seedWine(db, owner, "Chateau Other 2011");
      const strong = await seedWine(db, owner, "Chateau Test 2019");
      await seedMenuItem(db, {
        placeId,
        menuScanId: scanId,
        name: "Chateau Test",
        scanItemType: "wine",
      });

      // distance 0.8 -> 0.6 (verify band); distance 0.1 -> 0.95 (auto).
      const search = recordingSearcher({
        items: [
          { type: "WINE", id: weak.id, name: "Other", distance: 0.8 },
          { type: "WINE", id: strong.id, name: "Test", distance: 0.1 },
        ],
      });
      const job = await activate(newJobActor(crypto.randomUUID(), db, search));
      await startJob(job, scanId);
      await expect(
        job.runBatch(testDelivery("b0"), { batch: 0 }),
      ).resolves.toMatchObject({ ran: true });

      const suggestions = await suggestionsOf(db, scanId);
      expect(suggestions).toHaveLength(1);
      const [suggestion] = suggestions;
      expect(suggestion?.target).toEqual({
        kind: "ITEM",
        item: { type: "WINE", id: strong.id },
      });
      expect(suggestion?.confidenceScore).toBeCloseTo(0.95, 2);
    });
  });

  it("a candidate in the 0.4–0.9 band is put to the verifier, whose answer is what is stored", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const placeId = await seedPlace(db, { name: "Bar", ...SAN_FRANCISCO });
      const scanId = await seedScan(db, owner, placeId);
      const wine = await seedWine(db, owner, "Chateau Test 2019");
      await seedMenuItem(db, {
        placeId,
        menuScanId: scanId,
        name: "Chateau Test",
        scanItemType: "wine",
      });

      // distance 0.6 -> similarity 0.7, squarely in §2.1's band.
      const search = recordingSearcher({
        items: [{ type: "WINE", id: wine.id, name: "Chateau", distance: 0.6 }],
      });
      let asked = 0;
      const verify: MenuMatchVerifier = async (_ctx, request) => {
        asked += 1;
        expect(request.candidates.map((c) => c.key)).toEqual([
          `WINE:${wine.id}`,
        ]);
        expect(request.itemType).toBe("wine");
        return {
          acceptedKey: `WINE:${wine.id}`,
          confidence: 0.82,
          reasoning: "same producer and vintage",
          model: "fake-verifier-1",
        };
      };
      const job = await activate(
        newJobActor(crypto.randomUUID(), db, search, verify),
      );
      await startJob(job, scanId);
      await job.runBatch(testDelivery("b0"), { batch: 0 });

      expect(asked).toBe(1);
      const [suggestion] = await suggestionsOf(db, scanId);
      expect(suggestion?.confidenceScore).toBeCloseTo(0.82, 2);
      expect(suggestion?.matchReasoning).toBe("same producer and vintage");
      expect(suggestion?.similarityMetrics).toMatchObject({
        verifiedBy: "fake-verifier-1",
      });
    });
  });

  it("a verifier that says 'none of these' produces no suggestion", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const placeId = await seedPlace(db, { name: "Bar", ...SAN_FRANCISCO });
      const scanId = await seedScan(db, owner, placeId);
      const wine = await seedWine(db, owner, "Something Else");
      await seedMenuItem(db, {
        placeId,
        menuScanId: scanId,
        name: "Chateau Test",
        scanItemType: "wine",
      });

      const search = recordingSearcher({
        items: [{ type: "WINE", id: wine.id, name: "Else", distance: 0.6 }],
      });
      const verify: MenuMatchVerifier = async () => ({
        acceptedKey: null,
        confidence: 0,
        reasoning: "different wine",
        model: "fake-verifier-1",
      });
      const job = await activate(
        newJobActor(crypto.randomUUID(), db, search, verify),
      );
      await startJob(job, scanId);
      await job.runBatch(testDelivery("b0"), { batch: 0 });

      expect(await suggestionsOf(db, scanId)).toEqual([]);
    });
  });

  it("a candidate below 0.4 is dropped without a model call", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const placeId = await seedPlace(db, { name: "Bar", ...SAN_FRANCISCO });
      const scanId = await seedScan(db, owner, placeId);
      const wine = await seedWine(db, owner, "Unrelated");
      await seedMenuItem(db, {
        placeId,
        menuScanId: scanId,
        name: "Chateau Test",
        scanItemType: "wine",
      });

      // distance 1.5 -> similarity 0.25
      const search = recordingSearcher({
        items: [
          { type: "WINE", id: wine.id, name: "Unrelated", distance: 1.5 },
        ],
      });
      const job = await activate(newJobActor(crypto.randomUUID(), db, search));
      await startJob(job, scanId);
      await job.runBatch(testDelivery("b0"), { batch: 0 });

      expect(await suggestionsOf(db, scanId)).toEqual([]);
    });
  });

  /**
   * A hallucinated key must not be stored — and must not dead-letter either.
   *
   * `OutboxActor.isPermanentFailure` is `code === "VALIDATION"` and nothing
   * else, justified as "a pure function of a payload that, in an `outbox` row,
   * is frozen". A model's answer is not frozen, so `ValidationError` here
   * spent, on the first attempt, exactly the retries this failure is most
   * likely to survive. `ConflictError` is what `lib/ai/seams.ts`'s shipped
   * verifier already throws for the identical condition; this backstop now
   * agrees with it.
   */
  it("a verifier naming a candidate it was never offered is retryable, not a stored match", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const placeId = await seedPlace(db, { name: "Bar", ...SAN_FRANCISCO });
      const scanId = await seedScan(db, owner, placeId);
      const wine = await seedWine(db, owner, "Chateau Test 2019");
      await seedMenuItem(db, {
        placeId,
        menuScanId: scanId,
        name: "Chateau Test",
        scanItemType: "wine",
      });
      const search = recordingSearcher({
        items: [{ type: "WINE", id: wine.id, name: "Chateau", distance: 0.6 }],
      });
      const verify: MenuMatchVerifier = async () => ({
        acceptedKey: "WINE:00000000-0000-4000-8000-000000000000",
        confidence: 0.9,
        reasoning: "hallucinated",
        model: "fake-verifier-1",
      });
      const job = await activate(
        newJobActor(crypto.randomUUID(), db, search, verify),
      );
      await startJob(job, scanId);
      const thrown = await job.runBatch(testDelivery("b0"), { batch: 0 }).then(
        () => null,
        (error: unknown) => error,
      );
      expect(thrown).toBeInstanceOf(ConflictError);
      // Said as well as implied: `VALIDATION` is the *only* code the outbox
      // dead-letters on the first attempt, so this is the assertion that
      // fails if the classification regresses.
      expect(thrown).not.toBeInstanceOf(ValidationError);
      expect((thrown as { code?: string }).code).toBe("CONFLICT");
      expect(await suggestionsOf(db, scanId)).toEqual([]);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Idempotency and chaining                                                */
  /* ---------------------------------------------------------------------- */

  it("a re-run of the same batch converges on the same suggestions rather than doubling them", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const placeId = await seedPlace(db, { name: "Bar", ...SAN_FRANCISCO });
      const scanId = await seedScan(db, owner, placeId);
      const wine = await seedWine(db, owner, "Chateau Test 2019");
      await seedMenuItem(db, {
        placeId,
        menuScanId: scanId,
        name: "Chateau Test",
        scanItemType: "wine",
      });
      const search = recordingSearcher({
        items: [{ type: "WINE", id: wine.id, name: "Chateau", distance: 0.1 }],
      });
      const jobId = crypto.randomUUID();
      const job = await activate(newJobActor(jobId, db, search));
      await startJob(job, scanId);

      await job.runBatch(testDelivery("b0"), { batch: 0 });
      expect(await suggestionsOf(db, scanId)).toHaveLength(1);

      // (a) the base class refuses a redelivery of a batch it has moved past.
      // This one-batch job completed, so the reason is `terminal`; a longer
      // menu's earlier batch would come back `duplicate`. Either way nothing
      // re-runs.
      const replay = await job.runBatch(testDelivery("b0-again"), {
        batch: 0,
      });
      expect(replay.ran).toBe(false);
      expect(await suggestionsOf(db, scanId)).toHaveLength(1);

      // (b) …and even a full re-run from batch 0 on a fresh job converges,
      // because `recordSuggestions` replaces rather than appends.
      const rerun = await activate(
        newJobActor(crypto.randomUUID(), db, search),
      );
      await startJob(rerun, scanId);
      await rerun.runBatch(testDelivery("c0"), { batch: 0 });
      expect(await suggestionsOf(db, scanId)).toHaveLength(1);
    });
  });

  it("a scan whose menu items have not arrived yet completes without suggestions and without failing", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const placeId = await seedPlace(db, { name: "Bar", ...SAN_FRANCISCO });
      const scanId = await seedScan(db, owner, placeId);
      const search = recordingSearcher();
      const job = await activate(newJobActor(crypto.randomUUID(), db, search));
      await startJob(job, scanId);
      const outcome = await job.runBatch(testDelivery("b0"), { batch: 0 });
      expect(outcome).toEqual({ ran: true, processed: 0, done: true });
      expect(search.seen.items).toEqual([]);
      expect(search.seen.recipes).toEqual([]);
    });
  });

  it("the verifier's production default throws rather than faking a verification", async () => {
    await expect(
      unconfiguredMenuMatchVerifier(systemCtx("r1"), {
        placeMenuItemId: crypto.randomUUID(),
        menuItemName: "Chateau Test",
        menuItemDescription: null,
        itemType: "wine",
        candidates: [],
      }),
    ).rejects.toThrow(/no AI provider is configured to verify/);
  });
});

/* -------------------------------------------------------------------------- */
/* The static half of §8.5                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The routing decision above is only safe because `MenuScanActor` never makes
 * it. §8.5's rule is a property of the *module*, not of any one execution, so
 * it is asserted by parsing the source — the same argument
 * `lib/no-external-calls.test.ts` makes for `ItemActor`. Kept here rather than
 * added to that file's `GUARDED` table so B8 owns its own fence.
 */
let project: Project;
const sourceOf = (file: string): ts.SourceFile =>
  sourceFileAt(project, fileURLToPath(new URL(file, import.meta.url)));

const importsOf = moduleSpecifiers;

describe("§8.5: the search hop belongs to the job, never to the entity actor", () => {
  // The host's program, built once under a timeout sized for CPU rather
  // than inside whichever test reaches it first (PROGRAM_TIMEOUT_MS says why).
  beforeAll(() => {
    project = actorsProject();
  }, PROGRAM_TIMEOUT_MS);

  it("menu-scan-actor.ts reaches no actor through the sidecar at all", () => {
    const source = sourceOf("./menu-scan-actor.ts");
    // Every cross-actor call `MenuScanActor` makes is an outbox row.
    expect(sidecarTargetsOf(source)).toEqual([]);
    expect(
      importsOf(source).filter(
        (specifier) =>
          specifier.includes("menu-matching") ||
          specifier.includes("search-actor") ||
          specifier.includes("sidecar") ||
          specifier.includes("internal-client"),
      ),
    ).toEqual([]);
  });

  it("menu-match-job-actor.ts reaches exactly one actor type directly, and the two search actors through lib/menu-matching.ts", () => {
    const job = sourceOf("./menu-match-job-actor.ts");
    // job -> entity (§8.5). Nothing else.
    expect(sidecarTargetsOf(job)).toEqual(["MenuScanActor"]);
    expect(importsOf(job)).toContain("../lib/menu-matching.ts");

    // job -> search (§8.5), and only these two.
    const searcher = sourceOf("../lib/menu-matching.ts");
    expect(sidecarTargetsOf(searcher).sort()).toEqual([
      "ItemSearchActor",
      "RecipeSearchActor",
    ]);
  });
});
