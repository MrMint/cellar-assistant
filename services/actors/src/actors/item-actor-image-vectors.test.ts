/**
 * `ItemActor` and `item_image_vectors` — G32's write side.
 *
 *  - **attaching an image enqueues both embeddings** when the configured model
 *    takes images: the item's own vector (unchanged behaviour, still asserted
 *    here because image search depends on it) and the new image's own vector;
 *    with a text-only model, neither;
 *  - **`embedImage` writes one row per image, keyed by model**, skips a fresh
 *    row without a model call, overwrites another model's, and treats an
 *    image detached in between as nothing to do;
 *  - **detaching an image takes its vector with it** (the FK cascade);
 *  - it is system/admin only — a person cannot spend the embedding budget
 *    through it.
 */
import { randomUUID } from "node:crypto";
import type { Ctx, ItemRef } from "@cellar-assistant/contracts";
import {
  ForbiddenError,
  itemActorId,
  userCtx,
} from "@cellar-assistant/contracts";
import { outbox } from "@cellar-assistant/db";
import { and, eq, sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import type { EmbedImage } from "../lib/embedding-client.ts";
import type { VerifyFile } from "../lib/file-verification.ts";
import {
  seedItemImage,
  seedItemImageVector,
  seedWine,
  unitVector,
} from "../lib/search-testing.ts";
import {
  activate,
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  testDelivery,
  withTestDb,
} from "../lib/testing.ts";
import { setEmbeddingModel } from "../lib/vectors.ts";
import { ItemActor } from "./item-actor.ts";

const MODEL = "vertex-ai:gemini-embedding-2@768/RETRIEVAL_DOCUMENT";
const IMAGE_MODEL = "vertex-ai:gemini-embedding-2@768/IMAGE";
const OLD_IMAGE_MODEL = "vertex-ai:gemini-embedding-2-preview@768/IMAGE";

const verified: VerifyFile = async (_ctx, id) => ({
  id,
  verifiedAt: new Date().toISOString(),
});

const actorFor = (
  db: DbOrTx,
  ref: ItemRef,
  embedImage: EmbedImage = async () => {
    throw new Error("no image embedding expected");
  },
) =>
  activate(
    new ItemActor(
      new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
      new ActorId(itemActorId(ref)),
      db,
      verified,
      async () => {
        throw new Error("no document embedding in this test");
      },
      embedImage,
    ),
  );

const seedVerifiedFile = async (db: DbOrTx, userId: string) => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.files (id, key, uploaded_by, verified_at)
    values (${id}::uuid, ${`item-image/${id}`}, ${userId}::uuid, now())
  `);
  return id;
};

const pending = async (db: DbOrTx, ref: ItemRef) =>
  db
    .select({ method: outbox.method, payload: outbox.payload })
    .from(outbox)
    .where(
      and(
        eq(outbox.targetActor, "ItemActor"),
        eq(outbox.targetId, itemActorId(ref)),
      ),
    );

const imageVectors = async (db: DbOrTx, imageId: string) =>
  (
    await db.execute<{ embedding_model: string }>(sql`
      select embedding_model from public.item_image_vectors
      where item_image_id = ${imageId}::uuid
    `)
  ).rows;

const system = (): Ctx => testDelivery("embed-image");

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("ItemActor — image vectors (G32)", () => {
  afterAll(closeTestDb);
  afterEach(() => setEmbeddingModel(null));

  it("attachImage enqueues the item's vector and the image's own, in the attach transaction — and neither for a text-only model", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const wine = await seedWine(db, user, "Attached Wine");

      setEmbeddingModel({
        key: "ollama:nomic-embed-text@768/RETRIEVAL_DOCUMENT",
        acceptsImages: false,
      });
      await (await actorFor(db, wine)).attachImage(userCtx(user, "r"), {
        fileId: await seedVerifiedFile(db, user),
      });
      expect(await pending(db, wine)).toEqual([]);

      setEmbeddingModel({ key: MODEL, acceptsImages: true });
      const image = await (await actorFor(db, wine)).attachImage(
        userCtx(user, "r"),
        { fileId: await seedVerifiedFile(db, user) },
      );
      const rows = await pending(db, wine);
      expect(rows).toEqual(
        expect.arrayContaining([
          {
            method: "regenerateVector",
            payload: { reason: "image", itemType: "WINE", itemId: wine.id },
          },
          { method: "embedImage", payload: { imageId: image.id } },
        ]),
      );
      expect(rows).toHaveLength(2);
    });
  });

  it("embedImage writes the image's vector under the image key, then skips it without a model call", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const wine = await seedWine(db, user, "Embedded Wine");
      const image = await seedItemImage(db, wine, user);
      setEmbeddingModel({ key: MODEL, acceptsImages: true });
      const asked: string[] = [];
      const embedImage: EmbedImage = async (ctx, input) => {
        asked.push(`${ctx.kind}:${input.purpose}:${input.fileId}`);
        return { vector: unitVector(3), model: IMAGE_MODEL };
      };

      const first = await (await actorFor(db, wine, embedImage)).embedImage(
        system(),
        { imageId: image.imageId },
      );
      expect(first).toEqual({
        imageId: image.imageId,
        skipped: false,
        reason: "first vector",
      });
      expect(await imageVectors(db, image.imageId)).toEqual([
        { embedding_model: IMAGE_MODEL },
      ]);

      const again = await (await actorFor(db, wine, embedImage)).embedImage(
        system(),
        { imageId: image.imageId },
      );
      expect(again).toMatchObject({ skipped: true, reason: "vector is fresh" });
      expect(asked).toEqual([`system:document:${image.fileId}`]);
    });
  });

  it("re-embeds an image vector another model made, overwriting it", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const wine = await seedWine(db, user, "Old-space Wine");
      const image = await seedItemImage(db, wine, user);
      await seedItemImageVector(
        db,
        image.imageId,
        unitVector(1),
        OLD_IMAGE_MODEL,
      );
      setEmbeddingModel({ key: MODEL, acceptsImages: true });
      const result = await (
        await actorFor(db, wine, async () => ({
          vector: unitVector(2),
          model: IMAGE_MODEL,
        }))
      ).embedImage(system(), { imageId: image.imageId });
      expect(result).toMatchObject({
        skipped: false,
        reason: "embedding changed",
      });
      expect(await imageVectors(db, image.imageId)).toEqual([
        { embedding_model: IMAGE_MODEL },
      ]);
    });
  });

  it("does nothing for an image no longer on the item, or with a text-only model", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const wine = await seedWine(db, user, "Quiet Wine");
      const image = await seedItemImage(db, wine, user);
      setEmbeddingModel({ key: MODEL, acceptsImages: true });
      await expect(
        (await actorFor(db, wine)).embedImage(system(), {
          imageId: randomUUID(),
        }),
      ).resolves.toMatchObject({ skipped: true });
      setEmbeddingModel({
        key: "ollama:nomic-embed-text@768/RETRIEVAL_DOCUMENT",
        acceptsImages: false,
      });
      await expect(
        (await actorFor(db, wine)).embedImage(system(), {
          imageId: image.imageId,
        }),
      ).resolves.toMatchObject({ skipped: true });
      expect(await imageVectors(db, image.imageId)).toEqual([]);
    });
  });

  it("is system/admin only", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const wine = await seedWine(db, user, "Guarded Wine");
      const image = await seedItemImage(db, wine, user);
      setEmbeddingModel({ key: MODEL, acceptsImages: true });
      await expect(
        (await actorFor(db, wine)).embedImage(userCtx(user, "r"), {
          imageId: image.imageId,
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  it("detaching an image removes its vector", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const wine = await seedWine(db, user, "Detached Wine");
      const image = await seedItemImage(db, wine, user);
      await seedItemImageVector(db, image.imageId, unitVector(1), IMAGE_MODEL);
      await (await actorFor(db, wine)).detachImage(
        userCtx(user, "r"),
        image.imageId,
      );
      expect(await imageVectors(db, image.imageId)).toEqual([]);
    });
  });
});
