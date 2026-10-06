/**
 * `ItemSearchActor` with `imageFileId` — G32, image search.
 *
 * What a photo search must get right beyond "it returned rows":
 *
 *  - **both vector sets take part, and each item ranks by the nearer** — an
 *    item whose own fused vector is far from the photo but whose stored photo
 *    is near beats an item matched only through its text;
 *  - **a private photo never surfaces an item** for a viewer who may not see
 *    that photo, while its owner's own search does use it — and the viewer is
 *    in the key, so the two never share an activation;
 *  - **only the configured image embedding's vectors** are compared;
 *  - the photo is embedded as a `query`, as this viewer, and an
 *    `IMAGE_SEARCH_UNAVAILABLE` refusal reaches the caller unchanged;
 *  - **the photo is discarded once the search has used it** — once per
 *    result set, as the viewer, never instead of the result, and not after a
 *    failure a retry could get past.
 */
import type { Ctx, ItemSearchInput } from "@cellar-assistant/contracts";
import {
  ConflictError,
  itemSearchActorId,
  ValidationError,
} from "@cellar-assistant/contracts";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import type { EmbedImage } from "../lib/embedding-client.ts";
import type { DiscardSearchPhoto } from "../lib/search-photos.ts";
import {
  blendedVector,
  seedItemImage,
  seedItemImageVector,
  seedItemVector,
  seedWine,
  unitVector,
} from "../lib/search-testing.ts";
import {
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { ItemSearchActor } from "./item-search-actor.ts";

const { skip } = await resolveTestDatabase();

const IMAGE_MODEL = "vertex-ai:gemini-embedding-2@768/IMAGE";
const OTHER_IMAGE_MODEL = "vertex-ai:gemini-embedding-2-preview@768/IMAGE";
const PHOTO = "0b5f8c2e-9d61-4c7a-8f0e-3a1b2c4d5e6f";

const userCtx = (viewerId: string): Ctx => ({
  viewerId,
  kind: "user",
  requestId: "r",
});

/** The photo embeds to axis 0 — the query every seeded vector is measured from. */
const photoAt0: EmbedImage = async () => ({
  vector: unitVector(0),
  model: IMAGE_MODEL,
});

const newActor = (
  input: ItemSearchInput,
  db: DbOrTx,
  viewerId: string | null,
  embedImage: EmbedImage = photoAt0,
  discardPhoto: DiscardSearchPhoto = async () => {},
): ItemSearchActor =>
  new ItemSearchActor(
    new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
    new ActorId(itemSearchActorId(input, viewerId)),
    db,
    async () => {
      throw new Error("a photo search embeds no phrase");
    },
    embedImage,
    discardPhoto,
  );

/** A `DiscardSearchPhoto` that records `<viewer>:<fileId>` per call. */
const recordingDiscard = () => {
  const discarded: string[] = [];
  const discard: DiscardSearchPhoto = async (ctx, fileId) => {
    discarded.push(`${ctx.viewerId}:${fileId}`);
  };
  return { discarded, discard };
};

const search = async (
  db: DbOrTx,
  viewerId: string,
  input: ItemSearchInput = { imageFileId: PHOTO, maxDistance: 2 },
  embedImage: EmbedImage = photoAt0,
) => newActor(input, db, viewerId, embedImage).all(userCtx(viewerId), input);

describe.skipIf(skip)("ItemSearchActor — image search (G32)", () => {
  afterAll(closeTestDb);

  it("ranks each item by the nearer of its item vector and its photos — an image match beats a text match", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      // "Text Match": its fused item vector is 30° off the photo (≈0.134).
      const textMatch = await seedWine(db, owner, "Text Match");
      await seedItemVector(db, textMatch, blendedVector(0, 1, 1 / 3));
      // "Photo Match": its fused vector is orthogonal (distance 1), but a
      // stored photo of it is 10° off (≈0.015) — the same bottle, photographed.
      const photoMatch = await seedWine(db, owner, "Photo Match");
      await seedItemVector(db, photoMatch, unitVector(1));
      const image = await seedItemImage(db, photoMatch, owner);
      await seedItemImageVector(
        db,
        image.imageId,
        blendedVector(0, 2, 1 / 9),
        IMAGE_MODEL,
      );

      const hits = await search(db, owner);
      expect(hits.map((hit) => hit.name)).toEqual([
        "Photo Match",
        "Text Match",
      ]);
      expect(hits[0]?.distance).toBeCloseTo(1 - Math.cos(Math.PI / 18), 3);
      expect(hits[1]?.distance).toBeCloseTo(1 - Math.cos(Math.PI / 6), 3);
    });
  });

  it("collapses several photos of one item to one row, at the nearest", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const wine = await seedWine(db, owner, "Often Photographed");
      await seedItemVector(db, wine, unitVector(1));
      for (const vector of [unitVector(0), unitVector(2), unitVector(3)]) {
        const image = await seedItemImage(db, wine, owner);
        await seedItemImageVector(db, image.imageId, vector, IMAGE_MODEL);
      }
      const hits = await search(db, owner);
      expect(hits).toHaveLength(1);
      expect(hits[0]?.distance).toBeCloseTo(0, 3);
    });
  });

  it("never lets another person's private photo surface an item; the owner's own search uses it", async () => {
    await withTestDb(async (db) => {
      const photographer = await seedUser(db);
      const stranger = await seedUser(db);
      const wine = await seedWine(db, photographer, "Privately Photographed");
      // Its own vector is outside the cutoff, so only the photo could find it.
      await seedItemVector(db, wine, unitVector(1));
      const image = await seedItemImage(db, wine, photographer, {
        isPublic: false,
      });
      await seedItemImageVector(db, image.imageId, unitVector(0), IMAGE_MODEL);

      const input: ItemSearchInput = { imageFileId: PHOTO, maxDistance: 0.4 };
      expect(await search(db, stranger, input)).toEqual([]);
      expect(
        (await search(db, photographer, input)).map((hit) => hit.name),
      ).toEqual(["Privately Photographed"]);
      // A public photo of the same item is fair game for anyone.
      const shared = await seedItemImage(db, wine, photographer);
      await seedItemImageVector(db, shared.imageId, unitVector(0), IMAGE_MODEL);
      expect(
        (await search(db, stranger, input)).map((hit) => hit.name),
      ).toEqual(["Privately Photographed"]);
    });
  });

  it("puts the viewer in the key for a photo search, and only then", () => {
    const photo: ItemSearchInput = { imageFileId: PHOTO };
    expect(itemSearchActorId(photo, "a")).not.toBe(
      itemSearchActorId(photo, "b"),
    );
    const text: ItemSearchInput = { text: "pinot noir" };
    expect(itemSearchActorId(text, "a")).toBe(itemSearchActorId(text, "b"));
  });

  it("ignores image vectors another embedding made", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const wine = await seedWine(db, owner, "Old Space");
      await seedItemVector(db, wine, unitVector(1));
      const image = await seedItemImage(db, wine, owner);
      await seedItemImageVector(
        db,
        image.imageId,
        unitVector(0),
        OTHER_IMAGE_MODEL,
      );
      const hits = await search(db, owner, {
        imageFileId: PHOTO,
        maxDistance: 0.4,
      });
      expect(hits).toEqual([]);
    });
  });

  it("embeds the photo as a query, as the viewer, by its file id", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const asked: string[] = [];
      await search(db, owner, { imageFileId: PHOTO }, async (ctx, input) => {
        asked.push(`${ctx.viewerId}:${input.purpose}:${input.fileId}`);
        return { vector: unitVector(0), model: IMAGE_MODEL };
      });
      expect(asked).toEqual([`${owner}:query:${PHOTO}`]);
    });
  });

  it("passes an IMAGE_SEARCH_UNAVAILABLE refusal through unchanged", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const refusal = await search(
        db,
        owner,
        { imageFileId: PHOTO },
        async () => {
          throw new ConflictError(
            "ollama cannot embed a photo",
            "IMAGE_SEARCH_UNAVAILABLE",
          );
        },
      ).catch((error: unknown) => error);
      expect(refusal).toBeInstanceOf(ConflictError);
      expect(refusal).toMatchObject({
        code: "CONFLICT",
        reason: "IMAGE_SEARCH_UNAVAILABLE",
      });
    });
  });

  it("takes exactly one of text, vector or imageFileId", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      await expect(
        search(db, owner, { imageFileId: PHOTO, text: "merlot" }),
      ).rejects.toThrow(ValidationError);
      await expect(
        search(db, owner, { imageFileId: "not-a-uuid" }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("discarding the search photo", () => {
    it("discards it once the search has used it — as the viewer, once per result set", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const { discarded, discard } = recordingDiscard();
        const input: ItemSearchInput = {
          imageFileId: PHOTO.toUpperCase(),
          maxDistance: 2,
        };
        const actor = newActor(input, db, owner, photoAt0, discard);
        await actor.results(userCtx(owner), input, { first: 1, after: null });
        await actor.results(userCtx(owner), input, { first: 5, after: null });
        await actor.all(userCtx(owner), input);
        expect(discarded).toEqual([`${owner}:${PHOTO}`]);
      });
    });

    it("discards it after an IMAGE_SEARCH_UNAVAILABLE refusal too — no retry can use it", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const { discarded, discard } = recordingDiscard();
        const input: ItemSearchInput = { imageFileId: PHOTO };
        const refusal = await newActor(
          input,
          db,
          owner,
          async () => {
            throw new ConflictError(
              "ollama cannot embed a photo",
              "IMAGE_SEARCH_UNAVAILABLE",
            );
          },
          discard,
        )
          .all(userCtx(owner), input)
          .catch((error: unknown) => error);
        expect(refusal).toMatchObject({ reason: "IMAGE_SEARCH_UNAVAILABLE" });
        expect(discarded).toEqual([`${owner}:${PHOTO}`]);
      });
    });

    it("keeps it after a failure a retry could get past", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const { discarded, discard } = recordingDiscard();
        const input: ItemSearchInput = { imageFileId: PHOTO };
        await expect(
          newActor(
            input,
            db,
            owner,
            async () => {
              throw new ConflictError("the model timed out");
            },
            discard,
          ).all(userCtx(owner), input),
        ).rejects.toThrow("the model timed out");
        expect(discarded).toEqual([]);
      });
    });

    it("a discard that fails is logged, never the search's failure", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const wine = await seedWine(db, owner, "Still Found");
        await seedItemVector(db, wine, unitVector(0));
        const input: ItemSearchInput = { imageFileId: PHOTO, maxDistance: 2 };
        const hits = await newActor(input, db, owner, photoAt0, async () => {
          throw new Error("sidecar unreachable");
        }).all(userCtx(owner), input);
        expect(hits.map((hit) => hit.name)).toEqual(["Still Found"]);
      });
    });

    it("a text search discards nothing", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const { discarded, discard } = recordingDiscard();
        const input: ItemSearchInput = { vector: unitVector(0) };
        await newActor(input, db, owner, photoAt0, discard).all(
          userCtx(owner),
          input,
        );
        expect(discarded).toEqual([]);
      });
    });
  });
});
