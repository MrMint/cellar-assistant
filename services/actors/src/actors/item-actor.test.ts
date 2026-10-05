/**
 * `ItemActor` against a real Postgres (B2).
 *
 * What this file is built to prove (§6 B2's acceptance list, plus §1.6's
 * three-viewer rule):
 *
 *   1. all six item types round-trip through one actor class and one DTO
 *      union — the actor half of "the `Item` interface resolves each type";
 *   2. `update` by a non-creator is refused, and every other viewer-dependent
 *      method has its owner / friend / stranger case;
 *   3. `attachImage` refuses an unverified file;
 *   4. `regenerateVector` is enqueued only when an embedding-relevant field
 *      changed — the plan's "a `notes` update does not enqueue", translated to
 *      the columns this schema actually has (see the report: there is no
 *      `notes` column on any item table; `barcode_code` is the embedding-inert
 *      one, and `setBarcode` is the write that touches it);
 *   5. `score` matches the old `_aggregate` result on a fixture;
 *   6. the seventh key namespace (`generic:<id>`) answers only the `*Generic`
 *      methods, and the six item types answer only the others.
 */
import { randomUUID } from "node:crypto";
import {
  adminCtx,
  anonymousCtx,
  ConflictError,
  type EmbedDocumentInput,
  ForbiddenError,
  type ItemRef,
  type ItemType,
  NotFoundError,
  pageArgs,
  systemCtx,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { itemVectors, outbox } from "@cellar-assistant/db";
import { and, eq, sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import type { EmbedDocument } from "../lib/embedding-client.ts";
import {
  activate,
  closeTestDb,
  deliveryCtx,
  resolveTestDatabase,
  seedUser,
  testDelivery,
  withTestDb,
} from "../lib/testing.ts";
import { imageSetKey, NO_IMAGES, setEmbeddingModel } from "../lib/vectors.ts";
import type { VerifyFile } from "./item-actor.ts";
import { embeddingTextFor, ItemActor } from "./item-actor.ts";

const daprClient = (): DaprClient =>
  new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" });

const noVerify: VerifyFile = async () => {
  throw new Error("no FileActor in this test");
};
const noEmbed: EmbedDocument = async () => {
  throw new Error("no EmbeddingActor in this test");
};

/**
 * `createActor` forwards only three constructor arguments, so `ItemActor`'s
 * two seams are supplied here — the same shape `cellar-actor.test.ts` uses for
 * its embedder and `file-actor.test.ts` for its binding.
 */
const newItemActor = (
  id: string,
  db: DbOrTx,
  verifyFile: VerifyFile = noVerify,
  embed: EmbedDocument = noEmbed,
): ItemActor =>
  new ItemActor(daprClient(), new ActorId(id), db, verifyFile, embed);

const page = pageArgs({ first: 50 });

const actorIdFor = (ref: ItemRef): string =>
  `${ref.type.toLowerCase()}:${ref.id}`;

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const seedFriendship = async (
  db: DbOrTx,
  userId: string,
  friendId: string,
): Promise<void> => {
  await db.execute(sql`
    insert into public.friends (user_id, friend_id)
    values (${userId}::uuid, ${friendId}::uuid) on conflict do nothing
  `);
};

const seedOnboarding = async (
  db: DbOrTx,
  userId: string,
  itemType: string,
): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.item_onboardings (id, user_id, item_type)
    values (${id}::uuid, ${userId}::uuid, ${itemType})
  `);
  return id;
};

const seedFile = async (
  db: DbOrTx,
  uploadedBy: string,
  verified: boolean,
): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.files (id, bucket, key, uploaded_by, verified_at)
    values (${id}::uuid, 'cellar-files', ${`item-image/${id}`},
            ${uploadedBy}::uuid, ${verified ? new Date().toISOString() : null})
  `);
  return id;
};

const seedBrand = async (db: DbOrTx, name: string): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.brands (id, name) values (${id}::uuid, ${name})
  `);
  return id;
};

/**
 * Reference values the six tables' foreign keys demand. `on conflict do
 * nothing` so this is idempotent against a seeded database.
 */
const seedReferenceValues = async (db: DbOrTx): Promise<void> => {
  await db.execute(sql`
    insert into public.wine_style (value) values ('RED') on conflict do nothing`);
  await db.execute(sql`
    insert into public.beer_style (value) values ('ALTBIER') on conflict do nothing`);
  await db.execute(sql`
    insert into public.spirit_type (value) values ('BOURBON') on conflict do nothing`);
  await db.execute(sql`
    insert into public.tea_category (value) values ('black') on conflict do nothing`);
  await db.execute(sql`
    insert into public.sake_category (value) values ('daiginjo') on conflict do nothing`);
  await db.execute(sql`
    insert into public.country (value) values ('FRANCE') on conflict do nothing`);
};

/** The minimum `create` input for each of the six types. */
const createInputFor = (type: ItemType, onboardingId: string) => {
  switch (type) {
    case "WINE":
      return {
        name: "Test Wine",
        itemOnboardingId: onboardingId,
        wine: { vintage: "2020-01-01", style: "RED" },
      };
    case "BEER":
      return {
        name: "Test Beer",
        itemOnboardingId: onboardingId,
        beer: { style: "ALTBIER" },
      };
    case "SPIRIT":
      return {
        name: "Test Spirit",
        itemOnboardingId: onboardingId,
        spirit: { spiritType: "BOURBON" },
      };
    case "COFFEE":
      return {
        name: "Test Coffee",
        description: "A coffee",
        itemOnboardingId: onboardingId,
        coffee: { roastLevel: "MEDIUM" as const },
      };
    case "SAKE":
      return { name: "Test Sake", sake: { category: "daiginjo" } };
    case "TEA":
      return { name: "Test Tea", tea: { category: "black" } };
  }
};

/** Create one item of `type` through the actor, as `createdBy`. */
const createItem = async (
  db: DbOrTx,
  type: ItemType,
  createdBy: string,
): Promise<{ ref: ItemRef; actor: ItemActor }> => {
  await seedReferenceValues(db);
  const onboardingId = await seedOnboarding(db, createdBy, type);
  const ref: ItemRef = { type, id: randomUUID() };
  const actor = await activate(newItemActor(actorIdFor(ref), db));
  await actor.create(
    userCtx(createdBy, `seed-${type}`),
    createInputFor(type, onboardingId),
  );
  return { ref, actor };
};

/** Owner, a friend of the owner, a stranger, and one wine owned by the owner. */
const seedScenario = async (db: DbOrTx) => {
  const owner = await seedUser(db);
  const friend = await seedUser(db);
  const stranger = await seedUser(db);
  await seedFriendship(db, owner, friend);
  const { ref, actor } = await createItem(db, "WINE", owner);
  return { owner, friend, stranger, ref, actor };
};

const pendingOutbox = async (db: DbOrTx, targetId: string) =>
  await db
    .select({ method: outbox.method, payload: outbox.payload })
    .from(outbox)
    .where(
      and(eq(outbox.targetActor, "ItemActor"), eq(outbox.targetId, targetId)),
    );

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("ItemActor (B2)", () => {
  afterAll(closeTestDb);

  it("is an entity actor per §8.3", () => {
    expect(ItemActor.category).toBe("entity");
  });

  /* ------------------------------------------------------------------ */
  /* One actor class, six physical tables                                */
  /* ------------------------------------------------------------------ */

  describe("the six item types round-trip through one actor", () => {
    const types: ItemType[] = [
      "WINE",
      "BEER",
      "SPIRIT",
      "COFFEE",
      "SAKE",
      "TEA",
    ];

    for (const type of types) {
      it(`creates and reads a ${type}`, async () => {
        await withTestDb(async (db) => {
          const user = await seedUser(db);
          const { ref, actor } = await createItem(db, type, user);

          const dto = await actor.get(userCtx(user, "r"));
          expect(dto.type).toBe(type);
          expect(dto.id).toBe(ref.id);
          expect(dto.createdById).toBe(user);
          expect(dto.name).toMatch(/^Test /);
          // The wire shape, not the row shape: ISO-8601, never a `Date`.
          expect(typeof dto.createdAt).toBe("string");
          expect(dto.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        });
      });
    }

    it("`create` is idempotent on the actor id (§8.4)", async () => {
      await withTestDb(async (db) => {
        const user = await seedUser(db);
        const { ref, actor } = await createItem(db, "WINE", user);
        const again = await actor.create(userCtx(user, "again"), {
          name: "A Different Name",
          itemOnboardingId: await seedOnboarding(db, user, "WINE"),
          wine: { vintage: "1999-01-01", style: "RED" },
        });
        expect(again.id).toBe(ref.id);
        expect(again.name).toBe("Test Wine");

        const rows = await db.execute<{ count: string }>(
          sql`select count(*) as count from public.wines where id = ${ref.id}::uuid`,
        );
        expect(rows.rows[0]?.count).toBe("1");
      });
    });

    it("refuses an id that is not `<type>:<uuid>`", async () => {
      await withTestDb(async (db) => {
        const user = await seedUser(db);
        const actor = await activate(newItemActor("nonsense", db));
        await expect(
          actor.create(userCtx(user, "r"), { name: "x" }),
        ).rejects.toThrow(ValidationError);
      });
    });

    it("names the NOT NULL column rather than letting Postgres do it", async () => {
      await withTestDb(async (db) => {
        const user = await seedUser(db);
        await seedReferenceValues(db);
        const onboardingId = await seedOnboarding(db, user, "WINE");
        const actor = await activate(newItemActor(`wine:${randomUUID()}`, db));
        await expect(
          actor.create(userCtx(user, "r"), {
            name: "No Vintage",
            itemOnboardingId: onboardingId,
            wine: { style: "RED" },
          }),
        ).rejects.toThrow(/wines\.vintage is NOT NULL/);
      });
    });

    it("refuses a wine with no onboarding row (the FK is NOT NULL)", async () => {
      await withTestDb(async (db) => {
        const user = await seedUser(db);
        await seedReferenceValues(db);
        const actor = await activate(newItemActor(`wine:${randomUUID()}`, db));
        await expect(
          actor.create(userCtx(user, "r"), {
            name: "Orphan",
            wine: { vintage: "2020-01-01", style: "RED" },
          }),
        ).rejects.toThrow(/item_onboarding_id is NOT NULL/);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* §1.6 — owner / friend / stranger, per viewer-dependent method       */
  /* ------------------------------------------------------------------ */

  describe("viewer rules (§1.6): owner, friend, stranger", () => {
    it("get: every signed-in viewer sees the item; anonymous does not", async () => {
      await withTestDb(async (db) => {
        const { owner, friend, stranger, actor } = await seedScenario(db);
        for (const viewer of [owner, friend, stranger]) {
          await expect(actor.get(userCtx(viewer, "r"))).resolves.toMatchObject({
            name: "Test Wine",
          });
        }
        await expect(actor.get(anonymousCtx("r"))).rejects.toThrow(
          ForbiddenError,
        );
      });
    });

    it("update: creator yes, friend no, stranger no, system yes", async () => {
      await withTestDb(async (db) => {
        const { owner, friend, stranger, actor } = await seedScenario(db);

        await expect(
          actor.update(userCtx(owner, "r"), { name: "Renamed" }),
        ).resolves.toMatchObject({ name: "Renamed" });
        await expect(
          actor.update(userCtx(friend, "r"), { name: "Nope" }),
        ).rejects.toThrow(ForbiddenError);
        await expect(
          actor.update(userCtx(stranger, "r"), { name: "Nope" }),
        ).rejects.toThrow(ForbiddenError);
        // "enrichment updates use `system`" (§2.1).
        await expect(
          actor.update(systemCtx("enrich"), { description: "From the label" }),
        ).resolves.toMatchObject({ description: "From the label" });
      });
    });

    it("setBarcode: no user may call it; system and admin may", async () => {
      await withTestDb(async (db) => {
        const { owner, friend, stranger, actor } = await seedScenario(db);
        await db.execute(
          sql`insert into public.barcodes (code, type) values ('0000000000001', 'EAN13')`,
        );
        for (const viewer of [owner, friend, stranger]) {
          await expect(
            actor.setBarcode(userCtx(viewer, "r"), { code: "0000000000001" }),
          ).rejects.toThrow(ForbiddenError);
        }
        await expect(
          actor.setBarcode(testDelivery("x"), { code: "0000000000001" }),
        ).resolves.toMatchObject({ barcodeCode: "0000000000001" });
      });
    });

    /**
     * `barcode_code` holds only canonical codes (`barcodes_code_canonical`).
     * An outbox `setBarcode` enqueued before the canonicalising migration may
     * carry the old spelling, and `createItem`'s `barcodeCode` is whatever the
     * client typed; both must land on the canonical row.
     */
    it("setBarcode and create store the canonical spelling of the code", async () => {
      await withTestDb(async (db) => {
        const { owner, actor } = await seedScenario(db);
        await db.execute(
          sql`insert into public.barcodes (code, type) values ('00036000291452', 'UPC_A'), ('W6-SKU', null)`,
        );
        await expect(
          actor.setBarcode(testDelivery("x"), { code: "0036000291452" }),
        ).resolves.toMatchObject({ barcodeCode: "00036000291452" });
        // Idempotent under any spelling: the item already carries it.
        await expect(
          actor.setBarcode(testDelivery("y"), { code: "036000291452" }),
        ).resolves.toMatchObject({ barcodeCode: "00036000291452" });

        const onboardingId = await seedOnboarding(db, owner, "WINE");
        const ref: ItemRef = { type: "WINE", id: randomUUID() };
        const created = await activate(newItemActor(actorIdFor(ref), db));
        await expect(
          created.create(userCtx(owner, "r"), {
            ...createInputFor("WINE", onboardingId),
            barcodeCode: " w6-sku ",
          }),
        ).resolves.toMatchObject({ barcodeCode: "W6-SKU" });
      });
    });

    it("attachImage: any signed-in viewer; detachImage: the uploader only", async () => {
      await withTestDb(async (db) => {
        const { owner, friend, stranger, ref } = await seedScenario(db);
        const fileId = await seedFile(db, friend, true);
        const verify: VerifyFile = async (_ctx, id) => ({
          id,
          verifiedAt: new Date().toISOString(),
        });
        const actor = await activate(newItemActor(actorIdFor(ref), db, verify));

        // A friend of nobody in particular may still add an image.
        const image = await actor.attachImage(userCtx(friend, "r"), { fileId });
        expect(image.userId).toBe(friend);

        await expect(
          actor.detachImage(userCtx(stranger, "r"), image.id),
        ).rejects.toThrow(ForbiddenError);
        await expect(
          actor.detachImage(userCtx(owner, "r"), image.id),
        ).rejects.toThrow(ForbiddenError);
        await expect(
          actor.detachImage(userCtx(friend, "r"), image.id),
        ).resolves.toEqual({ id: image.id });
      });
    });

    it("images: a private image is visible to its uploader and nobody else", async () => {
      await withTestDb(async (db) => {
        const { owner, friend, stranger, ref } = await seedScenario(db);
        const verify: VerifyFile = async (_ctx, id) => ({
          id,
          verifiedAt: new Date().toISOString(),
        });
        const actor = await activate(newItemActor(actorIdFor(ref), db, verify));
        await actor.attachImage(userCtx(owner, "r"), {
          fileId: await seedFile(db, owner, true),
          isPublic: true,
        });
        await actor.attachImage(userCtx(friend, "r"), {
          fileId: await seedFile(db, friend, true),
          isPublic: false,
        });

        // `canSeeItemImage` is `is_public OR mine` — friendship is not a
        // branch, which is today's Hasura rule verbatim.
        expect((await actor.images(userCtx(owner, "r"), page)).totalCount).toBe(
          1,
        );
        expect(
          (await actor.images(userCtx(friend, "r"), page)).totalCount,
        ).toBe(2);
        expect(
          (await actor.images(userCtx(stranger, "r"), page)).totalCount,
        ).toBe(1);
      });
    });

    it("image (UI parity G15): one image by id, under the same rule as images", async () => {
      await withTestDb(async (db) => {
        const { owner, friend, stranger, ref } = await seedScenario(db);
        const verify: VerifyFile = async (_ctx, id) => ({
          id,
          verifiedAt: new Date().toISOString(),
        });
        const actor = await activate(newItemActor(actorIdFor(ref), db, verify));
        const shared = await actor.attachImage(userCtx(owner, "r"), {
          fileId: await seedFile(db, owner, true),
          isPublic: true,
        });
        const hidden = await actor.attachImage(userCtx(friend, "r"), {
          fileId: await seedFile(db, friend, true),
          isPublic: false,
        });

        expect((await actor.image(userCtx(stranger, "r"), shared.id))?.id).toBe(
          shared.id,
        );
        expect((await actor.image(userCtx(friend, "r"), hidden.id))?.id).toBe(
          hidden.id,
        );
        // Not visible and not this item's answer alike: null.
        expect(await actor.image(userCtx(stranger, "r"), hidden.id)).toBeNull();
        expect(await actor.image(userCtx(owner, "r"), randomUUID())).toBeNull();
        await expect(
          actor.image(anonymousCtx("r"), shared.id),
        ).rejects.toThrow();
      });
    });

    it("addReview: anyone signed in; update/delete: the author only", async () => {
      await withTestDb(async (db) => {
        const { owner, friend, stranger, actor } = await seedScenario(db);
        const review = await actor.addReview(userCtx(stranger, "r"), {
          score: 4,
          text: '{"note":"good"}',
        });
        expect(review.userId).toBe(stranger);

        for (const viewer of [owner, friend]) {
          await expect(
            actor.updateReview(userCtx(viewer, "r"), review.id, { score: 1 }),
          ).rejects.toThrow(ForbiddenError);
          await expect(
            actor.deleteReview(userCtx(viewer, "r"), review.id),
          ).rejects.toThrow(ForbiddenError);
        }
        await expect(
          actor.updateReview(userCtx(stranger, "r"), review.id, { score: 5 }),
        ).resolves.toMatchObject({ score: 5 });
        await expect(
          actor.deleteReview(userCtx(stranger, "r"), review.id),
        ).resolves.toEqual({ id: review.id });
      });
    });

    it("myReview (UI parity G7): the viewer's own newest review, or null", async () => {
      await withTestDb(async (db) => {
        const { owner, friend, stranger, actor } = await seedScenario(db);
        await actor.addReview(userCtx(owner, "r"), { score: 2 });
        await actor.addReview(userCtx(friend, "r"), { score: 3 });
        const newest = await actor.addReview(userCtx(owner, "r2"), {
          score: 4.5,
        });

        // `created_at` is `now()`, one instant inside the harness's single
        // transaction, so "newest" falls to the id tie-break the cache sorts
        // by; assert against whichever row the cache puts first.
        const ownerReview = await actor.myReview(userCtx(owner, "r"));
        const ownerRows = (
          await actor.reviews(userCtx(owner, "r"), page)
        ).entries
          .map((entry) => entry.node)
          .filter((review) => review.userId === owner);
        expect(ownerRows).toHaveLength(2);
        expect(ownerReview).toEqual(ownerRows[0]);
        expect([2, newest.score]).toContain(ownerReview?.score);

        expect((await actor.myReview(userCtx(friend, "r")))?.score).toBe(3);
        // Someone else's review is never "mine".
        expect(await actor.myReview(userCtx(stranger, "r"))).toBeNull();
        await expect(actor.myReview(anonymousCtx("r"))).rejects.toThrow(
          ForbiddenError,
        );
      });
    });

    it("reviews / score / brands: every signed-in viewer, anonymous refused", async () => {
      await withTestDb(async (db) => {
        const { owner, friend, stranger, actor } = await seedScenario(db);
        await actor.addReview(userCtx(owner, "r"), { score: 3 });
        for (const viewer of [owner, friend, stranger]) {
          const ctx = userCtx(viewer, "r");
          expect((await actor.reviews(ctx, page)).totalCount).toBe(1);
          expect((await actor.score(ctx)).count).toBe(1);
          expect((await actor.brands(ctx, page)).totalCount).toBe(0);
        }
        await expect(actor.reviews(anonymousCtx("r"), page)).rejects.toThrow(
          ForbiddenError,
        );
        await expect(actor.score(anonymousCtx("r"))).rejects.toThrow(
          ForbiddenError,
        );
        await expect(actor.brands(anonymousCtx("r"), page)).rejects.toThrow(
          ForbiddenError,
        );
      });
    });

    it("linkBrand / unlinkBrand: the item's creator only", async () => {
      await withTestDb(async (db) => {
        const { owner, friend, stranger, actor } = await seedScenario(db);
        const brandId = await seedBrand(db, `Brand ${randomUUID()}`);

        for (const viewer of [friend, stranger]) {
          await expect(
            actor.linkBrand(userCtx(viewer, "r"), { brandId }),
          ).rejects.toThrow(ForbiddenError);
        }
        const link = await actor.linkBrand(userCtx(owner, "r"), {
          brandId,
          isPrimary: true,
        });
        expect(link.isPrimary).toBe(true);

        // Idempotent on (item, brandId): a second link is the same row.
        const again = await actor.linkBrand(userCtx(owner, "r"), {
          brandId,
          isPrimary: true,
        });
        expect(again.id).toBe(link.id);
        expect((await actor.brands(userCtx(owner, "r"), page)).totalCount).toBe(
          1,
        );

        for (const viewer of [friend, stranger]) {
          await expect(
            actor.unlinkBrand(userCtx(viewer, "r"), brandId),
          ).rejects.toThrow(ForbiddenError);
        }
        await expect(
          actor.unlinkBrand(userCtx(owner, "r"), brandId),
        ).resolves.toEqual({ brandId });
      });
    });

    it("regenerateVector: system only, never a user", async () => {
      await withTestDb(async (db) => {
        const { owner, friend, stranger, ref } = await seedScenario(db);
        const embed: EmbedDocument = async () => ({
          vector: Array.from({ length: 768 }, () => 0.01),
          model: null,
        });
        const actor = await activate(
          newItemActor(actorIdFor(ref), db, noVerify, embed),
        );
        for (const viewer of [owner, friend, stranger]) {
          await expect(
            actor.regenerateVector(userCtx(viewer, "r")),
          ).rejects.toThrow(ForbiddenError);
        }
        await expect(
          actor.regenerateVector(testDelivery("1")),
        ).resolves.toMatchObject({ skipped: false });
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* attachImage refuses an unverified file (§2.1)                       */
  /* ------------------------------------------------------------------ */

  describe("attachImage verifies through FileActor first (§2.1)", () => {
    it("refuses a file whose object never landed", async () => {
      await withTestDb(async (db) => {
        const { owner, ref } = await seedScenario(db);
        const fileId = await seedFile(db, owner, false);
        // What `FileActor.verify` does when the binding reports no object.
        const verify: VerifyFile = async () => {
          throw new ConflictError("the PUT has not completed");
        };
        const actor = await activate(newItemActor(actorIdFor(ref), db, verify));
        await expect(
          actor.attachImage(userCtx(owner, "r"), { fileId }),
        ).rejects.toThrow(ConflictError);

        const rows = await db.execute<{ count: string }>(
          sql`select count(*) as count from public.item_image where wine_id = ${ref.id}::uuid`,
        );
        expect(rows.rows[0]?.count).toBe("0");
      });
    });

    it("refuses a file FileActor reports as unverified", async () => {
      await withTestDb(async (db) => {
        const { owner, ref } = await seedScenario(db);
        const fileId = await seedFile(db, owner, false);
        const verify: VerifyFile = async (_ctx, id) => ({
          id,
          verifiedAt: null,
        });
        const actor = await activate(newItemActor(actorIdFor(ref), db, verify));
        await expect(
          actor.attachImage(userCtx(owner, "r"), { fileId }),
        ).rejects.toThrow(/not verified/);
      });
    });

    it("is idempotent on an explicit imageId (§8.4)", async () => {
      await withTestDb(async (db) => {
        const { owner, ref } = await seedScenario(db);
        const fileId = await seedFile(db, owner, true);
        const verify: VerifyFile = async (_ctx, id) => ({
          id,
          verifiedAt: new Date().toISOString(),
        });
        const actor = await activate(newItemActor(actorIdFor(ref), db, verify));
        const imageId = randomUUID();
        const first = await actor.attachImage(userCtx(owner, "r"), {
          fileId,
          imageId,
        });
        const second = await actor.attachImage(userCtx(owner, "r"), {
          fileId,
          imageId,
        });
        expect(second.id).toBe(first.id);
        expect((await actor.images(userCtx(owner, "r"), page)).totalCount).toBe(
          1,
        );
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* Ids that arrive as arguments are canonicalised (lib/uuid.ts)         */
  /* ------------------------------------------------------------------ */

  /**
   * Every row id Postgres hands back is lowercase; an argument need not be.
   * Each method here compared the argument to a row with `===`, so an
   * uppercase copy of a real id missed it — an explicit `imageId` stopped
   * being idempotent, and detach/update/delete/unlink said "not on this item".
   */
  it("reads an uppercase image, review or brand id as the same row", async () => {
    await withTestDb(async (db) => {
      const { owner, ref } = await seedScenario(db);
      const ctx = userCtx(owner, "r");
      const verify: VerifyFile = async (_ctx, id) => ({
        id,
        verifiedAt: new Date().toISOString(),
      });
      const actor = await activate(newItemActor(actorIdFor(ref), db, verify));

      const imageId = randomUUID();
      const fileId = await seedFile(db, owner, true);
      const image = await actor.attachImage(ctx, {
        fileId: fileId.toUpperCase(),
        imageId: imageId.toUpperCase(),
      });
      expect(image.id).toBe(imageId);
      await expect(
        actor.attachImage(ctx, { fileId, imageId: imageId.toUpperCase() }),
      ).resolves.toEqual(image);
      await expect(
        actor.detachImage(ctx, imageId.toUpperCase()),
      ).resolves.toEqual({ id: imageId });

      const reviewId = randomUUID();
      const review = await actor.addReview(ctx, {
        reviewId: reviewId.toUpperCase(),
        score: 4,
      });
      expect(review.id).toBe(reviewId);
      await expect(
        actor.updateReview(ctx, reviewId.toUpperCase(), { score: 3 }),
      ).resolves.toMatchObject({ id: reviewId, score: 3 });
      await expect(
        actor.deleteReview(ctx, reviewId.toUpperCase()),
      ).resolves.toMatchObject({ id: reviewId });

      const brandId = await seedBrand(db, "Maison Test");
      await actor.linkBrand(ctx, { brandId: brandId.toUpperCase() });
      await expect(
        actor.unlinkBrand(ctx, brandId.toUpperCase()),
      ).resolves.toEqual({ brandId });
    });
  });

  /* ------------------------------------------------------------------ */
  /* regenerateVector — change detection on embedding-relevant fields    */
  /* ------------------------------------------------------------------ */

  describe("regenerateVector runs only when the embedding would change", () => {
    it("`create` enqueues one row; `setBarcode` enqueues none", async () => {
      await withTestDb(async (db) => {
        const user = await seedUser(db);
        const { ref, actor } = await createItem(db, "WINE", user);
        const key = actorIdFor(ref);

        expect(await pendingOutbox(db, key)).toEqual([
          {
            method: "regenerateVector",
            payload: { reason: "create", itemType: "WINE", itemId: ref.id },
          },
        ]);

        await db.execute(
          sql`insert into public.barcodes (code, type) values ('0000000000002', 'EAN13')`,
        );
        await actor.setBarcode(testDelivery("x"), {
          code: "0000000000002",
        });
        // Still exactly the one row `create` wrote: `barcode_code` is not in
        // EMBEDDING_FIELDS, so today's "every column update re-embeds" is gone.
        expect(await pendingOutbox(db, key)).toHaveLength(1);
      });
    });

    it("a description change enqueues; re-writing the same name does not", async () => {
      await withTestDb(async (db) => {
        const user = await seedUser(db);
        const { ref, actor } = await createItem(db, "WINE", user);
        const key = actorIdFor(ref);

        await actor.update(userCtx(user, "r"), { name: "Test Wine" });
        expect(await pendingOutbox(db, key)).toHaveLength(1);

        await actor.update(userCtx(user, "r"), { description: "Cherry, oak" });
        const rows = await pendingOutbox(db, key);
        expect(rows).toHaveLength(2);
        expect(rows[1]?.payload).toMatchObject({ reason: "update" });
      });
    });

    it("writes a vector, then skips a re-delivery without calling the model", async () => {
      await withTestDb(async (db) => {
        const user = await seedUser(db);
        const { ref } = await createItem(db, "WINE", user);
        let calls = 0;
        const embed: EmbedDocument = async () => {
          calls += 1;
          return {
            vector: Array.from({ length: 768 }, (_, i) => (i === 3 ? 1 : 0)),
            model: null,
          };
        };
        const actor = await activate(
          newItemActor(actorIdFor(ref), db, noVerify, embed),
        );

        const first = await actor.regenerateVector(deliveryCtx(randomUUID()));
        expect(first).toMatchObject({ skipped: false, reason: "first vector" });
        expect(calls).toBe(1);

        // At-least-once delivery: the same row arrives again.
        const second = await actor.regenerateVector(deliveryCtx(randomUUID()));
        expect(second.skipped).toBe(true);
        expect(calls).toBe(1);

        const stored = await db
          .select({ id: itemVectors.id })
          .from(itemVectors)
          .where(eq(itemVectors.wineId, ref.id));
        expect(stored).toHaveLength(1);
      });
    });

    it("two activations that both saw no vector upsert one row instead of failing on the unique index", async () => {
      await withTestDb(async (db) => {
        const user = await seedUser(db);
        const { ref } = await createItem(db, "WINE", user);
        const embed: EmbedDocument = async () => ({
          vector: Array.from({ length: 768 }, (_, i) => (i === 5 ? 1 : 0)),
          model: null,
        });
        // A placement split-brain: two activations of one item, each of which
        // loaded its aggregate before either wrote a vector.
        const first = await activate(
          newItemActor(actorIdFor(ref), db, noVerify, embed),
        );
        const second = await activate(
          newItemActor(actorIdFor(ref), db, noVerify, embed),
        );
        await expect(
          first.regenerateVector(deliveryCtx(randomUUID())),
        ).resolves.toMatchObject({ skipped: false });
        await expect(
          second.regenerateVector(deliveryCtx(randomUUID())),
        ).resolves.toMatchObject({ skipped: false });

        const stored = await db
          .select({ id: itemVectors.id })
          .from(itemVectors)
          .where(eq(itemVectors.wineId, ref.id));
        expect(stored).toHaveLength(1);
      });
    });

    /**
     * Freshness compares the vector's `updated_at` against the item row's, and
     * the item row is stamped by the database. The legacy `BEFORE UPDATE`
     * trigger on `item_vectors` used to hide that the update path wrote the
     * *application's* clock; with it disabled (it is not in the Drizzle schema,
     * and a database built without it is a legitimate one) the write itself
     * must still use the database's.
     */
    it("stamps the vector with the database clock on the update path, trigger or no trigger", async () => {
      await withTestDb(async (db) => {
        const user = await seedUser(db);
        const { ref } = await createItem(db, "WINE", user);
        const embed: EmbedDocument = async () => ({
          vector: Array.from({ length: 768 }, (_, i) => (i === 6 ? 1 : 0)),
          model: null,
        });
        const actor = await activate(
          newItemActor(actorIdFor(ref), db, noVerify, embed),
        );
        await actor.regenerateVector(deliveryCtx(randomUUID()));

        // Disables ordinary triggers for this transaction only.
        await db.execute(sql`set local session_replication_role = replica`);
        await db.execute(sql`
          update public.item_vectors set updated_at = now() - interval '1 day'
          where wine_id = ${ref.id}::uuid
        `);
        await db.execute(sql`
          update public.wines set updated_at = now() - interval '1 hour'
          where id = ${ref.id}::uuid
        `);
        const stale = await activate(
          newItemActor(actorIdFor(ref), db, noVerify, embed),
        );
        await expect(
          stale.regenerateVector(deliveryCtx(randomUUID())),
        ).resolves.toMatchObject({ skipped: false, reason: "item changed" });

        const { rows } = await db.execute<{ same: boolean }>(sql`
          select updated_at = now() as same from public.item_vectors
          where wine_id = ${ref.id}::uuid
        `);
        expect(rows).toEqual([{ same: true }]);
      });
    });

    describe("which embedding made the vector", () => {
      const MODEL = "vertex-ai:gemini-embedding-2@768/RETRIEVAL_DOCUMENT";
      afterEach(() => setEmbeddingModel(null));

      const recordingEmbed = (model: string | null) => {
        const inputs: EmbedDocumentInput[] = [];
        const embed: EmbedDocument = async (_ctx, input) => {
          inputs.push(input);
          return {
            vector: Array.from({ length: 768 }, (_, i) => (i === 9 ? 1 : 0)),
            model,
          };
        };
        return { inputs, embed };
      };

      const storedIdentity = async (db: DbOrTx, ref: ItemRef) =>
        await db
          .select({
            model: itemVectors.embeddingModel,
            images: itemVectors.embeddingImages,
          })
          .from(itemVectors)
          .where(eq(itemVectors.wineId, ref.id));

      /**
       * The cutover case. Every migrated vector has no recorded identity, and
       * its `updated_at` is newer than the item row, so the timestamp alone
       * called it fresh and a re-embed after the model change did nothing.
       */
      it("re-embeds a vector nothing recorded (a migrated legacy row), and one another model made", async () => {
        await withTestDb(async (db) => {
          const user = await seedUser(db);
          const { ref } = await createItem(db, "WINE", user);
          setEmbeddingModel({ key: MODEL, acceptsImages: false });
          const { inputs, embed } = recordingEmbed(MODEL);
          const fresh = () =>
            activate(newItemActor(actorIdFor(ref), db, noVerify, embed));

          await (await fresh()).regenerateVector(deliveryCtx(randomUUID()));
          expect(await storedIdentity(db, ref)).toEqual([
            { model: MODEL, images: NO_IMAGES },
          ]);

          // What a transformed legacy row looks like.
          await db.execute(sql`
            update public.item_vectors
            set embedding_model = null, embedding_images = null
            where wine_id = ${ref.id}::uuid
          `);
          await expect(
            (await fresh()).regenerateVector(deliveryCtx(randomUUID())),
          ).resolves.toMatchObject({
            skipped: false,
            reason: "embedding changed",
          });
          expect(inputs).toHaveLength(2);
          expect(await storedIdentity(db, ref)).toEqual([
            { model: MODEL, images: NO_IMAGES },
          ]);

          // Same model, nothing changed: a SELECT, not an embedding.
          await expect(
            (await fresh()).regenerateVector(deliveryCtx(randomUUID())),
          ).resolves.toMatchObject({ skipped: true });
          expect(inputs).toHaveLength(2);

          // A deploy with another model: every vector is stale again.
          setEmbeddingModel({
            key: "ollama:nomic@768/x",
            acceptsImages: false,
          });
          await expect(
            (await fresh()).regenerateVector(deliveryCtx(randomUUID())),
          ).resolves.toMatchObject({ reason: "embedding changed" });
          expect(inputs).toHaveLength(3);
        });
      });

      /**
       * Legacy `generateItemVector` (`82450ad1`) embedded the front and back
       * label from the item's onboarding and its most recent image with the
       * text, into one vector. A model that takes images gets the same set,
       * in the same order, and the row records it.
       */
      it("sends the onboarding labels, then the newest image, when the model takes images", async () => {
        await withTestDb(async (db) => {
          const user = await seedUser(db);
          const { ref } = await createItem(db, "WINE", user);
          const [front, back, oldDisplay, newDisplay] = [
            await seedFile(db, user, true),
            await seedFile(db, user, true),
            await seedFile(db, user, true),
            await seedFile(db, user, true),
          ];
          await db.execute(sql`
            update public.item_onboardings
            set front_label_image_id = ${front}::uuid,
                back_label_image_id = ${back}::uuid
            where id = (select item_onboarding_id from public.wines
                        where id = ${ref.id}::uuid)
          `);
          for (const [fileId, age] of [
            [oldDisplay, "2 days"],
            [newDisplay, "1 day"],
          ] as const) {
            await db.execute(sql`
              insert into public.item_image
                (user_id, file_id, wine_id, is_public, created_at)
              values (${user}::uuid, ${fileId}::uuid, ${ref.id}::uuid, true,
                      now() - ${age}::interval)
            `);
          }
          setEmbeddingModel({ key: MODEL, acceptsImages: true });
          const { inputs, embed } = recordingEmbed(MODEL);
          await (
            await activate(newItemActor(actorIdFor(ref), db, noVerify, embed))
          ).regenerateVector(deliveryCtx(randomUUID()));

          expect(inputs[0]?.imageFileIds).toEqual([front, back, newDisplay]);
          expect(await storedIdentity(db, ref)).toEqual([
            { model: MODEL, images: imageSetKey([front, back, newDisplay]) },
          ]);
        });
      });

      it("a text-only model is sent no images, whatever the item has", async () => {
        await withTestDb(async (db) => {
          const user = await seedUser(db);
          const { ref } = await createItem(db, "WINE", user);
          const file = await seedFile(db, user, true);
          await db.execute(sql`
            insert into public.item_image (user_id, file_id, wine_id, is_public)
            values (${user}::uuid, ${file}::uuid, ${ref.id}::uuid, true)
          `);
          setEmbeddingModel({ key: MODEL, acceptsImages: false });
          const { inputs, embed } = recordingEmbed(MODEL);
          await (
            await activate(newItemActor(actorIdFor(ref), db, noVerify, embed))
          ).regenerateVector(deliveryCtx(randomUUID()));
          expect(inputs[0]?.imageFileIds).toEqual([]);
        });
      });

      it("attaching an image enqueues a re-embed only when the model takes images", async () => {
        await withTestDb(async (db) => {
          const user = await seedUser(db);
          const { ref } = await createItem(db, "WINE", user);
          const key = actorIdFor(ref);
          const verify: VerifyFile = async (_ctx, id) => ({
            id,
            verifiedAt: new Date().toISOString(),
          });
          const regenerations = async () =>
            (await pendingOutbox(db, key)).filter(
              (row) => row.method === "regenerateVector",
            );
          const before = (await regenerations()).length;

          const textOnly = await activate(newItemActor(key, db, verify));
          await textOnly.attachImage(userCtx(user, "r"), {
            fileId: await seedFile(db, user, true),
          });
          expect(await regenerations()).toHaveLength(before);

          setEmbeddingModel({ key: MODEL, acceptsImages: true });
          const multimodal = await activate(newItemActor(key, db, verify));
          const image = await multimodal.attachImage(userCtx(user, "r"), {
            fileId: await seedFile(db, user, true),
          });
          await multimodal.detachImage(userCtx(user, "r"), image.id);
          const rows = await regenerations();
          expect(rows.slice(before).map((row) => row.payload)).toEqual([
            { reason: "image", itemType: "WINE", itemId: ref.id },
            { reason: "image", itemType: "WINE", itemId: ref.id },
          ]);
        });
      });
    });

    it("embeds descriptive columns and never the barcode", async () => {
      const text = embeddingTextFor(
        { type: "WINE", id: "x" },
        {
          id: "x",
          name: "Clos de Vougeot",
          description: "Earthy",
          createdAt: new Date(),
          updatedAt: new Date(),
          createdById: "u",
          vintage: "2015-01-01",
          variety: "PINOT_NOIR",
          region: "Burgundy",
          wineryId: null,
          specialDesignation: null,
          vineyardDesignation: null,
          alcoholContentPercentage: "13.5",
          barcodeCode: "0000000000003",
          style: "RED",
          country: "FRANCE",
          itemOnboardingId: "o",
        },
      );
      expect(text).toContain("Clos de Vougeot");
      expect(text).toContain("Burgundy");
      expect(text).not.toContain("0000000000003");
    });
  });

  /* ------------------------------------------------------------------ */
  /* score replaces the `_aggregate` call                                */
  /* ------------------------------------------------------------------ */

  describe("score (§2.1: replaces the `_aggregate` calls)", () => {
    it("matches avg()/count() over the same fixture", async () => {
      await withTestDb(async (db) => {
        const user = await seedUser(db);
        const { ref, actor } = await createItem(db, "WINE", user);
        const scores = [0.5, 3, 4.5, 5];
        for (const score of scores) {
          const reviewer = await seedUser(db);
          await actor.addReview(userCtx(reviewer, "r"), { score });
        }

        const aggregate = await db.execute<{ avg: string; n: string }>(sql`
          select avg(score)::numeric as avg, count(*) as n
            from public.item_reviews where wine_id = ${ref.id}::uuid
        `);
        const row = aggregate.rows[0];
        const result = await actor.score(userCtx(user, "r"));
        expect(result.count).toBe(Number(row?.n));
        expect(result.average).toBeCloseTo(Number(row?.avg), 2);
      });
    });

    it("is null, not zero, with no reviews", async () => {
      await withTestDb(async (db) => {
        const user = await seedUser(db);
        const { actor } = await createItem(db, "TEA", user);
        expect(await actor.score(userCtx(user, "r"))).toEqual({
          average: null,
          count: 0,
        });
      });
    });

    it("refuses a score the check constraint would reject", async () => {
      await withTestDb(async (db) => {
        const user = await seedUser(db);
        const { actor } = await createItem(db, "BEER", user);
        await expect(
          actor.addReview(userCtx(user, "r"), { score: 3.7 }),
        ).rejects.toThrow(ValidationError);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* The seventh key namespace                                           */
  /* ------------------------------------------------------------------ */

  describe("`generic:` is a key namespace, not an ItemType", () => {
    it("creates, reads and updates a generic item", async () => {
      await withTestDb(async (db) => {
        const user = await seedUser(db);
        const id = randomUUID();
        const actor = await activate(newItemActor(`generic:${id}`, db));
        const created = await actor.createGeneric(userCtx(user, "r"), {
          name: `Salt ${id.slice(0, 8)}`,
          category: "seasoning",
          kind: "ingredient",
        });
        expect(created.kind).toBe("ingredient");
        expect(created.createdById).toBe(user);

        await expect(
          actor.getGeneric(userCtx(user, "r")),
        ).resolves.toMatchObject({ id, category: "seasoning" });
        await expect(
          actor.updateGeneric(userCtx(user, "r"), { subcategory: "mineral" }),
        ).resolves.toMatchObject({ subcategory: "mineral" });
      });
    });

    it("updateGeneric: creator yes, stranger no, admin yes", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        await seedFriendship(db, owner, friend);
        const id = randomUUID();
        const actor = await activate(newItemActor(`generic:${id}`, db));
        await actor.createGeneric(userCtx(owner, "r"), {
          name: `Gin ${id.slice(0, 8)}`,
          category: "spirit",
          kind: "spirit",
        });

        for (const viewer of [friend, stranger]) {
          await expect(
            actor.updateGeneric(userCtx(viewer, "r"), { name: "Nope" }),
          ).rejects.toThrow(ForbiddenError);
        }
        await expect(
          actor.updateGeneric(adminCtx(stranger, "r"), { name: "Admin Gin" }),
        ).resolves.toMatchObject({ name: "Admin Gin" });
      });
    });

    it("refuses a kind the check constraint does not allow", async () => {
      await withTestDb(async (db) => {
        const user = await seedUser(db);
        const actor = await activate(
          newItemActor(`generic:${randomUUID()}`, db),
        );
        await expect(
          actor.createGeneric(userCtx(user, "r"), {
            name: "Honey Wine",
            category: "mead",
            // Not an item type, not `ingredient`.
            kind: "mead" as never,
          }),
        ).rejects.toThrow(ValidationError);
      });
    });

    it("accepts every item type as a kind, sake and tea included", async () => {
      await withTestDb(async (db) => {
        const user = await seedUser(db);
        for (const kind of ["sake", "tea"] as const) {
          const actor = await activate(
            newItemActor(`generic:${randomUUID()}`, db),
          );
          const created = await actor.createGeneric(userCtx(user, "r"), {
            name: `A ${kind}`,
            category: kind,
            kind,
          });
          expect(created.kind).toBe(kind);
        }
      });
    });

    it("a generic key refuses every item method", async () => {
      await withTestDb(async (db) => {
        const user = await seedUser(db);
        const id = randomUUID();
        const actor = await activate(newItemActor(`generic:${id}`, db));
        await actor.createGeneric(userCtx(user, "r"), {
          name: `Sugar ${id.slice(0, 8)}`,
          category: "seasoning",
          kind: "ingredient",
        });
        await expect(actor.get(userCtx(user, "r"))).rejects.toThrow(
          ValidationError,
        );
        await expect(actor.score(userCtx(user, "r"))).rejects.toThrow(
          ValidationError,
        );
        await expect(actor.images(userCtx(user, "r"), page)).rejects.toThrow(
          ValidationError,
        );
      });
    });

    it("an item key refuses getGeneric", async () => {
      await withTestDb(async (db) => {
        const user = await seedUser(db);
        const { actor } = await createItem(db, "SPIRIT", user);
        await expect(actor.getGeneric(userCtx(user, "r"))).rejects.toThrow(
          ValidationError,
        );
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* Absence and denial are indistinguishable                            */
  /* ------------------------------------------------------------------ */

  it("an id with no row is NotFound", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const actor = await activate(newItemActor(`wine:${randomUUID()}`, db));
      await expect(actor.get(userCtx(user, "r"))).rejects.toThrow(
        NotFoundError,
      );
    });
  });
});
