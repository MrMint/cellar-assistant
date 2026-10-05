/**
 * `ItemOnboardingActor` against a real Postgres (B2).
 *
 * The load-bearing test here is **"`confirm` re-delivered twice creates one
 * item, one brand link, one cellar item"** (§6 B2's acceptance). It is not
 * asserted against stubs: the outbox rows `confirm` writes are read back and
 * dispatched to real in-process `ItemActor` / `CellarActor` instances sharing
 * the test's transaction — which is what the drainer does, minus the sidecar.
 *
 * The second load-bearing one is `start`: the AI provider is an injected seam
 * (`../lib/item-defaults.ts`), so the whole flow is exercised without
 * credentials, and the failure path — no provider configured — is a
 * `ConflictError` rather than a 500.
 */
import { randomUUID } from "node:crypto";
import type { Ctx } from "@cellar-assistant/contracts";
import {
  adminCtx,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  systemCtx,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { files, friends, outbox } from "@cellar-assistant/db";
import { asc, eq, sql } from "@cellar-assistant/db/orm";
import { isOwner } from "@cellar-assistant/policy";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import { derivedUuid } from "../lib/derived-uuid.ts";
import type { VerifyFile } from "../lib/file-verification.ts";
import type {
  ItemDefaultsProvider,
  ItemDefaultsRequest,
  ItemDefaultsResult,
} from "../lib/item-defaults.ts";
import { unconfiguredItemDefaults } from "../lib/item-defaults.ts";
import {
  activate,
  closeTestDb,
  deliveryCtx,
  refusalOf,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { CellarActor } from "./cellar-actor.ts";
import { ItemActor } from "./item-actor.ts";
import type { BarcodeEnsurer, BrandResolver } from "./item-onboarding-actor.ts";
import { ItemOnboardingActor } from "./item-onboarding-actor.ts";

const daprClient = (): DaprClient =>
  new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" });

const fakeDefaults: ItemDefaultsResult = {
  defaults: { name: "Château Test", vintage: "2019-01-01", style: "RED" },
  raw: '{"name":"Château Test"}',
  model: "test-vision-1",
  confidence: 0.82,
  brandName: "Château Test",
};

const provider = (result = fakeDefaults): ItemDefaultsProvider => {
  const fn: ItemDefaultsProvider & { calls: number } = Object.assign(
    async () => {
      fn.calls += 1;
      return result;
    },
    { calls: 0 },
  );
  return fn;
};

/** Like `provider`, but keeps the requests so the ids the model saw can be asserted. */
const recordingProvider = (): ItemDefaultsProvider & {
  seen: ItemDefaultsRequest[];
} => {
  const seen: ItemDefaultsRequest[] = [];
  const fn: ItemDefaultsProvider = async (_ctx, request) => {
    seen.push(request);
    return fakeDefaults;
  };
  return Object.assign(fn, { seen });
};

/**
 * `FileActor.verify` without a sidecar, modelling **both** of its checks —
 * `verified_at` and `#requireUploaderOrBypass` — exactly as
 * `recipe-photo-job-actor.test.ts` does. Reading the real `files` row rather
 * than answering a constant is the point: the fixture decides, so a test passes
 * because its seed is right and not because the fake always says yes.
 */
const dbVerifyFile =
  (db: DbOrTx): VerifyFile =>
  async (ctx, fileId) => {
    const [row] = await db
      .select({ verifiedAt: files.verifiedAt, uploadedBy: files.uploadedBy })
      .from(files)
      .where(eq(files.id, fileId));
    if (row === undefined) throw new NotFoundError(`file ${fileId} not found`);
    if (!isOwner(ctx, row.uploadedBy)) {
      throw new ForbiddenError(`file ${fileId} is not yours`);
    }
    return { id: fileId, verifiedAt: row.verifiedAt?.toISOString() ?? null };
  };

const newOnboardingActor = (
  id: string,
  db: DbOrTx,
  defaultsProvider: ItemDefaultsProvider = unconfiguredItemDefaults,
  ensureBarcode: BarcodeEnsurer = async (_ctx, code) => ({ code }),
  resolveBrand: BrandResolver = async () => {
    throw new Error("no BrandRegistryActor in this test");
  },
  verifyFile?: VerifyFile,
): ItemOnboardingActor =>
  new ItemOnboardingActor(
    daprClient(),
    new ActorId(id),
    db,
    defaultsProvider,
    ensureBarcode,
    resolveBrand,
    verifyFile ?? dbVerifyFile(db),
  );

/* -------------------------------------------------------------------------- */
/* An in-process outbox drainer                                                */
/* -------------------------------------------------------------------------- */

/**
 * Deliver every pending `outbox` row, in `seq` order, to a real actor sharing
 * this transaction — the drainer's behaviour without the sidecar hop
 * (`OutboxActor.deliver` invokes exactly `method(testDelivery("<id>"),
 * payload)`).
 *
 * A row whose target is not yet created fails and is *retried on the next
 * pass*, which is how the create → linkBrand → addItem chain converges even if
 * ordering is disturbed. `passes` bounds that.
 */
const drain = async (db: DbOrTx, passes = 3): Promise<number> => {
  let delivered = 0;
  for (let pass = 0; pass < passes; pass += 1) {
    const rows = await db
      .select()
      .from(outbox)
      .where(eq(outbox.status, "pending"))
      .orderBy(asc(outbox.seq));
    if (rows.length === 0) break;
    for (const row of rows) {
      const ctx = deliveryCtx(row.id);
      const payload = row.payload as Record<string, unknown>;
      try {
        if (row.method === "regenerateVector") {
          // `ItemActor.create` enqueues one of these. Delivering it would
          // reach the real `EmbeddingActor` seam — a sidecar call this
          // harness has no sidecar for, and not what this file is testing.
          // `item-actor.test.ts` covers it directly.
          await db
            .update(outbox)
            .set({ status: "delivered" })
            .where(eq(outbox.id, row.id));
          continue;
        }
        if (row.targetActor === "ItemActor") {
          const actor = await activate(
            new ItemActor(daprClient(), new ActorId(row.targetId), db),
          );
          await (
            actor as unknown as Record<
              string,
              (c: unknown, p: unknown) => Promise<unknown>
            >
          )[row.method]?.(ctx, payload);
        } else if (row.targetActor === "CellarActor") {
          const actor = await activate(
            new CellarActor(daprClient(), new ActorId(row.targetId), db),
          );
          await (
            actor as unknown as Record<
              string,
              (c: unknown, p: unknown) => Promise<unknown>
            >
          )[row.method]?.(ctx, payload);
        } else {
          // `regenerateVector` targets ItemActor too; anything else in this
          // test would be a bug in the test, not the actor.
          throw new Error(`unexpected outbox target ${row.targetActor}`);
        }
        await db
          .update(outbox)
          .set({ status: "delivered" })
          .where(eq(outbox.id, row.id));
        delivered += 1;
      } catch {
        // Left pending for the next pass, exactly as backoff would.
      }
    }
  }
  return delivered;
};

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const seedReferenceValues = async (db: DbOrTx): Promise<void> => {
  await db.execute(
    sql`insert into public.wine_style (value) values ('RED') on conflict do nothing`,
  );
};

const seedCellar = async (db: DbOrTx, createdById: string): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.cellars (id, name, created_by_id, privacy)
    values (${id}::uuid, 'Cellar', ${createdById}::uuid, 'PRIVATE'::permission_type)
  `);
  return id;
};

/** A label photo whose bytes landed — `verified_at` stamped, as `FileActor.verify` leaves it. */
const seedVerifiedFile = async (
  db: DbOrTx,
  uploadedBy: string,
): Promise<string> => {
  const [row] = await db
    .insert(files)
    .values({
      key: `labels/${randomUUID()}.jpg`,
      uploadedBy,
      verifiedAt: new Date(),
    })
    .returning({ id: files.id });
  if (row === undefined) throw new Error("seedVerifiedFile: no row");
  return row.id;
};

/**
 * What `createUploadTarget` leaves behind before any bytes move: a real row, a
 * real FK target, and nothing in the bucket. This is the id an attacker has.
 */
const seedUnverifiedFile = async (
  db: DbOrTx,
  uploadedBy: string,
): Promise<string> => {
  const [row] = await db
    .insert(files)
    .values({ key: `labels/${randomUUID()}.jpg`, uploadedBy })
    .returning({ id: files.id });
  if (row === undefined) throw new Error("seedUnverifiedFile: no row");
  return row.id;
};

const onboardingRows = async (db: DbOrTx, id: string) =>
  (
    await db.execute<{ id: string }>(
      sql`select id from public.item_onboardings where id = ${id}::uuid`,
    )
  ).rows;

/**
 * A `BrandRegistryActor.resolve` stand-in: find-or-create by
 * `lower(trim(name))`, which is exactly what the real registry guarantees
 * (B3). Its idempotency is the reason a redelivered `confirm` cannot make a
 * second brand.
 */
const brandRegistry =
  (db: DbOrTx): BrandResolver =>
  async (_ctx, name) => {
    const normalized = name.trim().toLowerCase();
    const found = await db.execute<{ id: string }>(
      sql`select id from public.brands where lower(trim(name)) = ${normalized} limit 1`,
    );
    const existing = found.rows[0]?.id;
    if (existing !== undefined) return { id: existing };
    const id = randomUUID();
    await db.execute(
      sql`insert into public.brands (id, name) values (${id}::uuid, ${name.trim()})`,
    );
    return { id };
  };

const countOf = async (db: DbOrTx, query: ReturnType<typeof sql>) => {
  const rows = await db.execute<{ count: string }>(query);
  return Number(rows.rows[0]?.count ?? "0");
};

/**
 * Park everything already pending in `outbox`.
 *
 * `outbox` is a real table in a database other suites — and the running compose
 * stack — commit to, so `drain` and the two "exactly these rows are pending"
 * assertions below would otherwise pick up somebody else's row and fail for a
 * reason that has nothing to do with this file. Everything here is rolled back,
 * so parking costs nothing, and it happens *inside* the test transaction, so
 * the running host never sees it. Same helper, same reason, as
 * `user-actor.test.ts`.
 */
const quiesceOutbox = async (db: DbOrTx): Promise<void> => {
  await db
    .update(outbox)
    .set({ status: "delivered" })
    .where(eq(outbox.status, "pending"));
};

/** `withTestDb`, with the queue quiesced first. */
const withOnboardingDb = <T>(fn: (db: DbOrTx) => Promise<T>): Promise<T> =>
  withTestDb(async (db) => {
    await quiesceOutbox(db);
    return fn(db);
  });

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("ItemOnboardingActor (B2)", () => {
  afterAll(closeTestDb);

  it("is an entity actor per §8.3", () => {
    expect(ItemOnboardingActor.category).toBe("entity");
  });

  /* ------------------------------------------------------------------ */
  /* start — the AI seam                                                 */
  /* ------------------------------------------------------------------ */

  describe("start (§8.5: the AI call runs in this actor's turn)", () => {
    it("creates the row and stores the model's proposal", async () => {
      await withOnboardingDb(async (db) => {
        const user = await seedUser(db);
        const ai = provider();
        const actor = await activate(newOnboardingActor(randomUUID(), db, ai));

        const dto = await actor.start(userCtx(user, "r"), {
          itemType: "WINE",
          barcode: "0000000000010",
        });
        expect(dto.status).toBe("COMPLETED");
        expect(dto.itemType).toBe("WINE");
        expect(dto.aiModel).toBe("test-vision-1");
        expect(dto.confidence).toBeCloseTo(0.82);
        expect(JSON.parse(dto.defaults ?? "{}")).toMatchObject({
          name: "Château Test",
        });
      });
    });

    it("is idempotent: a retry after a completed extraction does not call the model again", async () => {
      await withOnboardingDb(async (db) => {
        const user = await seedUser(db);
        const ai = provider() as ItemDefaultsProvider & { calls: number };
        const id = randomUUID();
        const actor = await activate(newOnboardingActor(id, db, ai));

        await actor.start(userCtx(user, "r"), { itemType: "WINE" });
        expect(ai.calls).toBe(1);
        await actor.start(userCtx(user, "r"), { itemType: "WINE" });
        expect(ai.calls).toBe(1);
      });
    });

    it("records FAILED and rethrows when the provider fails", async () => {
      await withOnboardingDb(async (db) => {
        const user = await seedUser(db);
        const id = randomUUID();
        // The default seam: no AI provider is configured in this repository.
        const actor = await activate(newOnboardingActor(id, db));
        await expect(
          actor.start(userCtx(user, "r"), { itemType: "WINE" }),
        ).rejects.toThrow(ConflictError);

        const rows = await db.execute<{ status: string }>(
          sql`select status from public.item_onboardings where id = ${id}::uuid`,
        );
        expect(rows.rows[0]?.status).toBe("FAILED");
      });
    });

    it("refuses an anonymous caller and a non-item type", async () => {
      await withOnboardingDb(async (db) => {
        const actor = await activate(
          newOnboardingActor(randomUUID(), db, provider()),
        );
        await expect(
          actor.start(
            { viewerId: null, kind: "user", requestId: "r" },
            { itemType: "WINE" },
          ),
        ).rejects.toThrow(ForbiddenError);

        const user = await seedUser(db);
        await expect(
          actor.start(userCtx(user, "r"), {
            itemType: "COCKTAIL" as never,
          }),
        ).rejects.toThrow(ValidationError);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* "Never trust the client's done" (§4), fourth instance — E2f          */
  /* ------------------------------------------------------------------ */

  /**
   * E2d closed this on `MenuScanActor.create` and `ItemActor.attachImage`, E2e
   * on `RecipePhotoJobActor.start`, and all three missed `start` — where the
   * ids are not merely stored but **read by a vision model in this actor's own
   * turn**, so the extracted text comes straight back to the caller.
   *
   * Reproduced against a real Postgres before the fix: a signed-in user could
   * pass another user's `files.id` and `start` answered `COMPLETED`, with the
   * victim's id written to `item_onboardings.front_label_image_id` and handed
   * to the seam; an unverified id of the caller's own was accepted the same
   * way; and a non-uuid reached the insert and came back as a
   * `DrizzleQueryError` — no `code`, so `services/api` rendered
   * `INTERNAL_SERVER_ERROR` rather than a typed error member.
   */
  describe("label image verification (§4)", () => {
    it("refuses another user's label image — owner yes, friend no, stranger no", async () => {
      await withOnboardingDb(async (db) => {
        const uploader = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        await db.insert(friends).values([
          { userId: uploader, friendId: friend },
          { userId: friend, friendId: uploader },
        ]);
        const fileId = await seedVerifiedFile(db, uploader);

        const startAs = async (viewer: string): Promise<unknown> => {
          const actor = await activate(
            newOnboardingActor(randomUUID(), db, provider()),
          );
          return actor.start(userCtx(viewer, "r"), {
            itemType: "WINE",
            frontLabelImageId: fileId,
          });
        };

        // `FileActor.verify` is uploader-only (`#requireUploaderOrBypass`), not
        // the wider reader check — so friendship buys nothing here.
        await expect(startAs(uploader)).resolves.toMatchObject({
          status: "COMPLETED",
        });
        await expect(startAs(friend)).rejects.toThrow(ForbiddenError);
        await expect(startAs(stranger)).rejects.toThrow(ForbiddenError);
      });
    });

    it("refuses an unverified label image, and writes no row and calls no model", async () => {
      await withOnboardingDb(async (db) => {
        const user = await seedUser(db);
        const fileId = await seedUnverifiedFile(db, user);
        const ai = recordingProvider();
        const id = randomUUID();
        const actor = await activate(newOnboardingActor(id, db, ai));

        await expect(
          actor.start(userCtx(user, "r"), {
            itemType: "WINE",
            frontLabelImageId: fileId,
          }),
        ).rejects.toThrow(ConflictError);

        // Before the insert, not after: no onboarding row for bytes that
        // never arrived, and no model call to pay for.
        expect(await onboardingRows(db, id)).toEqual([]);
        expect(ai.seen).toEqual([]);
      });
    });

    it("refuses a malformed id with a ValidationError, before any sidecar hop", async () => {
      await withOnboardingDb(async (db) => {
        const user = await seedUser(db);
        const ai = recordingProvider();
        const id = randomUUID();
        const asked: string[] = [];
        const counting: VerifyFile = async (ctx, fileId) => {
          asked.push(fileId);
          return dbVerifyFile(db)(ctx, fileId);
        };
        const actor = await activate(
          newOnboardingActor(id, db, ai, undefined, undefined, counting),
        );

        // Was a `DrizzleQueryError` from the insert — i.e. a 500.
        await expect(
          actor.start(userCtx(user, "r"), {
            itemType: "WINE",
            frontLabelImageId: "not-a-uuid",
          }),
        ).rejects.toThrow(ValidationError);

        // Shape first: a non-uuid must not buy a sidecar round trip either.
        expect(asked).toEqual([]);
        expect(await onboardingRows(db, id)).toEqual([]);
        expect(ai.seen).toEqual([]);
      });
    });

    it("refuses a label image id that has no row at all", async () => {
      await withOnboardingDb(async (db) => {
        const user = await seedUser(db);
        const id = randomUUID();
        const actor = await activate(newOnboardingActor(id, db, provider()));

        await expect(
          actor.start(userCtx(user, "r"), {
            itemType: "WINE",
            frontLabelImageId: randomUUID(),
          }),
        ).rejects.toThrow(NotFoundError);
        expect(await onboardingRows(db, id)).toEqual([]);
      });
    });

    it("checks the back label too, not only the front", async () => {
      await withOnboardingDb(async (db) => {
        const user = await seedUser(db);
        const other = await seedUser(db);
        const front = await seedVerifiedFile(db, user);
        const back = await seedVerifiedFile(db, other);
        const id = randomUUID();
        const actor = await activate(newOnboardingActor(id, db, provider()));

        // The good id is first, so a check that stops after the front label
        // would let this through.
        await expect(
          actor.start(userCtx(user, "r"), {
            itemType: "WINE",
            frontLabelImageId: front,
            backLabelImageId: back,
          }),
        ).rejects.toThrow(ForbiddenError);
        expect(await onboardingRows(db, id)).toEqual([]);
      });
    });

    it("starts when both labels are verified and the caller's own", async () => {
      await withOnboardingDb(async (db) => {
        const user = await seedUser(db);
        const front = await seedVerifiedFile(db, user);
        const back = await seedVerifiedFile(db, user);
        const ai = recordingProvider();
        const id = randomUUID();
        const actor = await activate(newOnboardingActor(id, db, ai));

        const dto = await actor.start(userCtx(user, "r"), {
          itemType: "WINE",
          frontLabelImageId: front,
          backLabelImageId: back,
        });

        expect(dto.status).toBe("COMPLETED");
        expect(dto.frontLabelImageId).toBe(front);
        expect(dto.backLabelImageId).toBe(back);
        expect(ai.seen).toEqual([
          {
            itemType: "WINE",
            frontLabelImageId: front,
            backLabelImageId: back,
            barcode: null,
            barcodeType: null,
          },
        ]);
      });
    });

    /**
     * The path the insert-site fix alone would have missed: a retry after a
     * FAILED extraction skips the insert but still feeds `input`'s ids to the
     * model, so the check has to sit outside that branch.
     */
    it("re-checks on the retry-after-FAILED path, which writes no row", async () => {
      await withOnboardingDb(async (db) => {
        const user = await seedUser(db);
        const stranger = await seedUser(db);
        const mine = await seedVerifiedFile(db, user);
        const theirs = await seedVerifiedFile(db, stranger);
        const id = randomUUID();

        // First attempt: the row exists and is FAILED (no provider configured).
        const failing = await activate(newOnboardingActor(id, db));
        await expect(
          failing.start(userCtx(user, "r"), {
            itemType: "WINE",
            frontLabelImageId: mine,
          }),
        ).rejects.toThrow(ConflictError);
        const failed = await db.execute<{ status: string }>(
          sql`select status from public.item_onboardings where id = ${id}::uuid`,
        );
        expect(failed.rows[0]?.status).toBe("FAILED");

        // The retry swaps in someone else's id. The insert is skipped on this
        // path, so only a check outside that branch catches it.
        const ai = recordingProvider();
        const retry = await activate(newOnboardingActor(id, db, ai));
        await expect(
          retry.start(userCtx(user, "r"), {
            itemType: "WINE",
            frontLabelImageId: theirs,
          }),
        ).rejects.toThrow(ForbiddenError);
        expect(ai.seen).toEqual([]);
      });
    });

    it("costs no verification hop when a completed onboarding is retried", async () => {
      await withOnboardingDb(async (db) => {
        const user = await seedUser(db);
        const front = await seedVerifiedFile(db, user);
        const id = randomUUID();
        const asked: string[] = [];
        const counting: VerifyFile = async (ctx, fileId) => {
          asked.push(fileId);
          return dbVerifyFile(db)(ctx, fileId);
        };
        const actor = await activate(
          newOnboardingActor(
            id,
            db,
            provider(),
            undefined,
            undefined,
            counting,
          ),
        );

        await actor.start(userCtx(user, "r"), {
          itemType: "WINE",
          frontLabelImageId: front,
        });
        expect(asked).toEqual([front]);

        // The idempotency return comes first, exactly as in `MenuScanActor`.
        await actor.start(userCtx(user, "r"), {
          itemType: "WINE",
          frontLabelImageId: front,
        });
        expect(asked).toEqual([front]);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* §2.1 "Visibility: owner only"                                       */
  /* ------------------------------------------------------------------ */

  describe("visibility (§2.1): owner only, with no friend branch", () => {
    it("get / defaults / confirm: owner yes, friend no, stranger no", async () => {
      await withOnboardingDb(async (db) => {
        const owner = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        await db.execute(sql`
          insert into public.friends (user_id, friend_id)
          values (${owner}::uuid, ${friend}::uuid) on conflict do nothing
        `);
        await seedReferenceValues(db);

        const id = randomUUID();
        const actor = await activate(newOnboardingActor(id, db, provider()));
        await actor.start(userCtx(owner, "r"), { itemType: "WINE" });

        await expect(actor.get(userCtx(owner, "r"))).resolves.toMatchObject({
          id,
        });
        // An onboarding is the most private thing in the schema: it is a
        // photograph of your kitchen counter. Friendship is not a branch.
        //
        // Refused as `NotFoundError`, not `ForbiddenError` (E5b). There is no
        // third party who may see an onboarding without owning it, so
        // "forbidden" could only ever mean "this id names a real row, and it
        // is somebody else's" — an existence oracle, and the only thing a
        // stranger could learn from this actor at all. The message has to be
        // `requireAggregate()`'s own, or the wording restores the difference.
        const absentId = randomUUID();
        const absent = await activate(
          newOnboardingActor(absentId, db, provider()),
        );
        for (const viewer of [friend, stranger]) {
          for (const call of [
            (a: typeof actor) => a.get(userCtx(viewer, "r")),
            (a: typeof actor) => a.defaults(userCtx(viewer, "r")),
            (a: typeof actor) => a.confirm(userCtx(viewer, "r"), { name: "X" }),
          ]) {
            const refusal = async (
              a: typeof actor,
              key: string,
            ): Promise<string> =>
              await call(a).then(
                () => "resolved",
                (error: Error) =>
                  `${error.name}: ${error.message.replace(key, "<id>")}`,
              );

            await expect(call(actor)).rejects.toThrow(NotFoundError);
            expect(await refusal(actor, id)).toBe(
              await refusal(absent, absentId),
            );
          }
        }
      });
    });

    it("reprocess is system/admin only", async () => {
      await withOnboardingDb(async (db) => {
        const owner = await seedUser(db);
        const id = randomUUID();
        const ai = provider();
        const actor = await activate(newOnboardingActor(id, db, ai));
        await actor.start(userCtx(owner, "r"), { itemType: "WINE" });

        await expect(actor.reprocess(userCtx(owner, "r"), {})).rejects.toThrow(
          ForbiddenError,
        );
        await expect(
          actor.reprocess(adminCtx(owner, "r"), {}),
        ).resolves.toMatchObject({ reprocessed: true });
      });
    });

    it("reprocess is idempotent on the key its caller derives (§8.4)", async () => {
      await withOnboardingDb(async (db) => {
        const owner = await seedUser(db);
        const id = randomUUID();
        const ai = provider() as ItemDefaultsProvider & { calls: number };
        const actor = await activate(newOnboardingActor(id, db, ai));
        await actor.start(userCtx(owner, "r"), { itemType: "WINE" });
        expect(ai.calls).toBe(1);

        // `OnboardingReprocessJobActor` hands each row a key derived from its
        // own delivery; `reprocess` is reached through the typed client, which
        // strips that delivery, so the key is the only thing it can key on.
        const idempotencyKey = randomUUID();
        const first = await actor.reprocess(systemCtx("job-turn"), {
          idempotencyKey,
        });
        expect(first.reprocessed).toBe(true);
        expect(ai.calls).toBe(2);

        const second = await actor.reprocess(systemCtx("job-turn-retry"), {
          idempotencyKey,
        });
        expect(second.reprocessed).toBe(false);
        expect(ai.calls).toBe(2);

        // The delivery a caller was in is not a key: a system ctx carrying
        // one, with no explicit key, runs again.
        const third = await actor.reprocess(deliveryCtx(randomUUID()), {});
        expect(third.reprocessed).toBe(true);
        expect(ai.calls).toBe(3);

        // A malformed key is refused before any model call.
        await expect(
          actor.reprocess(systemCtx("r"), { idempotencyKey: "not-a-uuid" }),
        ).rejects.toBeInstanceOf(ValidationError);
        expect(ai.calls).toBe(3);
      });
    });

    it("is NotFound before start has run", async () => {
      await withOnboardingDb(async (db) => {
        const user = await seedUser(db);
        const actor = await activate(newOnboardingActor(randomUUID(), db));
        await expect(actor.get(userCtx(user, "r"))).rejects.toThrow(
          NotFoundError,
        );
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* confirm — B2's headline acceptance                                  */
  /* ------------------------------------------------------------------ */

  describe("confirm (§1.7, §8.4)", () => {
    it("delivered twice creates one item, one brand and one cellar item", async () => {
      await withOnboardingDb(async (db) => {
        const owner = await seedUser(db);
        await seedReferenceValues(db);
        const cellarId = await seedCellar(db, owner);
        const onboardingId = randomUUID();
        const code = "0000000000020";

        const actor = await activate(
          newOnboardingActor(
            onboardingId,
            db,
            provider(),
            async (_ctx, c) => ({ code: c }),
            brandRegistry(db),
          ),
        );
        await actor.start(userCtx(owner, "r"), {
          itemType: "WINE",
          barcode: code,
        });
        // `BarcodeActor.ensure`'s effect, which the seam stands in for.
        await db.execute(
          sql`insert into public.barcodes (code, type) values (${code}, 'EAN13')`,
        );

        const input = {
          name: "Château Test",
          brandName: " Château Test ",
          cellarId,
          attributes: { vintage: "2019-01-01", style: "RED" },
        };

        const first = await actor.confirm(userCtx(owner, "r"), input);
        // …and the same call again, as a client retry or a redelivery would.
        const second = await actor.confirm(userCtx(owner, "r"), input);

        // Deterministic ids: both confirmations name the same rows.
        expect(second.item).toEqual(first.item);
        expect(second.cellarItemId).toBe(first.cellarItemId);
        expect(second.brandId).toBe(first.brandId);
        expect(first.item.id).toBe(derivedUuid(onboardingId, "item"));

        await drain(db);

        expect(
          await countOf(
            db,
            sql`select count(*) as count from public.wines where item_onboarding_id = ${onboardingId}::uuid`,
          ),
        ).toBe(1);
        expect(
          await countOf(
            db,
            sql`select count(*) as count from public.brands where lower(trim(name)) = 'château test'`,
          ),
        ).toBe(1);
        expect(
          await countOf(
            db,
            sql`select count(*) as count from public.item_brands where wine_id = ${first.item.id}::uuid`,
          ),
        ).toBe(1);
        expect(
          await countOf(
            db,
            sql`select count(*) as count from public.cellar_items where cellar_id = ${cellarId}::uuid`,
          ),
        ).toBe(1);
      });
    });

    /**
     * `item_onboardings.barcode` is the code as scanned; the item must carry
     * its canonical spelling, the only one `barcodes` holds. With the raw one,
     * an EAN-13 scan of a bottle registered from its UPC-A would name a row
     * that does not exist and the `create` delivery would fail its FK.
     */
    it("registers and links the canonical code, whatever spelling was scanned", async () => {
      await withOnboardingDb(async (db) => {
        const owner = await seedUser(db);
        await seedReferenceValues(db);
        const onboardingId = randomUUID();
        const ensured: [string, string | null][] = [];

        const actor = await activate(
          newOnboardingActor(
            onboardingId,
            db,
            provider(),
            async (_ctx, c, type) => {
              ensured.push([c, type]);
              // `BarcodeActor.ensure`'s effect, which the seam stands in for.
              await db.execute(
                sql`insert into public.barcodes (code, type) values (${c}, ${type}) on conflict do nothing`,
              );
              return { code: c };
            },
          ),
        );
        await actor.start(userCtx(owner, "r"), {
          itemType: "WINE",
          barcode: "0036000291452",
          barcodeType: "EAN_13",
        });

        const input = {
          name: "Canonical Wine",
          attributes: { vintage: "2019-01-01", style: "RED" },
        };
        const first = await actor.confirm(userCtx(owner, "r"), input);
        const again = await actor.confirm(userCtx(owner, "r"), input);
        expect(ensured).toEqual([["00036000291452", "EAN_13"]]);
        expect(first.barcode).toBe("00036000291452");
        expect(again.barcode).toBe("00036000291452");

        await drain(db);
        const rows = await db.execute<{ barcode_code: string | null }>(
          sql`select barcode_code from public.wines where item_onboarding_id = ${onboardingId}::uuid`,
        );
        expect(rows.rows).toEqual([{ barcode_code: "00036000291452" }]);
      });
    });

    it("writes the status and the follow-ups in one transaction (§1.4)", async () => {
      await withOnboardingDb(async (db) => {
        const owner = await seedUser(db);
        await seedReferenceValues(db);
        const cellarId = await seedCellar(db, owner);
        const onboardingId = randomUUID();
        const actor = await activate(
          newOnboardingActor(
            onboardingId,
            db,
            provider(),
            async (_ctx, c) => ({ code: c }),
            brandRegistry(db),
          ),
        );
        await actor.start(userCtx(owner, "r"), { itemType: "WINE" });
        await actor.confirm(userCtx(owner, "r"), {
          name: "Château Test",
          brandName: "Château Test",
          cellarId,
          attributes: { vintage: "2019-01-01", style: "RED" },
        });

        const rows = await db
          .select({
            targetActor: outbox.targetActor,
            method: outbox.method,
            payload: outbox.payload,
          })
          .from(outbox)
          .where(eq(outbox.status, "pending"))
          .orderBy(asc(outbox.seq));

        expect(rows.map((row) => `${row.targetActor}.${row.method}`)).toEqual([
          "ItemActor.create",
          "ItemActor.linkBrand",
          "CellarActor.addItem",
        ]);
        // Every payload is an object, never a bare id (B4's finding, §8.4).
        for (const row of rows) {
          expect(typeof row.payload).toBe("object");
          expect(Array.isArray(row.payload)).toBe(false);
        }

        const onboarding = await actor.get(userCtx(owner, "r"));
        expect(onboarding.status).toBe("CONFIRMED");
      });
    });

    /**
     * `itemId` becomes the new item's `ItemActor` key and its row id. The
     * actor host refuses a key that is not canonical, and Postgres would store
     * the id lowercase anyway, so an uppercase `itemId` used to name an actor
     * no delivery could reach. It is canonicalised where it is validated.
     */
    it("canonicalises a caller-supplied uppercase itemId", async () => {
      await withOnboardingDb(async (db) => {
        const owner = await seedUser(db);
        await seedReferenceValues(db);
        const actor = await activate(
          newOnboardingActor(randomUUID(), db, provider()),
        );
        await actor.start(userCtx(owner, "r"), { itemType: "WINE" });
        const itemId = randomUUID();
        const result = await actor.confirm(userCtx(owner, "r"), {
          name: "Château Test",
          itemId: itemId.toUpperCase(),
          attributes: { vintage: "2019-01-01", style: "RED" },
        });
        expect(result.item.id).toBe(itemId);
        const rows = await db
          .select({ targetId: outbox.targetId })
          .from(outbox)
          .where(eq(outbox.method, "create"));
        expect(rows.map((row) => row.targetId)).toContain(`wine:${itemId}`);
      });
    });

    it("enqueues no cellar call when no cellar was named", async () => {
      await withOnboardingDb(async (db) => {
        const owner = await seedUser(db);
        await seedReferenceValues(db);
        const actor = await activate(
          newOnboardingActor(randomUUID(), db, provider()),
        );
        await actor.start(userCtx(owner, "r"), { itemType: "WINE" });
        const result = await actor.confirm(userCtx(owner, "r"), {
          name: "Château Test",
          attributes: { vintage: "2019-01-01", style: "RED" },
        });
        expect(result.cellarItemId).toBeNull();
        expect(result.brandId).toBeNull();

        const rows = await db
          .select({ method: outbox.method })
          .from(outbox)
          .where(eq(outbox.status, "pending"));
        expect(rows.map((row) => row.method)).toEqual(["create"]);
      });
    });

    /* ------------------------------------------------------------------ *
     * A7c (1) — the silent data-loss path.
     *
     * `wines.style`, `wines.vintage`, `spirits.type` and `coffees.description`
     * are `NOT NULL` with no default. `ItemActor.create` has always rejected a
     * missing one — but `confirm` reaches `create` **through the outbox**
     * (§8.5: entity → entity), so the rejection happened during *delivery*,
     * long after the caller was told the confirm succeeded. The row then
     * retried for ~17 minutes and dead-lettered somewhere only Grafana looks.
     *
     * The assertion below is written as one object on purpose: before the fix
     * it read `{ confirmRejected: false, winesAfterDrain: 0 }` — succeeded,
     * and produced no item.
     * ------------------------------------------------------------------ */
    it("rejects a confirm missing a NOT NULL attribute instead of losing it in the outbox", async () => {
      await withOnboardingDb(async (db) => {
        const owner = await seedUser(db);
        await seedReferenceValues(db);
        const onboardingId = randomUUID();
        const actor = await activate(
          newOnboardingActor(onboardingId, db, provider()),
        );
        await actor.start(userCtx(owner, "r"), { itemType: "WINE" });

        let error: unknown = null;
        try {
          await actor.confirm(userCtx(owner, "r"), {
            name: "Château Test",
            // `style` is absent. `wines.style` is NOT NULL with no default.
            attributes: { vintage: "2019-01-01" },
          });
        } catch (thrown) {
          error = thrown;
        }
        await drain(db);

        expect({
          confirmRejected: error instanceof ValidationError,
          winesAfterDrain: await countOf(
            db,
            sql`select count(*) as count from public.wines where item_onboarding_id = ${onboardingId}::uuid`,
          ),
        }).toEqual({ confirmRejected: true, winesAfterDrain: 0 });

        // The message names the field, so the caller can fix its input.
        expect((error as Error).message).toMatch(/style/);

        // Nothing was set in motion: no outbox row, and the onboarding is
        // still confirmable once the caller supplies the field.
        const pending = await db
          .select({ method: outbox.method })
          .from(outbox)
          .where(eq(outbox.status, "pending"));
        expect(pending).toEqual([]);
        expect((await actor.get(userCtx(owner, "r"))).status).toBe("COMPLETED");
      });
    });

    it("names each of the four NOT NULL columns the outbox used to swallow", async () => {
      await withOnboardingDb(async (db) => {
        const owner = await seedUser(db);
        await seedReferenceValues(db);
        const cases = [
          { itemType: "WINE", attributes: { style: "RED" }, field: /vintage/ },
          {
            itemType: "WINE",
            attributes: { vintage: "2019-01-01" },
            field: /style/,
          },
          { itemType: "SPIRIT", attributes: {}, field: /spiritType/ },
          { itemType: "COFFEE", attributes: {}, field: /description/ },
        ] as const;

        for (const testCase of cases) {
          const actor = await activate(
            newOnboardingActor(randomUUID(), db, provider()),
          );
          await actor.start(userCtx(owner, "r"), {
            itemType: testCase.itemType,
          });
          await expect(
            actor.confirm(userCtx(owner, "r"), {
              name: "Anything",
              attributes: { ...testCase.attributes },
            }),
          ).rejects.toThrow(testCase.field);
        }
      });
    });

    it("refuses a blank name", async () => {
      await withOnboardingDb(async (db) => {
        const owner = await seedUser(db);
        const actor = await activate(
          newOnboardingActor(randomUUID(), db, provider()),
        );
        await actor.start(userCtx(owner, "r"), { itemType: "WINE" });
        await expect(
          actor.confirm(userCtx(owner, "r"), { name: "   " }),
        ).rejects.toThrow(ValidationError);
      });
    });

    /* ------------------------------------------------------------------ *
     * E5a — the cross-tenant write.
     *
     * `confirm` authorized the onboarding and nothing else, then enqueued
     * `{CellarActor, <caller's cellarId>, addItem}`. The outbox delivers as
     * `systemCtx`, and `CellarActor.#requireOwner` opens with
     * `if (bypassesPolicy(ctx)) return;` — so the gate at the far end could
     * not fire, and `createdBy` came off the payload.
     *
     * These go through `drain` rather than stopping at the throw on purpose:
     * that is how the hole was proved open, and a check that only moved the
     * refusal somewhere the outbox ignores would still pass a `rejects.toThrow`
     * assertion. The post-drain count is the part that matters.
     * ------------------------------------------------------------------ */
    describe("the target cellar must be the onboarding owner's (E5a)", () => {
      it("refuses another user's PRIVATE cellar, and writes nothing into it", async () => {
        await withOnboardingDb(async (db) => {
          const victim = await seedUser(db);
          const attacker = await seedUser(db);
          await seedReferenceValues(db);
          const victimCellar = await seedCellar(db, victim);

          const actor = await activate(
            newOnboardingActor(randomUUID(), db, provider()),
          );
          // The onboarding really is the attacker's — `#requireOwner` passes.
          await actor.start(userCtx(attacker, "r"), { itemType: "WINE" });

          await expect(
            actor.confirm(userCtx(attacker, "r"), {
              name: "Injected",
              cellarId: victimCellar,
              attributes: { vintage: "2019-01-01", style: "RED" },
            }),
          ).rejects.toThrow(NotFoundError);

          // Nothing was enqueued at all — not an `addItem` that the drainer
          // would happily deliver as `system`.
          expect(
            await countOf(
              db,
              sql`select count(*) as count from public.outbox where status = 'pending'`,
            ),
          ).toBe(0);
          await drain(db);
          expect(
            await countOf(
              db,
              sql`select count(*) as count from public.cellar_items where cellar_id = ${victimCellar}::uuid`,
            ),
          ).toBe(0);
          // …and the refusal is not a partial: the onboarding is still
          // confirmable once the caller names a cellar that is theirs.
          expect((await actor.get(userCtx(attacker, "r"))).status).toBe(
            "COMPLETED",
          );
        });
      });

      /**
       * The gate runs **before** the already-CONFIRMED short-circuit, and that
       * ordering is the whole of the guarantee.
       *
       * `confirm`'s own comment says so — "It runs before the short-circuit
       * below so that a second `confirm` naming somebody else's cellar is
       * refused rather than answered with a derived `cellarItemId`" — and
       * nothing asserted it. Hand-mutation: gate the check on
       * `aggregate.row.status !== "CONFIRMED"` and all 28 tests here stay
       * green, because every one of them confirms exactly once. Moving the
       * fast path above the gate is an ordinary-looking refactor, and it would
       * turn the refusal into an answer.
       */
      it("still refuses another user's cellar on a second, already-CONFIRMED confirm", async () => {
        await withOnboardingDb(async (db) => {
          const victim = await seedUser(db);
          const attacker = await seedUser(db);
          await seedReferenceValues(db);
          const victimCellar = await seedCellar(db, victim);

          const actor = await activate(
            newOnboardingActor(randomUUID(), db, provider()),
          );
          await actor.start(userCtx(attacker, "r"), { itemType: "WINE" });

          // A legitimate first confirm, naming no cellar at all.
          await actor.confirm(userCtx(attacker, "r"), {
            name: "Mine",
            attributes: { vintage: "2019-01-01", style: "RED" },
          });
          expect((await actor.get(userCtx(attacker, "r"))).status).toBe(
            "CONFIRMED",
          );

          // The replay, now naming the victim's cellar. The short-circuit
          // would answer this with a derived `cellarItemId` for a cellar the
          // caller cannot write to.
          await expect(
            actor.confirm(userCtx(attacker, "r"), {
              name: "Mine",
              cellarId: victimCellar,
              attributes: { vintage: "2019-01-01", style: "RED" },
            }),
          ).rejects.toThrow(NotFoundError);

          await drain(db);
          expect(
            await countOf(
              db,
              sql`select count(*) as count from public.cellar_items where cellar_id = ${victimCellar}::uuid`,
            ),
          ).toBe(0);
        });
      });

      it("accepts a cellar the owner co-owns", async () => {
        await withOnboardingDb(async (db) => {
          const creator = await seedUser(db);
          const coOwner = await seedUser(db);
          await seedReferenceValues(db);
          const cellarId = await seedCellar(db, creator);
          await db.execute(sql`
            insert into public.cellar_owners (user_id, cellar_id)
            values (${coOwner}::uuid, ${cellarId}::uuid)
          `);

          const actor = await activate(
            newOnboardingActor(randomUUID(), db, provider()),
          );
          await actor.start(userCtx(coOwner, "r"), { itemType: "WINE" });
          const result = await actor.confirm(userCtx(coOwner, "r"), {
            name: "Shared",
            cellarId,
            attributes: { vintage: "2019-01-01", style: "RED" },
          });
          expect(result.cellarItemId).not.toBeNull();

          await drain(db);
          expect(
            await countOf(
              db,
              sql`select count(*) as count from public.cellar_items where cellar_id = ${cellarId}::uuid and created_by = ${coOwner}::uuid`,
            ),
          ).toBe(1);
        });
      });

      it("refuses a cellar id that names no row", async () => {
        await withOnboardingDb(async (db) => {
          const owner = await seedUser(db);
          await seedReferenceValues(db);
          const actor = await activate(
            newOnboardingActor(randomUUID(), db, provider()),
          );
          await actor.start(userCtx(owner, "r"), { itemType: "WINE" });
          await expect(
            actor.confirm(userCtx(owner, "r"), {
              name: "Nowhere",
              cellarId: randomUUID(),
              attributes: { vintage: "2019-01-01", style: "RED" },
            }),
          ).rejects.toThrow(NotFoundError);
        });
      });

      /**
       * `admin` bypasses `#requireOwner`, and the fix deliberately gives the
       * cellar check no `bypassesPolicy` branch — a branch of exactly that kind
       * is what made `CellarActor.addItem`'s gate a no-op on this path. An
       * admin confirming on a user's behalf still cannot file the item into a
       * cellar that user could not write to.
       */
      it("does not let an admin caller file the item into a cellar the owner cannot write to", async () => {
        await withOnboardingDb(async (db) => {
          const victim = await seedUser(db);
          const owner = await seedUser(db);
          await seedReferenceValues(db);
          const victimCellar = await seedCellar(db, victim);
          const actor = await activate(
            newOnboardingActor(randomUUID(), db, provider()),
          );
          await actor.start(userCtx(owner, "r"), { itemType: "WINE" });
          await expect(
            actor.confirm(adminCtx("admin-1", "r"), {
              name: "Injected",
              cellarId: victimCellar,
              attributes: { vintage: "2019-01-01", style: "RED" },
            }),
          ).rejects.toThrow(NotFoundError);
        });
      });
    });

    /* ------------------------------------------------------------------ *
     * E5a, second instance — `input.itemId` is caller-supplied too.
     *
     * Point it at an existing item and `ItemActor.create` short-circuits to a
     * read, but the `linkBrand` row enqueued behind it is delivered as
     * `system` past `ItemActor.#requireCreator` — so a brand could be attached
     * to any item in the catalog. Shared catalog rows, so integrity rather
     * than tenancy, but the same mechanism.
     * ------------------------------------------------------------------ */
    it("refuses an itemId that names another user's item, and links no brand to it (E5a)", async () => {
      await withOnboardingDb(async (db) => {
        const victim = await seedUser(db);
        const attacker = await seedUser(db);
        await seedReferenceValues(db);

        // The victim's own item, minted through the victim's own onboarding —
        // `wines.item_onboarding_id` is NOT NULL, so there is no such thing as
        // an item without one.
        const victimOnboarding = randomUUID();
        await db.execute(sql`
          insert into public.item_onboardings (id, user_id, item_type, status)
          values (${victimOnboarding}::uuid, ${victim}::uuid, 'wine', 'CONFIRMED')
        `);
        const victimItemId = randomUUID();
        await db.execute(sql`
          insert into public.wines
            (id, name, created_by_id, item_onboarding_id, vintage, style)
          values (${victimItemId}::uuid, 'Victim Wine', ${victim}::uuid,
                  ${victimOnboarding}::uuid, '2019-01-01', 'RED')
        `);

        const actor = await activate(
          newOnboardingActor(
            randomUUID(),
            db,
            provider(),
            async (_ctx, c) => ({ code: c }),
            brandRegistry(db),
          ),
        );
        await actor.start(userCtx(attacker, "r"), { itemType: "WINE" });

        await expect(
          actor.confirm(userCtx(attacker, "r"), {
            name: "Rebrand",
            itemId: victimItemId,
            brandName: "Attacker Brand",
            attributes: { vintage: "2019-01-01", style: "RED" },
          }),
        ).rejects.toThrow(ForbiddenError);

        await drain(db);
        expect(
          await countOf(
            db,
            sql`select count(*) as count from public.item_brands where wine_id = ${victimItemId}::uuid`,
          ),
        ).toBe(0);
      });
    });

    /** The same ordering guarantee as the cellar gate's, on the item gate. */
    it("still refuses another user's itemId on a second, already-CONFIRMED confirm", async () => {
      await withOnboardingDb(async (db) => {
        const victim = await seedUser(db);
        const attacker = await seedUser(db);
        await seedReferenceValues(db);

        const victimOnboarding = randomUUID();
        await db.execute(sql`
          insert into public.item_onboardings (id, user_id, item_type, status)
          values (${victimOnboarding}::uuid, ${victim}::uuid, 'wine', 'CONFIRMED')
        `);
        const victimItemId = randomUUID();
        await db.execute(sql`
          insert into public.wines
            (id, name, created_by_id, item_onboarding_id, vintage, style)
          values (${victimItemId}::uuid, 'Victim Wine', ${victim}::uuid,
                  ${victimOnboarding}::uuid, '2019-01-01', 'RED')
        `);

        const actor = await activate(
          newOnboardingActor(
            randomUUID(),
            db,
            provider(),
            async (_ctx, c) => ({ code: c }),
            brandRegistry(db),
          ),
        );
        await actor.start(userCtx(attacker, "r"), { itemType: "WINE" });
        await actor.confirm(userCtx(attacker, "r"), {
          name: "Mine",
          attributes: { vintage: "2019-01-01", style: "RED" },
        });

        // The replay, now pointing `itemId` at the victim's wine. Answered
        // from the short-circuit, this hands back `item: { id: <victim's> }`
        // and resolves a brand against it.
        await expect(
          actor.confirm(userCtx(attacker, "r"), {
            name: "Rebrand",
            itemId: victimItemId,
            brandName: "Attacker Brand",
            attributes: { vintage: "2019-01-01", style: "RED" },
          }),
        ).rejects.toThrow(ForbiddenError);

        await drain(db);
        expect(
          await countOf(
            db,
            sql`select count(*) as count from public.item_brands where wine_id = ${victimItemId}::uuid`,
          ),
        ).toBe(0);
      });
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Concealment: a stranger's onboarding and no onboarding answer alike         */
/* -------------------------------------------------------------------------- */

/**
 * Owner-only (§2.1), so every refusal a stranger can provoke must be the same
 * `{ code, message }` for a real id and an absent one. `reprocess` used to
 * read the row before checking the caller — `Forbidden` for a real id,
 * `NotFound` for a made-up one — and answers `Forbidden` for both now.
 */
describe.skipIf(skip)("ItemOnboardingActor concealment", () => {
  afterAll(closeTestDb);

  const CALLS: readonly [
    string,
    string,
    (actor: ItemOnboardingActor, ctx: Ctx) => Promise<unknown>,
  ][] = [
    ["get", "NOT_FOUND", (actor, ctx) => actor.get(ctx)],
    ["defaults", "NOT_FOUND", (actor, ctx) => actor.defaults(ctx)],
    ["confirm", "NOT_FOUND", (actor, ctx) => actor.confirm(ctx, {} as never)],
    ["reprocess", "FORBIDDEN", (actor, ctx) => actor.reprocess(ctx)],
  ];

  it.each(CALLS)("%s", async (_method, code, call) => {
    await withOnboardingDb(async (db) => {
      const owner = await seedUser(db);
      const stranger = userCtx(await seedUser(db), "r-stranger");
      const real = randomUUID();
      await (await activate(newOnboardingActor(real, db, provider()))).start(
        userCtx(owner, "r-owner"),
        { itemType: "WINE" },
      );
      const absent = randomUUID();

      const hidden = await refusalOf(
        async () =>
          call(await activate(newOnboardingActor(real, db)), stranger),
        real,
      );
      const missing = await refusalOf(
        async () =>
          call(await activate(newOnboardingActor(absent, db)), stranger),
        absent,
      );
      expect(hidden).toEqual(missing);
      expect(hidden.code).toBe(code);
    });
  });
});
