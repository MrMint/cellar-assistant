/**
 * `MenuScanActor` against a real Postgres — B8 (§2.1, §1.4, §1.6, §8.4, §8.5).
 *
 * The four things B8 has to prove live here and in
 * `menu-match-job-actor.test.ts`:
 *
 *  1. the match run is driven by an **outbox row**, not by the
 *     `processing_status` event trigger, and a redelivery does not duplicate
 *     anything (`process` / `match` / `recordSuggestions` below);
 *  2. a non-owner can neither read nor mutate another user's scan — menu scans
 *     are owner-scoped, so §1.6's "stranger" case is a refusal, and the
 *     refusal is `NotFound` so a scan id is not an oracle;
 *  3. a cocktail routes to recipe matching and a wine to item matching (that
 *     one is the job actor's suite, where the routing decision lives);
 *  4. the AI seam throws loudly when unconfigured, and nothing here reaches a
 *     live service — every model call is an injected fake.
 */

import type { Ctx } from "@cellar-assistant/contracts";
import {
  adminCtx,
  anonymousCtx,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  pageArgs,
  systemCtx,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { files, menuScans, outbox } from "@cellar-assistant/db";
import { eq, sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import type { VerifyFile } from "../lib/file-verification.ts";
import type {
  MenuExtractionProvider,
  MenuExtractionResult,
} from "../lib/menu-ai.ts";
import {
  unconfiguredMenuExtraction,
  unconfiguredMenuMatchVerifier,
} from "../lib/menu-ai.ts";
import { enqueueOutbox } from "../lib/outbox.ts";
import { OUTBOX_TARGETS } from "../lib/outbox-targets.ts";
import { seedPlace, seedRecipe, seedWine } from "../lib/search-testing.ts";
import {
  activate,
  closeTestDb,
  deliveryCtx,
  refusalOf,
  resolveTestDatabase,
  seedUser,
  testDelivery,
  withTestDb,
} from "../lib/testing.ts";
import { MenuScanActor, menuMatchJobId } from "./menu-scan-actor.ts";
import { MAX_ATTEMPTS } from "./outbox-actor.ts";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const daprClient = (): DaprClient =>
  new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" });

/** Fails the test if the extractor is reached. */
const neverExtract: MenuExtractionProvider = async () => {
  throw new Error("no extraction should have run in this test");
};

const extraction = (
  overrides: Partial<MenuExtractionResult> = {},
): MenuExtractionResult => ({
  lines: [
    { name: "Chateau Test 2019", itemType: "wine", confidence: 0.8 },
    { name: "House Negroni", itemType: "cocktail", confidence: 0.7 },
  ],
  rawText: "WINES\nChateau Test 2019 ... 14\nCOCKTAILS\nHouse Negroni ... 16",
  model: "fake-vision-1",
  confidence: 0.85,
  durationMs: 1234,
  noMenuDetected: false,
  imageDescription: "A printed drinks list on a bar table.",
  ...overrides,
});

/**
 * `FileActor.verify` without a sidecar (E2d).
 *
 * The production seam calls `FileActor.verify`, which reads `files.verified_at`
 * and, when it is null, asks the object store and either stamps the column or
 * throws `ConflictError`. There is no object store here, so this stands in for
 * the column read and reproduces the two answers that matter: a missing row is
 * `NotFoundError` (what `requireAggregate()` raises) and an unstamped row comes
 * back `verifiedAt: null` for `requireVerifiedFile` to refuse.
 *
 * Reading the *real* `files` row rather than returning a constant is the point
 * — `seedFile` decides, so every existing `create` test keeps passing for the
 * right reason instead of because the fake always says yes.
 */
const dbVerifyFile =
  (db: DbOrTx): VerifyFile =>
  async (_ctx, fileId) => {
    const [row] = await db
      .select({ verifiedAt: files.verifiedAt })
      .from(files)
      .where(eq(files.id, fileId));
    if (row === undefined) throw new NotFoundError(`file ${fileId} not found`);
    return { id: fileId, verifiedAt: row.verifiedAt?.toISOString() ?? null };
  };

const newScanActor = (
  id: string,
  db: DbOrTx,
  extract: MenuExtractionProvider = neverExtract,
  verifyFile: VerifyFile = dbVerifyFile(db),
): MenuScanActor =>
  new MenuScanActor(daprClient(), new ActorId(id), db, extract, verifyFile);

/** A file whose bytes landed — `verified_at` stamped, as `FileActor.verify` leaves it. */
const seedFile = async (db: DbOrTx): Promise<string> => {
  const [row] = await db
    .insert(files)
    .values({ key: `menus/${crypto.randomUUID()}.jpg`, verifiedAt: new Date() })
    .returning({ id: files.id });
  if (row === undefined) throw new Error("seedFile: no row");
  return row.id;
};

/**
 * What `createUploadTarget` leaves behind before any bytes move: a real row,
 * a real FK target, and nothing in the bucket.
 */
const seedUnverifiedFile = async (db: DbOrTx): Promise<string> => {
  const [row] = await db
    .insert(files)
    .values({ key: `menus/${crypto.randomUUID()}.jpg` })
    .returning({ id: files.id });
  if (row === undefined) throw new Error("seedUnverifiedFile: no row");
  return row.id;
};

const seedScan = async (
  db: DbOrTx,
  options: {
    readonly userId: string;
    readonly placeId?: string | null;
    readonly status?: "pending" | "processing" | "completed" | "failed";
  },
): Promise<string> => {
  const id = crypto.randomUUID();
  const fileId = await seedFile(db);
  await db.execute(sql`
    insert into public.menu_scans
      (id, user_id, original_image_id, place_id, processing_status)
    values (${id}::uuid, ${options.userId}::uuid, ${fileId}::uuid,
            ${options.placeId ?? null}::uuid, ${options.status ?? "pending"})
  `);
  return id;
};

const seedMenuItem = async (
  db: DbOrTx,
  options: {
    readonly placeId: string;
    readonly menuScanId: string;
    readonly name: string;
    readonly scanItemType?: string;
  },
): Promise<string> => {
  const rows = await db.execute<{ id: string }>(sql`
    insert into public.place_menu_items
      (place_id, menu_scan_id, menu_item_name, detected_item_type,
       search_name)
    values (${options.placeId}::uuid, ${options.menuScanId}::uuid,
            ${options.name}, ${options.scanItemType ?? "wine"},
            ${options.name})
    returning id
  `);
  const id = rows.rows[0]?.id;
  if (id === undefined) throw new Error("seedMenuItem: no row");
  return id;
};

/**
 * A `sakes` row. `search-testing.ts` has no `seedSake` and B8c needs one only
 * here — to prove the acceptance kind that is *still* unhomed stays unhomed.
 */
const seedSake = async (
  db: DbOrTx,
  createdById: string,
  name: string,
): Promise<string> => {
  const id = crypto.randomUUID();
  await db.execute(sql`
    insert into public.sakes (id, name, created_by_id)
    values (${id}::uuid, ${name}, ${createdById}::uuid)
  `);
  return id;
};

const outboxRows = async (
  db: DbOrTx,
  targetId: string,
): Promise<
  readonly { targetActor: string; method: string; payload: unknown }[]
> =>
  db
    .select({
      targetActor: outbox.targetActor,
      method: outbox.method,
      payload: outbox.payload,
    })
    .from(outbox)
    .where(eq(outbox.targetId, targetId))
    .orderBy(outbox.seq);

/**
 * `outbox` is shared and this development database already holds rows from the
 * running stack, so "how many rows exist" is never the question — "how many did
 * *this* turn write" is. `outbox.seq` (A7b) is a `bigserial`, so a high-water
 * mark taken before the call is an exact fence.
 */
const outboxHighWater = async (db: DbOrTx): Promise<bigint> => {
  const { rows } = await db.execute<{ seq: string | null }>(
    sql`select max(seq)::text as seq from public.outbox`,
  );
  return BigInt(rows[0]?.seq ?? "0");
};

const outboxSince = async (
  db: DbOrTx,
  since: bigint,
): Promise<
  readonly { targetActor: string; targetId: string; method: string }[]
> => {
  const { rows } = await db.execute<{
    target_actor: string;
    target_id: string;
    method: string;
  }>(sql`
    select target_actor, target_id, method from public.outbox
    where seq > ${since.toString()}::bigint order by seq asc
  `);
  return rows.map((row) => ({
    targetActor: row.target_actor,
    targetId: row.target_id,
    method: row.method,
  }));
};

const countSuggestions = async (
  db: DbOrTx,
  menuScanId: string,
): Promise<number> => {
  const { rows } = await db.execute<{ n: string }>(sql`
    select count(*)::text as n
    from public.item_match_suggestions s
    join public.place_menu_items i on i.id = s.place_menu_item_id
    where i.menu_scan_id = ${menuScanId}::uuid
  `);
  return Number(rows[0]?.n ?? "0");
};

const SAN_FRANCISCO = { lng: -122.4194, lat: 37.7749 };

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("MenuScanActor (B8)", () => {
  afterAll(closeTestDb);

  it("is tagged entity (§2.1)", () => {
    expect(MenuScanActor.category).toBe("entity");
  });

  /* ---------------------------------------------------------------------- */
  /* Reads: owner / friend / stranger / anonymous                            */
  /* ---------------------------------------------------------------------- */

  it("get: the owner sees it; a friend, a stranger and an anonymous caller do not", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const friend = await seedUser(db);
      const stranger = await seedUser(db);
      const scanId = await seedScan(db, { userId: owner });
      const actor = await activate(newScanActor(scanId, db));

      const mine = await actor.get(userCtx(owner, "r-owner"));
      expect(mine.id).toBe(scanId);
      expect(mine.processingStatus).toBe("pending");

      // §2.1: "Visibility: scan owner only." A friend is a stranger here, and
      // the refusal is NotFound so the id tells them nothing.
      //
      // The class alone was never the guarantee: until E5b both arms threw
      // `NotFoundError` and still said different things — `menu scan <id> not
      // found` for a scan that exists, `requireAggregate()`'s
      // `MenuScanActor(<id>) has no row` for one that does not — and
      // `services/api` hands the message through verbatim. So this compares
      // the two refusals to each other rather than asserting either spelling:
      // a change that moves both stays green, one that moves only one does
      // not. (`c35fa111`, `ItemOnboardingActor`.)
      const absentId = crypto.randomUUID();
      const absent = await activate(newScanActor(absentId, db));
      const refusal = async (
        target: MenuScanActor,
        key: string,
        viewer: string | null,
      ): Promise<string> =>
        await (viewer === null
          ? target.get(anonymousCtx("r-anon"))
          : target.get(userCtx(viewer, `r-${viewer}`))
        ).then(
          () => "resolved",
          (error: Error) =>
            `${error.name}: ${error.message.replace(key, "<id>")}`,
        );

      for (const viewer of [friend, stranger, null]) {
        await expect(
          viewer === null
            ? actor.get(anonymousCtx("r-anon"))
            : actor.get(userCtx(viewer, `r-${viewer}`)),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(await refusal(actor, scanId, viewer)).toBe(
          await refusal(absent, absentId, viewer),
        );
      }
      // An admin bypasses policy (§1.6's `bypassesPolicy`).
      expect((await actor.get(adminCtx(stranger, "r-admin"))).id).toBe(scanId);
    });
  });

  it("suggestions: paged for the owner, refused for a stranger", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const stranger = await seedUser(db);
      const placeId = await seedPlace(db, { name: "Bar", ...SAN_FRANCISCO });
      const scanId = await seedScan(db, { userId: owner, placeId });
      const menuItemId = await seedMenuItem(db, {
        placeId,
        menuScanId: scanId,
        name: "Chateau Test",
      });
      const wine = await seedWine(db, owner, "Chateau Test 2019");
      const actor = await activate(newScanActor(scanId, db));
      await actor.recordSuggestions(testDelivery("seed"), {
        placeMenuItemIds: [menuItemId],
        suggestions: [
          {
            placeMenuItemId: menuItemId,
            target: { kind: "ITEM", item: wine },
            confidenceScore: 0.95,
          },
        ],
      });

      const page = await actor.suggestions(
        userCtx(owner, "r1"),
        pageArgs({ first: 10 }),
      );
      expect(page.entries).toHaveLength(1);
      expect(page.entries[0]?.node.menuScanId).toBe(scanId);
      // UI parity G20: the place rides on the suggestion.
      expect(page.entries[0]?.node.placeId).toBe(placeId);
      expect(page.entries[0]?.node.target).toEqual({
        kind: "ITEM",
        item: wine,
      });

      await expect(
        actor.suggestions(userCtx(stranger, "r2"), pageArgs({ first: 10 })),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  it("menuItems (UI parity G19): every line of this scan, by category then name, paged with a total; owner only", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const stranger = await seedUser(db);
      const placeId = await seedPlace(db, { name: "Bar", ...SAN_FRANCISCO });
      const scanId = await seedScan(db, { userId: owner, placeId });
      const otherScan = await seedScan(db, { userId: owner, placeId });
      const line = async (
        menuScanId: string,
        name: string,
        category: string | null,
      ) => {
        const id = await seedMenuItem(db, { placeId, menuScanId, name });
        await db.execute(sql`
          update public.place_menu_items set menu_category = ${category}
          where id = ${id}::uuid
        `);
        return id;
      };
      await line(scanId, "Zinfandel", "Wine");
      await line(scanId, "Amber Ale", "Beer");
      await line(scanId, "Bread", null);
      await line(scanId, "Albariño", "Wine");
      // Another scan's line at the same place is not this scan's.
      await line(otherScan, "Other scan line", "Beer");

      const actor = await activate(newScanActor(scanId, db));
      const first = await actor.menuItems(
        userCtx(owner, "r1"),
        pageArgs({ first: 3 }),
      );
      expect(first.totalCount).toBe(4);
      expect(first.hasNextPage).toBe(true);
      expect(first.hasPreviousPage).toBe(false);
      expect(first.entries.map((entry) => entry.node.name)).toEqual([
        "Amber Ale",
        "Albariño",
        "Zinfandel",
      ]);
      expect(first.entries[0]?.node).toMatchObject({
        menuScanId: scanId,
        placeId,
        menuCategory: "Beer",
        detectedItemType: "wine",
        matchedItem: null,
      });
      const second = await actor.menuItems(
        userCtx(owner, "r2"),
        pageArgs({ first: 3, after: first.entries.at(-1)?.cursor ?? null }),
      );
      expect(second.entries.map((entry) => entry.node.name)).toEqual(["Bread"]);
      expect(second.hasNextPage).toBe(false);
      expect(second.hasPreviousPage).toBe(true);

      // The scan is the owner's alone — same refusal, same wording, as `get`.
      await expect(
        actor.menuItems(userCtx(stranger, "r3"), pageArgs({ first: 3 })),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        actor.menuItems(anonymousCtx("r4"), pageArgs({ first: 3 })),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* create                                                                  */
  /* ---------------------------------------------------------------------- */

  it("create: writes the scan and exactly one `process` outbox row, in one transaction", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const fileId = await seedFile(db);
      const scanId = crypto.randomUUID();
      const actor = await activate(newScanActor(scanId, db));

      const scan = await actor.create(userCtx(owner, "r1"), {
        originalImageId: fileId,
      });
      expect(scan.userId).toBe(owner);
      expect(scan.processingStatus).toBe("pending");

      const rows = await outboxRows(db, scanId);
      expect(rows).toEqual([
        {
          targetActor: "MenuScanActor",
          method: "process",
          payload: { menuScanId: scanId },
        },
      ]);
    });
  });

  it("create: is idempotent on the scan id — no second extraction is scheduled", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const fileId = await seedFile(db);
      const scanId = crypto.randomUUID();
      const actor = await activate(newScanActor(scanId, db));

      await actor.create(userCtx(owner, "r1"), { originalImageId: fileId });
      await actor.create(userCtx(owner, "r2"), { originalImageId: fileId });

      expect(await outboxRows(db, scanId)).toHaveLength(1);
    });
  });

  it("create: anonymous is refused, and an unknown file is NotFound not a 500", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const actor = await activate(newScanActor(crypto.randomUUID(), db));
      await expect(
        actor.create(anonymousCtx("r1"), {
          originalImageId: crypto.randomUUID(),
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        actor.create(userCtx(owner, "r2"), {
          originalImageId: crypto.randomUUID(),
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  it("create: a place hint lands on the right columns and `effectivePlaceId` prefers the override", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const fileId = await seedFile(db);
      const guess = await seedPlace(db, { name: "Guess", ...SAN_FRANCISCO });
      const chosen = await seedPlace(db, { name: "Chosen", ...SAN_FRANCISCO });
      const scanId = crypto.randomUUID();
      const actor = await activate(newScanActor(scanId, db));

      const scan = await actor.create(userCtx(owner, "r1"), {
        originalImageId: fileId,
        placeHint: {
          placeId: chosen,
          estimatedPlaceId: guess,
          location: SAN_FRANCISCO,
        },
      });
      expect(scan.placeId).toBe(chosen);
      expect(scan.estimatedPlaceId).toBe(guess);
      expect(scan.effectivePlaceId).toBe(chosen);
    });
  });

  /**
   * The existence check a security review asked for at `process`'s
   * `PlaceActor.addMenuFromScan` enqueue (line ~631): `placeHint.placeId`
   * is client-supplied and was validated only for uuid shape, so the worry
   * was that a caller could point a scan at a uuid naming no place and have
   * menu items filed against it once extraction ran.
   *
   * That enqueue is unreachable with such a uuid, and not because of
   * anything in this file: `menu_scans.place_id` is a real foreign key to
   * `places(id)` (`menu_scans_place_id_places_id_fkey`,
   * `packages/db/migrations/20260910003220_opposite_havok/migration.sql`),
   * so the *insert* this method makes is refused by Postgres itself before a
   * row — or the `process` outbox row that would eventually reach
   * `PlaceActor` — ever exists. `translateFkViolation` (below in this file)
   * turns that constraint violation into this `NotFoundError`, the same
   * translation already covered by the "upload never happened" tests above
   * for `original_image_id` / `processed_image_id`. This test is the same
   * proof for the third and fourth FKs on this row: no `menu_scans` row, no
   * `process` outbox row, so there is nothing left for `process` to enqueue
   * `addMenuFromScan` toward.
   */
  it("create: a placeHint naming no place is refused before anything is written (place_id FK)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const fileId = await seedFile(db);
      const scanId = crypto.randomUUID();
      const actor = await activate(newScanActor(scanId, db));
      const ghostPlaceId = crypto.randomUUID();

      await expect(
        actor.create(userCtx(owner, "r1"), {
          originalImageId: fileId,
          placeHint: { placeId: ghostPlaceId },
        }),
      ).rejects.toBeInstanceOf(NotFoundError);

      expect(
        await db.select().from(menuScans).where(eq(menuScans.id, scanId)),
      ).toEqual([]);
      expect(await outboxRows(db, scanId)).toEqual([]);
    });
  });

  /** Same FK, the other client-suppliable column that feeds `effectivePlaceId`. */
  it("create: an estimatedPlaceId naming no place is refused the same way", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const fileId = await seedFile(db);
      const scanId = crypto.randomUUID();
      const actor = await activate(newScanActor(scanId, db));

      await expect(
        actor.create(userCtx(owner, "r1"), {
          originalImageId: fileId,
          placeHint: { estimatedPlaceId: crypto.randomUUID() },
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(
        await db.select().from(menuScans).where(eq(menuScans.id, scanId)),
      ).toEqual([]);
      expect(await outboxRows(db, scanId)).toEqual([]);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* create: the upload has to have happened (E2d)                           */
  /* ---------------------------------------------------------------------- */

  /**
   * The defect E2 found in the browser: `createUploadTarget` mints the `files`
   * row before any bytes move, so the FK passes and the scan was created
   * happily against an empty object. It only failed three outbox hops later,
   * in `process`, leaving a junk row behind.
   *
   * The refusal has to leave **nothing**: no `menu_scans` row and no `process`
   * outbox row. Both are asserted, because the gate sitting after the insert
   * instead of before it would still throw and still leave the mess.
   */
  it("create: refuses a file whose upload never happened, and writes nothing", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const unverified = await seedUnverifiedFile(db);
      const scanId = crypto.randomUUID();
      const actor = await activate(newScanActor(scanId, db));

      await expect(
        actor.create(userCtx(owner, "r1"), { originalImageId: unverified }),
      ).rejects.toBeInstanceOf(ConflictError);

      expect(
        await db.select().from(menuScans).where(eq(menuScans.id, scanId)),
      ).toEqual([]);
      expect(await outboxRows(db, scanId)).toEqual([]);
    });
  });

  /**
   * Verifying `originalImageId` and forgetting `processedImageId` is the
   * obvious half-fix: it is nullable and rarer, and it is the same
   * caller-supplied id with the same FK and the same nothing behind it.
   */
  it("create: refuses an unverified processedImageId even when the original is fine", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const good = await seedFile(db);
      const bad = await seedUnverifiedFile(db);
      const scanId = crypto.randomUUID();
      const actor = await activate(newScanActor(scanId, db));

      await expect(
        actor.create(userCtx(owner, "r1"), {
          originalImageId: good,
          processedImageId: bad,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(await outboxRows(db, scanId)).toEqual([]);
    });
  });

  /**
   * A file that exists and is verified still goes through the seam — the
   * counterpart assertion, so "refuses everything" cannot pass this suite.
   */
  it("create: a verified file is accepted, and the seam is consulted exactly once per id", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const fileId = await seedFile(db);
      const scanId = crypto.randomUUID();
      const asked: string[] = [];
      const counting: VerifyFile = async (ctx, id) => {
        asked.push(id);
        return dbVerifyFile(db)(ctx, id);
      };
      const actor = await activate(
        newScanActor(scanId, db, neverExtract, counting),
      );

      await actor.create(userCtx(owner, "r1"), { originalImageId: fileId });
      expect(asked).toEqual([fileId]);

      // …and the idempotent retry returns the existing row without paying for
      // a second sidecar hop.
      await actor.create(userCtx(owner, "r2"), { originalImageId: fileId });
      expect(asked).toEqual([fileId]);
    });
  });

  /**
   * §1.5: authorize before anything else. An unverified file must not be able
   * to tell an anonymous caller — or a stranger holding somebody else's scan
   * id — anything at all, so the refusal they get is the *ownership* one.
   */
  it("create: owner / friend / stranger / anonymous on an id that already exists", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const friend = await seedUser(db);
      const stranger = await seedUser(db);
      const fileId = await seedFile(db);
      const scanId = crypto.randomUUID();
      const actor = await activate(newScanActor(scanId, db));

      expect(
        (await actor.create(userCtx(owner, "r1"), { originalImageId: fileId }))
          .id,
      ).toBe(scanId);

      // §2.1 is "scan owner only", so a friend is a stranger here too, and
      // neither may take over the id by re-creating it.
      for (const viewer of [friend, stranger]) {
        await expect(
          actor.create(userCtx(viewer, `r-${viewer}`), {
            originalImageId: fileId,
          }),
        ).rejects.toBeInstanceOf(NotFoundError);
      }
      await expect(
        actor.create(anonymousCtx("r-anon"), { originalImageId: fileId }),
      ).rejects.toBeInstanceOf(ForbiddenError);

      // Still exactly one scan, still exactly one `process`.
      expect(await outboxRows(db, scanId)).toHaveLength(1);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* process — what replaced the event trigger                               */
  /* ---------------------------------------------------------------------- */

  it("process: a request may not call it; only the outbox's system ctx or an admin", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const scanId = await seedScan(db, { userId: owner });
      const actor = await activate(newScanActor(scanId, db));
      await expect(
        actor.process(userCtx(owner, "r1"), {}),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  it("process: extracts, files the menu against the place, and queues the match — three outbox rows in order", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const placeId = await seedPlace(db, { name: "Bar", ...SAN_FRANCISCO });
      const scanId = await seedScan(db, { userId: owner, placeId });
      const actor = await activate(
        newScanActor(scanId, db, async () => extraction()),
      );
      const mark = await outboxHighWater(db);

      const result = await actor.process(testDelivery("row-1"), {
        menuScanId: scanId,
      });
      expect(result.alreadyProcessed).toBe(false);
      expect(result.itemsDetected).toBe(2);
      expect(result.placeId).toBe(placeId);

      const scan = await actor.get(userCtx(owner, "r1"));
      expect(scan.processingStatus).toBe("completed");
      expect(scan.processingModel).toBe("fake-vision-1");
      expect(scan.itemsDetected).toBe(2);
      expect(scan.confidenceScore).toBeCloseTo(0.85, 2);
      expect(scan.extractedText).toContain("House Negroni");

      // §1.4 + A7b: `outbox.seq` orders the first attempts, so the menu items
      // are filed before the match goes looking for them.
      const rows = await outboxSince(db, mark);
      expect(rows.map((row) => `${row.targetActor}.${row.method}`)).toEqual([
        "PlaceActor.addMenuFromScan",
        "MenuScanActor.match",
      ]);
      expect(rows[0]?.targetId).toBe(placeId);
      expect(rows[1]?.targetId).toBe(scanId);
    });
  });

  it("process: the scanned type travels in `detectedItemType` verbatim, `cocktail` included (B8b)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const placeId = await seedPlace(db, { name: "Bar", ...SAN_FRANCISCO });
      const scanId = await seedScan(db, { userId: owner, placeId });
      const actor = await activate(
        newScanActor(scanId, db, async () => extraction()),
      );
      await actor.process(testDelivery("row-1"), {});

      const rows = await outboxRows(db, placeId);
      const payload = rows[0]?.payload as {
        items: {
          name: string;
          detectedItemType: string;
          searchName: string | null;
          extractedAttributes: Record<string, unknown>;
        }[];
      };
      const cocktail = payload.items.find((i) => i.name === "House Negroni");
      // `place_menu_items_detected_item_type_check` was widened by B8b to the
      // eight values the scanner emits, so `detectedItemType` carries the real
      // type — and, since `place_menu_items_scan_columns`, it and `searchName`
      // are the only copies: `extracted_attributes` no longer duplicates them.
      expect(cocktail?.detectedItemType).toBe("cocktail");
      expect(cocktail?.searchName).toBe("House Negroni");
      expect(cocktail?.extractedAttributes).not.toHaveProperty("scanItemType");
      expect(cocktail?.extractedAttributes).not.toHaveProperty("search_name");
      const wine = payload.items.find((i) => i.name === "Chateau Test 2019");
      expect(wine?.detectedItemType).toBe("wine");
      expect(wine?.extractedAttributes).not.toHaveProperty("scanItemType");
    });
  });

  it("process: a redelivery is a no-op — no second `addMenuFromScan`, so no duplicated menu items (§8.4)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const placeId = await seedPlace(db, { name: "Bar", ...SAN_FRANCISCO });
      const scanId = await seedScan(db, { userId: owner, placeId });
      let calls = 0;
      const actor = await activate(
        newScanActor(scanId, db, async () => {
          calls += 1;
          return extraction();
        }),
      );

      const mark = await outboxHighWater(db);
      await actor.process(testDelivery("row-1"), {});
      const second = await actor.process(testDelivery("row-2"), {});

      expect(second.alreadyProcessed).toBe(true);
      expect(calls).toBe(1);
      expect(await outboxSince(db, mark)).toHaveLength(2);
    });
  });

  /**
   * The row `create` would have enqueued, put in the state a drainer leaves it
   * in while delivering attempt `attempts + 1` — so `process` sees a real
   * delivery and can ask whether the outbox will try again.
   */
  const processDelivery = async (
    db: DbOrTx,
    scanId: string,
    attempts: number,
  ) => {
    const rowId = await enqueueOutbox(
      db,
      OUTBOX_TARGETS["MenuScanActor.process"],
      {
        targetId: scanId,
        payload: { menuScanId: scanId },
      },
    );
    await db
      .update(outbox)
      .set({ status: "delivering", attempts })
      .where(eq(outbox.id, rowId));
    return deliveryCtx(rowId, attempts);
  };

  it("process: a failure the outbox will retry keeps the scan processing, with the error recorded", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const scanId = await seedScan(db, { userId: owner });
      let fail = true;
      const actor = await activate(
        newScanActor(scanId, db, async () => {
          if (fail) throw new ConflictError("the model was unavailable");
          return extraction();
        }),
      );

      const delivery = await processDelivery(db, scanId, 0);
      await expect(actor.process(delivery, {})).rejects.toBeInstanceOf(
        ConflictError,
      );
      const retrying = await actor.get(userCtx(owner, "r1"));
      // Not `failed`: nine more attempts are coming.
      expect(retrying.processingStatus).toBe("processing");
      expect(retrying.processingError).toBe(
        "CONFLICT: the model was unavailable",
      );

      // The retry succeeds; nothing ever said `failed`, and completion is
      // what clears the error.
      fail = false;
      const done = await actor.process(delivery, {});
      expect(done.status).toBe("completed");
      const scan = await actor.get(userCtx(owner, "r2"));
      expect(scan.processingStatus).toBe("completed");
      expect(scan.processingError).toBeNull();
    });
  });

  it("process: the failure on the outbox's last attempt records the error, marks the scan failed and rethrows", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const scanId = await seedScan(db, { userId: owner });
      const actor = await activate(
        newScanActor(scanId, db, async () => {
          throw new ConflictError("the model was unavailable");
        }),
      );

      const delivery = await processDelivery(db, scanId, MAX_ATTEMPTS - 1);
      const mark = await outboxHighWater(db);
      await expect(actor.process(delivery, {})).rejects.toBeInstanceOf(
        ConflictError,
      );

      const scan = await actor.get(userCtx(owner, "r1"));
      expect(scan.processingStatus).toBe("failed");
      // The operator keeps every byte the raiser wrote — that detail is what
      // identified a corrupt image fixture as the cause of thirteen dead
      // scans — and now keeps the class with it, so the API can pick a
      // user-facing sentence without substring-matching the prose. Nothing
      // here is what a client is shown: see
      // `services/api/src/schema/failure-summary.ts`.
      expect(scan.processingError).toContain("the model was unavailable");
      expect(scan.processingError).toBe("CONFLICT: the model was unavailable");
      expect(await outboxSince(db, mark)).toHaveLength(0);
    });
  });

  it("process: a failure no retry can clear fails the scan on the first attempt", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const scanId = await seedScan(db, { userId: owner });
      const actor = await activate(
        newScanActor(scanId, db, async () => {
          throw new ValidationError("these bytes are not an image");
        }),
      );

      const delivery = await processDelivery(db, scanId, 0);
      await expect(actor.process(delivery, {})).rejects.toBeInstanceOf(
        ValidationError,
      );
      const scan = await actor.get(userCtx(owner, "r1"));
      expect(scan.processingStatus).toBe("failed");
      expect(scan.processingError).toBe(
        "VALIDATION: these bytes are not an image",
      );
    });
  });

  it("process: an admin's forced run has no retry behind it, so its failure is final", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const admin = await seedUser(db);
      const scanId = await seedScan(db, { userId: owner });
      const actor = await activate(
        newScanActor(scanId, db, async () => {
          throw new ConflictError("the model was unavailable");
        }),
      );
      await expect(
        actor.process(adminCtx(admin, "repair"), {}),
      ).rejects.toBeInstanceOf(ConflictError);
      expect((await actor.get(userCtx(owner, "r1"))).processingStatus).toBe(
        "failed",
      );
    });
  });

  it("process: with no place, the scan completes and nothing is filed or matched", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const scanId = await seedScan(db, { userId: owner, placeId: null });
      const actor = await activate(
        newScanActor(scanId, db, async () => extraction()),
      );
      const mark = await outboxHighWater(db);
      const result = await actor.process(testDelivery("row-1"), {});
      expect(result.placeId).toBeNull();
      expect(result.itemsDetected).toBe(2);
      expect(await outboxSince(db, mark)).toHaveLength(0);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* match                                                                   */
  /* ---------------------------------------------------------------------- */

  it("match: a request may not call it", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const scanId = await seedScan(db, { userId: owner, status: "completed" });
      const actor = await activate(newScanActor(scanId, db));
      await expect(
        actor.match(userCtx(owner, "r1"), {}),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  it("match: refuses before extraction has completed, so the outbox retries", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const placeId = await seedPlace(db, { name: "Bar", ...SAN_FRANCISCO });
      const scanId = await seedScan(db, {
        userId: owner,
        placeId,
        status: "processing",
      });
      const actor = await activate(newScanActor(scanId, db));
      await expect(
        actor.match(testDelivery("row-1"), {}),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  it("match: queues MenuMatchJobActor once — §8.5 forbids an entity actor from calling a search actor", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const placeId = await seedPlace(db, { name: "Bar", ...SAN_FRANCISCO });
      const scanId = await seedScan(db, {
        userId: owner,
        placeId,
        status: "completed",
      });
      const actor = await activate(newScanActor(scanId, db));
      const mark = await outboxHighWater(db);

      const first = await actor.match(testDelivery("row-1"), {});
      expect(first.started).toBe(true);
      expect(first.jobId).toBe(menuMatchJobId(scanId));

      const queued = await outboxSince(db, mark);
      expect(queued).toEqual([
        {
          targetActor: "MenuMatchJobActor",
          targetId: menuMatchJobId(scanId),
          method: "start",
        },
      ]);

      // A redelivery once the job row exists starts nothing further.
      await db.execute(sql`
        insert into public.jobs (id, kind, status, cursor, payload)
        values (${menuMatchJobId(scanId)}::uuid, 'menu-match', 'running',
                '{"batch":0,"value":null}'::jsonb,
                ${JSON.stringify({ menuScanId: scanId })}::jsonb)
      `);
      const second = await actor.match(testDelivery("row-2"), {});
      expect(second.started).toBe(false);
      expect(await outboxSince(db, mark)).toHaveLength(1);
    });
  });

  it("match: a scan with no place starts no job", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const scanId = await seedScan(db, { userId: owner, status: "completed" });
      const actor = await activate(newScanActor(scanId, db));
      const mark = await outboxHighWater(db);
      const result = await actor.match(testDelivery("row-1"), {});
      expect(result.started).toBe(false);
      expect(result.jobId).toBeNull();
      expect(await outboxSince(db, mark)).toHaveLength(0);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* recordSuggestions                                                       */
  /* ---------------------------------------------------------------------- */

  it("recordSuggestions: a request may not call it, and a foreign menu item is refused", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const placeId = await seedPlace(db, { name: "Bar", ...SAN_FRANCISCO });
      const mine = await seedScan(db, { userId: owner, placeId });
      const theirs = await seedScan(db, { userId: owner, placeId });
      const foreignItem = await seedMenuItem(db, {
        placeId,
        menuScanId: theirs,
        name: "Someone else's line",
      });
      const actor = await activate(newScanActor(mine, db));

      await expect(
        actor.recordSuggestions(userCtx(owner, "r1"), {
          placeMenuItemIds: [],
          suggestions: [],
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);

      await expect(
        actor.recordSuggestions(testDelivery("row-1"), {
          placeMenuItemIds: [foreignItem],
          suggestions: [],
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  it("recordSuggestions: redelivery replaces rather than duplicates, and `items_matched` is recomputed", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const placeId = await seedPlace(db, { name: "Bar", ...SAN_FRANCISCO });
      const scanId = await seedScan(db, { userId: owner, placeId });
      const menuItemId = await seedMenuItem(db, {
        placeId,
        menuScanId: scanId,
        name: "Chateau Test",
      });
      const wine = await seedWine(db, owner, "Chateau Test 2019");
      const actor = await activate(newScanActor(scanId, db));

      const input = {
        placeMenuItemIds: [menuItemId],
        suggestions: [
          {
            placeMenuItemId: menuItemId,
            target: { kind: "ITEM" as const, item: wine },
            confidenceScore: 0.93,
            matchReasoning: "vector",
          },
        ],
      };
      const first = await actor.recordSuggestions(testDelivery("row-1"), input);
      expect(first.created).toBe(1);
      expect(first.replaced).toBe(0);
      expect(first.itemsMatched).toBe(1);

      const second = await actor.recordSuggestions(
        testDelivery("row-2"),
        input,
      );
      expect(second.created).toBe(1);
      expect(second.replaced).toBe(1);
      expect(second.itemsMatched).toBe(1);
      expect(await countSuggestions(db, scanId)).toBe(1);
    });
  });

  it("recordSuggestions: a suggestion the user has already acted on survives a re-run", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const placeId = await seedPlace(db, { name: "Bar", ...SAN_FRANCISCO });
      const scanId = await seedScan(db, { userId: owner, placeId });
      const menuItemId = await seedMenuItem(db, {
        placeId,
        menuScanId: scanId,
        name: "Chateau Test",
      });
      const wine = await seedWine(db, owner, "Chateau Test 2019");
      const other = await seedWine(db, owner, "Another Wine");
      const actor = await activate(newScanActor(scanId, db));

      await actor.recordSuggestions(testDelivery("row-1"), {
        placeMenuItemIds: [menuItemId],
        suggestions: [
          {
            placeMenuItemId: menuItemId,
            target: { kind: "ITEM", item: wine },
            confidenceScore: 0.93,
          },
        ],
      });
      const page = await actor.suggestions(
        userCtx(owner, "r1"),
        pageArgs({ first: 10 }),
      );
      const suggestionId = page.entries[0]?.node.id as string;
      await actor.actOnSuggestion(userCtx(owner, "r2"), {
        suggestionId,
        action: "REJECT",
      });

      await actor.recordSuggestions(testDelivery("row-2"), {
        placeMenuItemIds: [menuItemId],
        suggestions: [
          {
            placeMenuItemId: menuItemId,
            target: { kind: "ITEM", item: other },
            confidenceScore: 0.91,
          },
        ],
      });

      const after = await actor.suggestions(
        userCtx(owner, "r3"),
        pageArgs({ first: 10 }),
      );
      expect(after.entries).toHaveLength(2);
      expect(after.entries.map((entry) => entry.node.rejected).sort()).toEqual([
        null,
        true,
      ]);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* actOnSuggestion                                                         */
  /* ---------------------------------------------------------------------- */

  it("actOnSuggestion: the owner accepts and the acceptance is propagated to PlaceActor by outbox", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const stranger = await seedUser(db);
      const placeId = await seedPlace(db, { name: "Bar", ...SAN_FRANCISCO });
      const scanId = await seedScan(db, { userId: owner, placeId });
      const menuItemId = await seedMenuItem(db, {
        placeId,
        menuScanId: scanId,
        name: "Chateau Test",
      });
      const wine = await seedWine(db, owner, "Chateau Test 2019");
      const actor = await activate(newScanActor(scanId, db));
      await actor.recordSuggestions(testDelivery("seed"), {
        placeMenuItemIds: [menuItemId],
        suggestions: [
          {
            placeMenuItemId: menuItemId,
            target: { kind: "ITEM", item: wine },
            confidenceScore: 0.95,
          },
        ],
      });
      const page = await actor.suggestions(
        userCtx(owner, "r1"),
        pageArgs({ first: 10 }),
      );
      const suggestionId = page.entries[0]?.node.id as string;

      // A stranger cannot mutate it, and cannot learn it exists.
      await expect(
        actor.actOnSuggestion(userCtx(stranger, "r2"), {
          suggestionId,
          action: "ACCEPT",
        }),
      ).rejects.toBeInstanceOf(NotFoundError);

      const result = await actor.actOnSuggestion(userCtx(owner, "r3"), {
        suggestionId,
        action: "ACCEPT",
      });
      expect(result.suggestion.accepted).toBe(true);
      expect(result.suggestion.actedBy).toBe(owner);
      expect(result.propagated).toBe(true);

      const queued = await outboxRows(db, placeId);
      expect(queued).toEqual([
        {
          targetActor: "PlaceActor",
          method: "verifyMenuItemMatch",
          payload: {
            menuItemId,
            match: { type: "wine", id: wine.id },
          },
        },
      ]);

      // Re-applying the same action enqueues nothing further (§8.4).
      const again = await actor.actOnSuggestion(userCtx(owner, "r4"), {
        suggestionId,
        action: "ACCEPT",
      });
      expect(again.propagated).toBe(false);
      expect(await outboxRows(db, placeId)).toHaveLength(1);
    });
  });

  it("actOnSuggestion: a recipe acceptance is homed on `menu_item_recipes` via PlaceActor (B8c), once", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const placeId = await seedPlace(db, { name: "Bar", ...SAN_FRANCISCO });
      const scanId = await seedScan(db, { userId: owner, placeId });
      const menuItemId = await seedMenuItem(db, {
        placeId,
        menuScanId: scanId,
        name: "House Negroni",
        scanItemType: "cocktail",
      });
      const recipeId = await seedRecipe(db, { name: "Negroni" });
      const actor = await activate(newScanActor(scanId, db));
      await actor.recordSuggestions(testDelivery("seed"), {
        placeMenuItemIds: [menuItemId],
        suggestions: [
          {
            placeMenuItemId: menuItemId,
            target: { kind: "RECIPE", recipeId },
            confidenceScore: 0.92,
          },
        ],
      });
      const page = await actor.suggestions(
        userCtx(owner, "r1"),
        pageArgs({ first: 10 }),
      );
      const suggestion = page.entries[0]?.node;
      expect(suggestion?.target).toEqual({ kind: "RECIPE", recipeId });

      const result = await actor.actOnSuggestion(userCtx(owner, "r2"), {
        suggestionId: suggestion?.id as string,
        action: "ACCEPT",
      });
      expect(result.suggestion.accepted).toBe(true);
      expect(result.propagated).toBe(true);

      // Before B8c this enqueued nothing and the acceptance died here. The
      // row goes to `PlaceActor` — the single writer of `menu_item_recipes`
      // (§1.2, §3) — and through the outbox, so §8.5's closed set of
      // synchronous entity→entity edges is untouched.
      expect(await outboxRows(db, placeId)).toEqual([
        {
          targetActor: "PlaceActor",
          method: "linkMenuItemRecipe",
          payload: { menuItemId, recipeId },
        },
      ]);

      // §8.4: accepting twice enqueues nothing further.
      const again = await actor.actOnSuggestion(userCtx(owner, "r3"), {
        suggestionId: suggestion?.id as string,
        action: "ACCEPT",
      });
      expect(again.propagated).toBe(false);
      expect(await outboxRows(db, placeId)).toHaveLength(1);
    });
  });

  it("actOnSuggestion: a SAKE acceptance reaches `place_menu_items` like any item", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const placeId = await seedPlace(db, { name: "Bar", ...SAN_FRANCISCO });
      const scanId = await seedScan(db, { userId: owner, placeId });
      const menuItemId = await seedMenuItem(db, {
        placeId,
        menuScanId: scanId,
        name: "Junmai Daiginjo",
        scanItemType: "sake",
      });
      const sakeId = await seedSake(db, owner, "Junmai Daiginjo");
      const actor = await activate(newScanActor(scanId, db));
      await actor.recordSuggestions(testDelivery("seed"), {
        placeMenuItemIds: [menuItemId],
        suggestions: [
          {
            placeMenuItemId: menuItemId,
            target: { kind: "ITEM", item: { type: "SAKE", id: sakeId } },
            confidenceScore: 0.9,
          },
        ],
      });
      const page = await actor.suggestions(
        userCtx(owner, "r1"),
        pageArgs({ first: 10 }),
      );

      const result = await actor.actOnSuggestion(userCtx(owner, "r2"), {
        suggestionId: page.entries[0]?.node.id as string,
        action: "ACCEPT",
      });
      expect(result.suggestion.accepted).toBe(true);
      // It used to stop here: `place_menu_items` had no `sake_id` until
      // 20260928043553_place_menu_items_sake_tea_matches.
      expect(result.propagated).toBe(true);
      expect(await outboxRows(db, placeId)).toEqual([
        {
          targetActor: "PlaceActor",
          method: "verifyMenuItemMatch",
          payload: { menuItemId, match: { type: "sake", id: sakeId } },
        },
      ]);
    });
  });

  it("actOnSuggestion: a suggestion from another scan reads as NotFound", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const placeId = await seedPlace(db, { name: "Bar", ...SAN_FRANCISCO });
      const mine = await seedScan(db, { userId: owner, placeId });
      const theirs = await seedScan(db, { userId: owner, placeId });
      const theirItem = await seedMenuItem(db, {
        placeId,
        menuScanId: theirs,
        name: "Their line",
      });
      const wine = await seedWine(db, owner, "Their Wine");
      const other = await activate(newScanActor(theirs, db));
      await other.recordSuggestions(testDelivery("seed"), {
        placeMenuItemIds: [theirItem],
        suggestions: [
          {
            placeMenuItemId: theirItem,
            target: { kind: "ITEM", item: wine },
            confidenceScore: 0.95,
          },
        ],
      });
      const page = await other.suggestions(
        userCtx(owner, "r1"),
        pageArgs({ first: 10 }),
      );
      const suggestionId = page.entries[0]?.node.id as string;

      const actor = await activate(newScanActor(mine, db));
      await expect(
        actor.actOnSuggestion(userCtx(owner, "r2"), {
          suggestionId,
          action: "ACCEPT",
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* The AI seams                                                            */
  /* ---------------------------------------------------------------------- */

  it("both AI seams throw loudly when unconfigured, rather than faking success", async () => {
    const ctx = systemCtx("r1");
    await expect(
      unconfiguredMenuExtraction(ctx, {
        menuScanId: crypto.randomUUID(),
        originalImageId: crypto.randomUUID(),
        processedImageId: null,
        placeId: null,
      }),
    ).rejects.toThrow(/no AI provider is configured for menu scanning/);
    await expect(
      unconfiguredMenuMatchVerifier(ctx, {
        placeMenuItemId: crypto.randomUUID(),
        menuItemName: "House Negroni",
        menuItemDescription: null,
        itemType: "cocktail",
        candidates: [],
      }),
    ).rejects.toThrow(/no AI provider is configured to verify/);
  });
});

/* -------------------------------------------------------------------------- */
/* Concealment: a stranger's scan and no scan answer alike                     */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* markFailed — process's onDead                                               */
/* -------------------------------------------------------------------------- */

describe.skipIf(skip)("MenuScanActor.markFailed", () => {
  afterAll(closeTestDb);

  const notice = (
    reason: "attempts" | "permanent" | "reclaim" = "reclaim",
  ) => ({
    deadOutboxId: crypto.randomUUID(),
    deadMethod: "process",
    reason,
    deadPayload: {},
  });

  it("fails a scan left processing by a dead extraction (the reclaim path)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const scanId = await seedScan(db, {
        userId: owner,
        status: "processing",
      });
      const actor = await activate(newScanActor(scanId, db));
      expect(await actor.markFailed(testDelivery("c"), notice())).toEqual({
        compensated: true,
      });
      const scan = await actor.get(userCtx(owner, "r"));
      expect(scan.processingStatus).toBe("failed");
      expect(scan.processingError).toContain(
        "gave up on this scan's extraction (reclaim)",
      );
    });
  });

  it("keeps the error a failing attempt stored", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const scanId = await seedScan(db, {
        userId: owner,
        status: "processing",
      });
      await db
        .update(menuScans)
        .set({ processingError: "CONFLICT: the model was unavailable" })
        .where(eq(menuScans.id, scanId));
      const actor = await activate(newScanActor(scanId, db));
      await actor.markFailed(testDelivery("c"), notice("attempts"));
      const scan = await actor.get(userCtx(owner, "r"));
      expect(scan.processingStatus).toBe("failed");
      expect(scan.processingError).toBe("CONFLICT: the model was unavailable");
    });
  });

  it("leaves a completed or already-failed scan alone, and refuses a request", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      for (const status of ["completed", "failed"] as const) {
        const scanId = await seedScan(db, { userId: owner, status });
        const actor = await activate(newScanActor(scanId, db));
        expect(await actor.markFailed(testDelivery("c"), notice())).toEqual({
          compensated: false,
          reason: "terminal",
        });
        expect((await actor.get(userCtx(owner, "r"))).processingStatus).toBe(
          status,
        );
      }
      const scanId = await seedScan(db, {
        userId: owner,
        status: "processing",
      });
      const actor = await activate(newScanActor(scanId, db));
      for (const ctx of [userCtx(owner, "r"), adminCtx(owner, "r")]) {
        await expect(actor.markFailed(ctx, notice())).rejects.toBeInstanceOf(
          ForbiddenError,
        );
      }
    });
  });
});

/**
 * Every method a stranger can reach, called on a real scan they do not own and
 * on an id that names nothing, must be refused with the same `{ code,
 * message }` (the id itself aside) — `services/api` hands both to the client.
 *
 * The three outbox-delivered methods are the ones that used to fail this:
 * they read the row *before* checking the caller, so an ordinary caller got
 * `Forbidden` for a real id and `NotFound` for a made-up one. They answer
 * `Forbidden` for both now; `code` pins which answer each method gives.
 */
describe.skipIf(skip)("MenuScanActor concealment", () => {
  afterAll(closeTestDb);

  const CALLS: readonly [
    string,
    string,
    (actor: MenuScanActor, ctx: Ctx) => Promise<unknown>,
  ][] = [
    ["get", "NOT_FOUND", (actor, ctx) => actor.get(ctx)],
    [
      "suggestions",
      "NOT_FOUND",
      (actor, ctx) => actor.suggestions(ctx, pageArgs({ first: 5 })),
    ],
    [
      "actOnSuggestion",
      "NOT_FOUND",
      (actor, ctx) =>
        actor.actOnSuggestion(ctx, {
          suggestionId: crypto.randomUUID(),
          action: "ACCEPT",
        }),
    ],
    ["process", "FORBIDDEN", (actor, ctx) => actor.process(ctx)],
    ["match", "FORBIDDEN", (actor, ctx) => actor.match(ctx)],
    [
      "recordSuggestions",
      "FORBIDDEN",
      (actor, ctx) =>
        actor.recordSuggestions(ctx, { placeMenuItemIds: [], suggestions: [] }),
    ],
  ];

  it.each(CALLS)("%s", async (_method, code, call) => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const stranger = userCtx(await seedUser(db), "r-stranger");
      const real = await seedScan(db, { userId: owner });
      const absent = crypto.randomUUID();

      const hidden = await refusalOf(
        async () => call(await activate(newScanActor(real, db)), stranger),
        real,
      );
      const missing = await refusalOf(
        async () => call(await activate(newScanActor(absent, db)), stranger),
        absent,
      );
      expect(hidden).toEqual(missing);
      expect(hidden.code).toBe(code);
    });
  });
});
