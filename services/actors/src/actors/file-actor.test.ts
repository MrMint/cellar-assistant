/**
 * `FileActor` against a real Postgres, with the `files` binding faked.
 *
 * Everything except the network hop to MinIO is exercised for real: row
 * creation, the ownership checks, `verify`'s idempotency, `delete`. The PUT
 * URL itself is real too — `presignedPutUrl` (`src/lib/s3-presign.ts`) is pure
 * signing with no network call, so its output can be asserted directly.
 *
 * What is *not* exercised here — an actual browser PUT landing in MinIO, and
 * `verify`/`presignRead` round-tripping through a live sidecar — needs a real
 * compose stack. `services/actors/scripts/a8-acceptance.sh` is that proof; see its
 * header for how it lines up with the fakes below.
 */

import { createHash, randomUUID } from "node:crypto";
import type { Ctx, UploadTarget } from "@cellar-assistant/contracts";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  systemCtx,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { files } from "@cellar-assistant/db";
import { eq, sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import { type FilesBinding, ObjectChangedError } from "../lib/files-binding.ts";
import {
  MAX_UPLOAD_BYTES,
  readUrlWindowSettings,
  stableReadWindow,
} from "../lib/s3-presign.ts";
import {
  activate,
  closeTestDb,
  refusalOf,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { FileActor, uploadKeyOf } from "./file-actor.ts";

const daprClient = (): DaprClient =>
  new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" });

/** A minimal JPEG signature — enough for `detectImageMime` to identify it. */
const JPEG_HEAD = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
/** ASCII `"<html>"`. Matches no image signature, so `verify` must refuse it. */
const HTML_HEAD = new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e]);

/** A `FilesBinding` that never reaches a sidecar. Override per test. */
const fakeBinding = (overrides: Partial<FilesBinding> = {}): FilesBinding => ({
  stat: vi.fn(async () => null),
  presignGetPublic: vi.fn(async () => "https://example.test/signed-get"),
  presignGetInternal: vi.fn(async () => "http://minio.example.test/signed-get"),
  readHead: vi.fn(async () => JPEG_HEAD),
  setMediaType: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
  ...overrides,
});

/**
 * `createActor` (`src/lib/testing.ts`) only forwards three constructor
 * arguments, so `FileActor`'s fourth — the binding seam — is supplied here
 * directly instead.
 */
const newFileActor = (
  id: string,
  db: DbOrTx,
  binding: FilesBinding = fakeBinding(),
): FileActor => new FileActor(daprClient(), new ActorId(id), db, binding);

let seq = 0;
/** A fresh, valid uuid per call, so tests never collide on `files.id`. */
const freshId = (): string => {
  seq += 1;
  return `10000000-0000-4000-8000-${seq.toString().padStart(12, "0")}`;
};

/**
 * A wine to hang an `item_image` row on. `wines` needs an onboarding row
 * (`item_onboarding_id` is NOT NULL) and both of its own NOT NULL columns —
 * see `REQUIRED_ITEM_ATTRIBUTES` in `contracts` for why those four exist.
 */
const seedWine = async (db: DbOrTx, createdById: string): Promise<string> => {
  const onboardingId = randomUUID();
  const wineId = randomUUID();
  await db.execute(
    sql`insert into public.wine_style (value) values ('RED') on conflict do nothing`,
  );
  await db.execute(sql`
    insert into public.item_onboardings (id, user_id, item_type, status)
    values (${onboardingId}::uuid, ${createdById}::uuid, 'WINE', 'CONFIRMED')
  `);
  await db.execute(sql`
    insert into public.wines (id, name, created_by_id, vintage, style, item_onboarding_id)
    values (${wineId}::uuid, 'Test Wine', ${createdById}::uuid, '2019-01-01', 'RED', ${onboardingId}::uuid)
  `);
  return wineId;
};

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("FileActor (A8)", () => {
  afterAll(closeTestDb);

  it("is an entity actor per §8.3", () => {
    expect(FileActor.category).toBe("entity");
  });

  it("createUploadTarget mints a row and a real PUT-presigned URL", async () => {
    await withTestDb(async (db) => {
      const uploaderId = await seedUser(db);
      const fileId = freshId();
      const actor = await activate(newFileActor(fileId, db));

      const target = await actor.createUploadTarget(userCtx(uploaderId, "r1"), {
        kind: "item-image",
        contentType: "image/jpeg",
      });

      expect(target.fileId).toBe(fileId);
      expect(target.key).toBe(`item-image/${fileId}`);
      expect(target.bucket).toBe("cellar-files");
      // Real signing (src/lib/s3-presign.ts), not a fake — proves the URL is
      // actually usable, not just present.
      // Signed for the upload key beside `key`, never for `key` itself —
      // the key reads sign is written only by `verify` (W4 security F5).
      expect(new URL(target.uploadUrl).pathname).toBe(
        `/cellar-files/${uploadKeyOf(target.key)}`,
      );
      expect(target.uploadUrl).toContain("X-Amz-Signature=");

      const [row] = await db.select().from(files).where(eq(files.id, fileId));
      expect(row?.verifiedAt).toBeNull();
      expect(row?.uploadedBy).toBe(uploaderId);
      expect(row?.bucket).toBe(target.bucket);
      // The claim is recorded as a claim and nowhere else: `mime_type` is null
      // until `verify` reads it off the bytes, exactly like `size` and `etag`.
      expect(row?.mimeType).toBeNull();
      expect(row?.metadata).toEqual({
        kind: "item-image",
        claimedContentType: "image/jpeg",
      });
    });
  });

  it("createUploadTarget: no claim, no claim recorded", async () => {
    await withTestDb(async (db) => {
      const uploaderId = await seedUser(db);
      const fileId = freshId();
      const actor = await activate(newFileActor(fileId, db));

      await actor.createUploadTarget(userCtx(uploaderId, "r1"), {
        kind: "item-image",
      });

      const [row] = await db.select().from(files).where(eq(files.id, fileId));
      expect(row?.metadata).toEqual({ kind: "item-image" });
      expect(row?.mimeType).toBeNull();
    });
  });

  it("rejects an anonymous upload target", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newFileActor(freshId(), db));
      await expect(
        actor.createUploadTarget(
          { viewerId: null, kind: "user", requestId: "r" },
          { kind: "item-image" },
        ),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  it("rejects a malformed kind", async () => {
    await withTestDb(async (db) => {
      const uploaderId = await seedUser(db);
      const actor = await activate(newFileActor(freshId(), db));
      await expect(
        actor.createUploadTarget(userCtx(uploaderId, "r"), {
          kind: "not a valid kind!",
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  it("refuses to re-create an existing file id", async () => {
    await withTestDb(async (db) => {
      const uploaderId = await seedUser(db);
      const fileId = freshId();
      const actor = await activate(newFileActor(fileId, db));
      await actor.createUploadTarget(userCtx(uploaderId, "r1"), {
        kind: "item-image",
      });
      await expect(
        actor.createUploadTarget(userCtx(uploaderId, "r2"), {
          kind: "item-image",
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  it("verify: marks verified_at and records size/etag once the binding confirms the object", async () => {
    await withTestDb(async (db) => {
      const uploaderId = await seedUser(db);
      const fileId = freshId();
      const stat = vi.fn(async () => ({ size: 1234, etag: "abc123" }));
      const actor = await activate(
        newFileActor(fileId, db, fakeBinding({ stat })),
      );
      await actor.createUploadTarget(userCtx(uploaderId, "r1"), {
        kind: "item-image",
      });

      const verified = await actor.verify(userCtx(uploaderId, "r2"));
      expect(verified.verifiedAt).not.toBeNull();
      expect(verified.size).toBe(1234);
      expect(verified.etag).toBe("abc123");
      expect(stat).toHaveBeenCalledTimes(1);
      expect(stat).toHaveBeenCalledWith(`uploads/item-image/${fileId}`);

      // Idempotent: a second verify does not hit the binding again.
      const verifiedAgain = await actor.verify(userCtx(uploaderId, "r3"));
      expect(verifiedAgain.verifiedAt).toEqual(verified.verifiedAt);
      expect(stat).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * A presigned PUT carries no size bound — SigV4 query presigning signs
   * `host` only, so `Content-Length` is whatever the uploader says (see
   * `presignedPutUrl`). `verify` is therefore the first and only point at
   * which an oversized object can be refused, and refusing without deleting
   * would leave the bytes exactly where the harm is.
   */
  describe("verify refuses an object over the upload limit", () => {
    it("deletes the object and does not mark the row verified", async () => {
      await withTestDb(async (db) => {
        const uploaderId = await seedUser(db);
        const fileId = freshId();
        const oversize = MAX_UPLOAD_BYTES + 1;
        const remove = vi.fn(async () => undefined);
        const setMediaType = vi.fn(async () => undefined);
        const actor = await activate(
          newFileActor(
            fileId,
            db,
            fakeBinding({
              stat: vi.fn(async () => ({ size: oversize, etag: "e" })),
              delete: remove,
              setMediaType,
            }),
          ),
        );
        await actor.createUploadTarget(userCtx(uploaderId, "r1"), {
          kind: "item-image",
        });

        await expect(
          actor.verify(userCtx(uploaderId, "r2")),
        ).rejects.toBeInstanceOf(ValidationError);
        // The bytes are gone...
        expect(remove).toHaveBeenCalledWith(`uploads/item-image/${fileId}`);
        // ...and nothing downstream ran: an unverified row yields no read URL
        // (`src/lib/file-verification.ts`), so the file stays unreachable.
        expect(setMediaType).not.toHaveBeenCalled();
        const [row] = await db.select().from(files).where(eq(files.id, fileId));
        expect(row?.verifiedAt).toBeNull();
      });
    });

    it("says the size and the limit, rather than failing opaquely", async () => {
      await withTestDb(async (db) => {
        const uploaderId = await seedUser(db);
        const fileId = freshId();
        const actor = await activate(
          newFileActor(
            fileId,
            db,
            fakeBinding({
              stat: vi.fn(async () => ({ size: 999_999_999, etag: "e" })),
            }),
          ),
        );
        await actor.createUploadTarget(userCtx(uploaderId, "r1"), {
          kind: "item-image",
        });
        await expect(actor.verify(userCtx(uploaderId, "r2"))).rejects.toThrow(
          new RegExp(`999999999 bytes, over the ${MAX_UPLOAD_BYTES}-byte`),
        );
      });
    });

    it("accepts an object exactly at the limit", async () => {
      await withTestDb(async (db) => {
        const uploaderId = await seedUser(db);
        const fileId = freshId();
        const remove = vi.fn(async () => undefined);
        const actor = await activate(
          newFileActor(
            fileId,
            db,
            fakeBinding({
              stat: vi.fn(async () => ({
                size: MAX_UPLOAD_BYTES,
                etag: "e",
              })),
              delete: remove,
            }),
          ),
        );
        await actor.createUploadTarget(userCtx(uploaderId, "r1"), {
          kind: "item-image",
        });
        const verified = await actor.verify(userCtx(uploaderId, "r2"));
        expect(verified.size).toBe(MAX_UPLOAD_BYTES);
        // Published, and only then is the upload object tidied away; the
        // served object is never removed.
        expect(remove.mock.calls).toEqual([[`uploads/item-image/${fileId}`]]);
      });
    });
  });

  describe("verify decides mime_type from the bytes", () => {
    it("writes the detected type, not the claimed one", async () => {
      await withTestDb(async (db) => {
        const uploaderId = await seedUser(db);
        const fileId = freshId();
        const readHead = vi.fn(async () => JPEG_HEAD);
        const setMediaType = vi.fn(async () => undefined);
        const actor = await activate(
          newFileActor(
            fileId,
            db,
            fakeBinding({
              stat: vi.fn(async () => ({ size: 1, etag: "e" })),
              readHead,
              setMediaType,
            }),
          ),
        );
        // The claim is a lie, and the PUT's own Content-Type could be a
        // different lie: `presignedPutObject` signs `host` only, so neither is
        // constrained. The bytes are JPEG, so the row says JPEG.
        await actor.createUploadTarget(userCtx(uploaderId, "r1"), {
          kind: "item-image",
          contentType: "text/html",
        });

        const verified = await actor.verify(userCtx(uploaderId, "r2"));

        expect(verified.mimeType).toBe("image/jpeg");
        expect(readHead).toHaveBeenCalledWith(
          `uploads/item-image/${fileId}`,
          16,
        );
        // …the row is not the half a browser can see, so the object is told
        // too — otherwise MinIO keeps replaying the uploader's `text/html`.
        // Told as it is published: copied from the upload key to the served
        // one, and only while it is still the object that was sniffed.
        expect(setMediaType).toHaveBeenCalledWith(
          `uploads/item-image/${fileId}`,
          "image/jpeg",
          { into: `item-image/${fileId}`, ifMatch: "e" },
        );
        // …and the claim survives, visibly labelled, for diagnosis.
        expect(verified.metadata).toEqual({
          kind: "item-image",
          claimedContentType: "text/html",
        });
      });
    });

    it("retypes the object even when the bytes pass — the polyglot case", async () => {
      await withTestDb(async (db) => {
        const uploaderId = await seedUser(db);
        const fileId = freshId();
        const setMediaType = vi.fn(async () => undefined);
        const actor = await activate(
          newFileActor(
            fileId,
            db,
            fakeBinding({
              stat: vi.fn(async () => ({ size: 64, etag: "e" })),
              // Real JPEG magic followed by a `<script>`: `detectImageMime`
              // says `image/jpeg` and is right, so sniffing alone lets this
              // through — and the object would go on serving the `text/html`
              // the PUT set, which is what makes it run in a browser.
              readHead: vi.fn(async () => JPEG_HEAD),
              setMediaType,
            }),
          ),
        );
        await actor.createUploadTarget(userCtx(uploaderId, "r1"), {
          kind: "item-image",
          contentType: "text/html",
        });

        await actor.verify(userCtx(uploaderId, "r2"));

        // Accepting the bytes is correct; leaving the header alone is not.
        expect(setMediaType).toHaveBeenCalledWith(
          `uploads/item-image/${fileId}`,
          "image/jpeg",
          { into: `item-image/${fileId}`, ifMatch: "e" },
        );
      });
    });

    it("does not verify when the object's header could not be rewritten", async () => {
      await withTestDb(async (db) => {
        const uploaderId = await seedUser(db);
        const fileId = freshId();
        const actor = await activate(
          newFileActor(
            fileId,
            db,
            fakeBinding({
              stat: vi.fn(async () => ({ size: 1, etag: "e" })),
              setMediaType: vi.fn(async () => {
                throw new Error("copyObject failed");
              }),
            }),
          ),
        );
        await actor.createUploadTarget(userCtx(uploaderId, "r1"), {
          kind: "item-image",
          contentType: "text/html",
        });

        await expect(actor.verify(userCtx(uploaderId, "r2"))).rejects.toThrow(
          /copyObject failed/,
        );

        // Fail closed: a verified row is a readable object, so the row must
        // not move while the object may still be serving the uploader's type.
        const [row] = await db.select().from(files).where(eq(files.id, fileId));
        expect(row?.verifiedAt).toBeNull();
        expect(row?.mimeType).toBeNull();
      });
    });

    it("refuses bytes that are not a known image, and leaves the row unverified", async () => {
      await withTestDb(async (db) => {
        const uploaderId = await seedUser(db);
        const fileId = freshId();
        const actor = await activate(
          newFileActor(
            fileId,
            db,
            fakeBinding({
              stat: vi.fn(async () => ({ size: 1, etag: "e" })),
              readHead: vi.fn(async () => HTML_HEAD),
            }),
          ),
        );
        await actor.createUploadTarget(userCtx(uploaderId, "r1"), {
          kind: "item-image",
          contentType: "image/png",
        });

        await expect(
          actor.verify(userCtx(uploaderId, "r2")),
        ).rejects.toBeInstanceOf(ValidationError);

        // Unverified is what makes the object unreachable: `presignRead`
        // refuses it, and `MaintenanceActor` reaps the row at 24h.
        const [row] = await db.select().from(files).where(eq(files.id, fileId));
        expect(row?.verifiedAt).toBeNull();
        expect(row?.mimeType).toBeNull();
        await expect(
          actor.presignRead(userCtx(uploaderId, "r3")),
        ).rejects.toBeInstanceOf(ConflictError);
      });
    });

    it("does not re-sniff an already-verified file", async () => {
      await withTestDb(async (db) => {
        const uploaderId = await seedUser(db);
        const fileId = freshId();
        const readHead = vi.fn(async () => JPEG_HEAD);
        const actor = await activate(
          newFileActor(
            fileId,
            db,
            fakeBinding({
              stat: vi.fn(async () => ({ size: 1, etag: "e" })),
              readHead,
            }),
          ),
        );
        await actor.createUploadTarget(userCtx(uploaderId, "r1"), {
          kind: "item-image",
        });

        await actor.verify(userCtx(uploaderId, "r2"));
        await actor.verify(userCtx(uploaderId, "r3"));

        expect(readHead).toHaveBeenCalledTimes(1);
      });
    });
  });

  it("verify: refuses when the object was never PUT (never trust the client's 'done')", async () => {
    await withTestDb(async (db) => {
      const uploaderId = await seedUser(db);
      const fileId = freshId();
      const actor = await activate(
        newFileActor(
          fileId,
          db,
          fakeBinding({ stat: vi.fn(async () => null) }),
        ),
      );
      await actor.createUploadTarget(userCtx(uploaderId, "r1"), {
        kind: "item-image",
      });
      await expect(
        actor.verify(userCtx(uploaderId, "r2")),
      ).rejects.toBeInstanceOf(ConflictError);

      const [row] = await db.select().from(files).where(eq(files.id, fileId));
      expect(row?.verifiedAt).toBeNull();
    });
  });

  // `NotFoundError`, not `ForbiddenError` (E5b): nothing public references
  // this row, so a stranger may not learn that the id names one at all.
  it("verify: a stranger cannot verify someone else's upload", async () => {
    await withTestDb(async (db) => {
      const uploaderId = await seedUser(db);
      const strangerId = await seedUser(db);
      const fileId = freshId();
      const actor = await activate(
        newFileActor(
          fileId,
          db,
          fakeBinding({ stat: vi.fn(async () => ({ size: 1, etag: "e" })) }),
        ),
      );
      await actor.createUploadTarget(userCtx(uploaderId, "r1"), {
        kind: "item-image",
      });
      await expect(
        actor.verify(userCtx(strangerId, "r2")),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  it("verify: system can verify on behalf of the uploader (an entity actor calling in, per §8.5)", async () => {
    await withTestDb(async (db) => {
      const uploaderId = await seedUser(db);
      const fileId = freshId();
      const actor = await activate(
        newFileActor(
          fileId,
          db,
          fakeBinding({ stat: vi.fn(async () => ({ size: 1, etag: "e" })) }),
        ),
      );
      await actor.createUploadTarget(userCtx(uploaderId, "r1"), {
        kind: "item-image",
      });
      const verified = await actor.verify(systemCtx("r2"));
      expect(verified.verifiedAt).not.toBeNull();
    });
  });

  it("presignRead: refuses an unverified file, then returns the binding's URL once verified", async () => {
    await withTestDb(async (db) => {
      const uploaderId = await seedUser(db);
      const fileId = freshId();
      const presignGetPublic = vi.fn(
        async () => "https://example.test/signed-get",
      );
      const actor = await activate(
        newFileActor(
          fileId,
          db,
          fakeBinding({
            stat: vi.fn(async () => ({ size: 1, etag: "e" })),
            presignGetPublic,
          }),
        ),
      );
      await actor.createUploadTarget(userCtx(uploaderId, "r1"), {
        kind: "item-image",
      });

      await expect(
        actor.presignRead(userCtx(uploaderId, "r2")),
      ).rejects.toBeInstanceOf(ConflictError);

      await actor.verify(userCtx(uploaderId, "r3"));
      const before = Date.now();
      const read = await actor.presignRead(userCtx(uploaderId, "r4"));
      expect(read.url).toBe("https://example.test/signed-get");
      // Signed for the current stable window (s3-presign.ts, "Stable read
      // URLs"), not with a per-call TTL — and the expiry the caller is told is
      // the window's, which is never less than the minimum validity from now.
      const settings = readUrlWindowSettings();
      const window = stableReadWindow(new Date(before), settings);
      expect(presignGetPublic).toHaveBeenCalledWith(
        `item-image/${fileId}`,
        window,
      );
      expect(read.expiresAt).toBe(window.expiresAt.toISOString());
      expect(Date.parse(read.expiresAt) - Date.now()).toBeGreaterThan(
        settings.minValiditySeconds * 1000 - 5_000,
      );

      // A second read inside the same window hands the signer the same window,
      // so the binding signs the same URL.
      await actor.presignRead(userCtx(uploaderId, "r5"));
      expect(presignGetPublic).toHaveBeenNthCalledWith(
        2,
        `item-image/${fileId}`,
        window,
      );
    });
  });

  /**
   * E3. The two read methods differ in **one** thing — which authority the URL
   * is signed for — and are identical in every other, including the checks. A
   * test rather than a comment because the tempting "simplification" is to
   * have one method take a flag, and the first thing that would rot is the
   * authorisation on the less-used path.
   */
  it("presignReadInternal: the in-network authority, with the same rules", async () => {
    await withTestDb(async (db) => {
      const uploaderId = await seedUser(db);
      const strangerId = await seedUser(db);
      const fileId = freshId();
      const presignGetPublic = vi.fn(
        async () => "https://public.example.test/x",
      );
      const presignGetInternal = vi.fn(async () => "http://minio:9000/x");
      const actor = await activate(
        newFileActor(
          fileId,
          db,
          fakeBinding({
            stat: vi.fn(async () => ({ size: 1, etag: "e" })),
            presignGetPublic,
            presignGetInternal,
          }),
        ),
      );
      await actor.createUploadTarget(userCtx(uploaderId, "r1"), {
        kind: "item-image",
      });

      // Unverified is refused here too — not just on the browser path.
      await expect(
        actor.presignReadInternal(userCtx(uploaderId, "r2")),
      ).rejects.toBeInstanceOf(ConflictError);

      await actor.verify(userCtx(uploaderId, "r3"));

      const internal = await actor.presignReadInternal(
        userCtx(uploaderId, "r4"),
      );
      expect(internal.url).toBe("http://minio:9000/x");
      expect(presignGetInternal).toHaveBeenCalledWith(
        `item-image/${fileId}`,
        expect.any(Number),
      );
      // The browser-facing signer was not consulted for this call, and its own
      // URL is a different string — the point of the split.
      expect(presignGetPublic).not.toHaveBeenCalled();
      expect((await actor.presignRead(userCtx(uploaderId, "r5"))).url).toBe(
        "https://public.example.test/x",
      );

      // And the visibility rule is the same rule: an unrelated account is
      // refused a *private* file on either method — as `NotFoundError`, so
      // neither method is an existence oracle over `files.id` (E5b).
      await expect(
        actor.presignReadInternal(userCtx(strangerId, "r6")),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        actor.presignRead(userCtx(strangerId, "r7")),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  /* ---------------------------------------------------------------- *
   * A7c (2) — reading is wider than writing.
   *
   * A8 gated every method on the uploader, which made an item image
   * undisplayable to anyone but the person who uploaded it — and `item_image`
   * rows are visible when `is_public` (§2.1). The allowance is *derived* from
   * the referencing tables rather than stored on `files`, so nothing needs
   * backfilling at cutover.
   * ---------------------------------------------------------------- */
  describe("presignRead: who may read (A7c)", () => {
    const attachImage = async (
      db: DbOrTx,
      fileId: string,
      userId: string,
      isPublic: boolean,
    ): Promise<void> => {
      const wineId = await seedWine(db, userId);
      await db.execute(
        sql`insert into public.item_image (id, user_id, file_id, wine_id, is_public)
            values (gen_random_uuid(), ${userId}::uuid, ${fileId}::uuid, ${wineId}::uuid, ${isPublic})`,
      );
    };

    const verifiedFile = async (
      db: DbOrTx,
      uploaderId: string,
    ): Promise<{ fileId: string; actor: FileActor }> => {
      const fileId = freshId();
      const actor = await activate(
        newFileActor(
          fileId,
          db,
          fakeBinding({ stat: vi.fn(async () => ({ size: 1, etag: "e" })) }),
        ),
      );
      await actor.createUploadTarget(userCtx(uploaderId, "r1"), {
        kind: "item-image",
      });
      await actor.verify(userCtx(uploaderId, "r2"));
      return { fileId, actor };
    };

    it("lets a stranger read a file a public item image references", async () => {
      await withTestDb(async (db) => {
        const uploaderId = await seedUser(db);
        const strangerId = await seedUser(db);
        const { fileId, actor } = await verifiedFile(db, uploaderId);
        await attachImage(db, fileId, uploaderId, true);

        const read = await actor.presignRead(userCtx(strangerId, "r3"));
        expect(read.url).toBe("https://example.test/signed-get");
        // …and the metadata too, which is what `ItemImage.url` needs.
        expect((await actor.get(userCtx(strangerId, "r4"))).id).toBe(fileId);
      });
    });

    it("still refuses a stranger when the image is private", async () => {
      await withTestDb(async (db) => {
        const uploaderId = await seedUser(db);
        const strangerId = await seedUser(db);
        const { fileId, actor } = await verifiedFile(db, uploaderId);
        await attachImage(db, fileId, uploaderId, false);

        await expect(
          actor.presignRead(userCtx(strangerId, "r3")),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    it("still refuses a stranger when nothing references the file", async () => {
      await withTestDb(async (db) => {
        const uploaderId = await seedUser(db);
        const strangerId = await seedUser(db);
        const { actor } = await verifiedFile(db, uploaderId);

        await expect(
          actor.presignRead(userCtx(strangerId, "r3")),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    /* ---------------------------------------------------------------- *
     * E5b — the refusal must not say which of the two things went wrong.
     *
     * `verify`/`delete`/`presignRead` used to answer `ForbiddenError("file …
     * is not yours")` for a row that exists and is not yours, and
     * `NotFoundError` for an id that names no row at all. Two answers is an
     * existence oracle over `files.id`. Where a *public* referent already
     * discloses the row, `ForbiddenError` is still the right answer and the
     * test below this one pins it.
     * ---------------------------------------------------------------- */
    it("answers a stranger identically whether or not the row exists (E5b)", async () => {
      await withTestDb(async (db) => {
        const uploaderId = await seedUser(db);
        const strangerId = await seedUser(db);
        const { fileId, actor } = await verifiedFile(db, uploaderId);
        await attachImage(db, fileId, uploaderId, false);

        const absent = await activate(
          newFileActor(freshId(), db, fakeBinding()),
        );

        const shapeOf = async (
          call: () => Promise<unknown>,
        ): Promise<string> => {
          try {
            await call();
            return "resolved";
          } catch (error) {
            return `${(error as Error).name}: ${(error as Error).message.replace(/[0-9a-f-]{36}/g, "<id>")}`;
          }
        };

        for (const [name, real, missing] of [
          [
            "verify",
            () => actor.verify(userCtx(strangerId, "r1")),
            () => absent.verify(userCtx(strangerId, "r1")),
          ],
          [
            "presignRead",
            () => actor.presignRead(userCtx(strangerId, "r2")),
            () => absent.presignRead(userCtx(strangerId, "r2")),
          ],
          [
            "presignReadInternal",
            () => actor.presignReadInternal(userCtx(strangerId, "r3")),
            () => absent.presignReadInternal(userCtx(strangerId, "r3")),
          ],
          [
            "get",
            () => actor.get(userCtx(strangerId, "r4")),
            () => absent.get(userCtx(strangerId, "r4")),
          ],
          [
            "delete",
            () => actor.delete(userCtx(strangerId, "r5")),
            () => absent.delete(userCtx(strangerId, "r5")),
          ],
        ] as const) {
          expect(
            [name, await shapeOf(real)],
            `${name} distinguishes a hidden row from an absent one`,
          ).toEqual([name, await shapeOf(missing)]);
        }

        // …and `delete` really did not delete anything on the way past.
        const [row] = await db.select().from(files).where(eq(files.id, fileId));
        expect(row).not.toBeUndefined();
      });
    });

    it("keeps verify and delete uploader-only", async () => {
      await withTestDb(async (db) => {
        const uploaderId = await seedUser(db);
        const strangerId = await seedUser(db);
        const { fileId, actor } = await verifiedFile(db, uploaderId);
        await attachImage(db, fileId, uploaderId, true);

        await expect(
          actor.delete(userCtx(strangerId, "r3")),
        ).rejects.toBeInstanceOf(ForbiddenError);
      });
    });

    /**
     * Review W4 #4. Every foreign key into `files` is `RESTRICT`/`NO ACTION`,
     * so the uploader deleting a file something still uses used to get the
     * raw database error back as an unexpected one. It is a conflict with a
     * reason, and nothing — row or object — may be gone afterwards. Both
     * kinds of key, because they fail with different codes: `item_image` is
     * `RESTRICT` (23001), `menu_scans` is `NO ACTION` (23503).
     */
    const ATTACH: readonly [
      string,
      (db: DbOrTx, fileId: string, userId: string) => Promise<void>,
    ][] = [
      [
        "an item image",
        (db, fileId, userId) => attachImage(db, fileId, userId, false),
      ],
      [
        "a menu scan",
        async (db, fileId, userId) => {
          await db.execute(
            sql`insert into public.menu_scans (id, user_id, original_image_id)
                values (gen_random_uuid(), ${userId}::uuid, ${fileId}::uuid)`,
          );
        },
      ],
    ];

    it.each(
      ATTACH,
    )("refuses to delete a file attached to %s as a Conflict, and deletes nothing", async (holder, attach) => {
      await withTestDb(async (db) => {
        const uploaderId = await seedUser(db);
        const fileId = freshId();
        const del = vi.fn(async () => undefined);
        const actor = await activate(
          newFileActor(
            fileId,
            db,
            fakeBinding({
              stat: vi.fn(async () => ({ size: 1, etag: "e" })),
              delete: del,
            }),
          ),
        );
        await actor.createUploadTarget(userCtx(uploaderId, "r1"), {
          kind: "item-image",
        });
        await actor.verify(userCtx(uploaderId, "r2"));
        await attach(db, fileId, uploaderId);
        del.mockClear();

        const refused = actor.delete(userCtx(uploaderId, "r3"));
        await expect(refused).rejects.toBeInstanceOf(ConflictError);
        await expect(refused).rejects.toThrow(
          `file ${fileId} is still attached to ${holder}`,
        );
        expect(del).not.toHaveBeenCalled();
        const [row] = await db.select().from(files).where(eq(files.id, fileId));
        expect(row?.verifiedAt).not.toBeNull();
        // The actor still holds the row, so a read after the refusal works.
        expect((await actor.get(userCtx(uploaderId, "r4"))).id).toBe(fileId);
      });
    });
  });

  it("delete: removes the row and best-effort deletes the object via the binding", async () => {
    await withTestDb(async (db) => {
      const uploaderId = await seedUser(db);
      const fileId = freshId();
      const del = vi.fn(async () => undefined);
      const actor = await activate(
        newFileActor(fileId, db, fakeBinding({ delete: del })),
      );
      await actor.createUploadTarget(userCtx(uploaderId, "r1"), {
        kind: "item-image",
      });

      await actor.delete(userCtx(uploaderId, "r2"));
      // Both keys: an unverified row's bytes are at the upload key, which is
      // how `MaintenanceActor`'s reap (this method, via the outbox) removes
      // them rather than leaking them.
      expect(del.mock.calls).toEqual([
        [`item-image/${fileId}`],
        [`uploads/item-image/${fileId}`],
      ]);

      const [row] = await db.select().from(files).where(eq(files.id, fileId));
      expect(row).toBeUndefined();
      await expect(actor.get(userCtx(uploaderId, "r3"))).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  // Nothing public references this row, so the stranger is answered exactly as
  // they would be for an id that names nothing: a silent no-op (E5b, and the
  // "deleting an already-deleted row succeeds" rule it has to agree with). The
  // row surviving is the assertion that matters.
  it("delete: a stranger cannot delete someone else's file", async () => {
    await withTestDb(async (db) => {
      const uploaderId = await seedUser(db);
      const strangerId = await seedUser(db);
      const fileId = freshId();
      const del = vi.fn(async () => undefined);
      const actor = await activate(
        newFileActor(fileId, db, fakeBinding({ delete: del })),
      );
      await actor.createUploadTarget(userCtx(uploaderId, "r1"), {
        kind: "item-image",
      });

      await expect(
        actor.delete(userCtx(strangerId, "r2")),
      ).resolves.toBeUndefined();
      expect(del).not.toHaveBeenCalled();
      const [row] = await db.select().from(files).where(eq(files.id, fileId));
      expect(row).not.toBeUndefined();
    });
  });

  it("delete: a row survives when the binding's object delete fails (best-effort)", async () => {
    await withTestDb(async (db) => {
      const uploaderId = await seedUser(db);
      const fileId = freshId();
      const del = vi.fn(async () => {
        throw new Error("simulated storage outage");
      });
      const actor = await activate(
        newFileActor(fileId, db, fakeBinding({ delete: del })),
      );
      await actor.createUploadTarget(userCtx(uploaderId, "r1"), {
        kind: "item-image",
      });

      await actor.delete(userCtx(uploaderId, "r2"));
      const [row] = await db.select().from(files).where(eq(files.id, fileId));
      expect(row).toBeUndefined();
    });
  });

  it("activating an id with no row reports NotFound", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newFileActor(freshId(), db));
      await expect(actor.get(systemCtx("r"))).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  it("rolls every test back: nothing survives withTestDb", async () => {
    const leaked = await withTestDb(async (db) => {
      const uploaderId = await seedUser(db);
      const fileId = freshId();
      const actor = await activate(newFileActor(fileId, db));
      await actor.createUploadTarget(userCtx(uploaderId, "r1"), {
        kind: "item-image",
      });
      return fileId;
    });
    const survivors = await withTestDb((db) =>
      db.select({ id: files.id }).from(files).where(eq(files.id, leaked)),
    );
    expect(survivors).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Concealment: a stranger's file and no file answer alike                     */
/* -------------------------------------------------------------------------- */

/**
 * A file nothing public points at is the uploader's alone, so every method a
 * stranger can reach must answer the same `{ code, message }` for it as for an
 * id that names nothing. `delete` answers "done, nothing to do" to both —
 * its doc says why it returns rather than throws — and is checked as such.
 */
describe.skipIf(skip)("FileActor concealment", () => {
  afterAll(closeTestDb);

  const CALLS: readonly [
    string,
    (actor: FileActor, ctx: Ctx) => Promise<unknown>,
  ][] = [
    ["verify", (actor, ctx) => actor.verify(ctx)],
    ["presignRead", (actor, ctx) => actor.presignRead(ctx)],
    ["presignReadInternal", (actor, ctx) => actor.presignReadInternal(ctx)],
    ["get", (actor, ctx) => actor.get(ctx)],
  ];

  const seedPrivateFile = async (
    db: DbOrTx,
    id: string = freshId(),
  ): Promise<string> => {
    const uploader = await seedUser(db);
    await (await activate(newFileActor(id, db))).createUploadTarget(
      userCtx(uploader, "r-uploader"),
      { kind: "item-image", contentType: "image/jpeg" },
    );
    return id;
  };

  it.each(CALLS)("%s", async (_method, call) => {
    await withTestDb(async (db) => {
      const stranger = userCtx(await seedUser(db), "r-stranger");
      const real = await seedPrivateFile(db);
      const absent = freshId();

      const hidden = await refusalOf(
        async () => call(await activate(newFileActor(real, db)), stranger),
        real,
      );
      const missing = await refusalOf(
        async () => call(await activate(newFileActor(absent, db)), stranger),
        absent,
      );
      expect(hidden).toEqual(missing);
      expect(hidden.code).toBe("NOT_FOUND");
    });
  });

  it("delete", async () => {
    await withTestDb(async (db) => {
      const stranger = userCtx(await seedUser(db), "r-stranger");
      const real = await seedPrivateFile(db);
      const absent = freshId();

      await expect(
        (await activate(newFileActor(real, db))).delete(stranger),
      ).resolves.toBeUndefined();
      await expect(
        (await activate(newFileActor(absent, db))).delete(stranger),
      ).resolves.toBeUndefined();
      // …and nothing was deleted on the concealed branch.
      expect(
        await db.select({ id: files.id }).from(files).where(eq(files.id, real)),
      ).toHaveLength(1);
    });
  });

  /**
   * W4 security F6. `createUploadTarget` on somebody else's file id used to
   * answer `Conflict("file … already has a row")` while `get` and `verify`
   * answered `NotFound` for the same id: an existence oracle over `files.id`.
   * A caller who may not see the row now gets the very refusal they would
   * get from `get` — same code, same bytes — and nothing is written.
   */
  it("createUploadTarget on a hidden file answers exactly as get does", async () => {
    await withTestDb(async (db) => {
      const stranger = userCtx(await seedUser(db), "r-stranger");
      const real = await seedPrivateFile(db);
      const actor = await activate(newFileActor(real, db));

      const create = await refusalOf(
        () => actor.createUploadTarget(stranger, { kind: "item-image" }),
        real,
      );
      const get = await refusalOf(() => actor.get(stranger), real);
      const verify = await refusalOf(() => actor.verify(stranger), real);
      expect(create).toEqual(get);
      expect(create).toEqual(verify);
      expect(create.code).toBe("NOT_FOUND");
      const [row] = await db.select().from(files).where(eq(files.id, real));
      expect(row?.metadata).toEqual({
        kind: "item-image",
        claimedContentType: "image/jpeg",
      });
    });
  });

  it("createUploadTarget still says Conflict to the uploader, who can see the row", async () => {
    await withTestDb(async (db) => {
      const uploader = await seedUser(db);
      const id = freshId();
      const actor = await activate(newFileActor(id, db));
      await actor.createUploadTarget(userCtx(uploader, "r1"), {
        kind: "item-image",
      });
      await expect(
        actor.createUploadTarget(userCtx(uploader, "r2"), {
          kind: "item-image",
        }),
      ).rejects.toThrow(new ConflictError(`file ${id} already has a row`));
    });
  });

  /**
   * The uppercase spelling of the same id. `services/api` lowercases an
   * actor id before the hop; an actor addressed by hand with the uppercase
   * one is refused as absent before any method body runs
   * (`EntityActorBase.onActorMethodPre`), so it cannot reach the insert —
   * where Postgres would have read it as the existing row's id and failed
   * on the primary key instead.
   */
  it("an uppercase copy of a hidden file's id is refused as absent too", async () => {
    await withTestDb(async (db) => {
      const stranger = userCtx(await seedUser(db), "r-stranger");
      // Letters in it: `freshId()` is all digits, and an id whose uppercase
      // spelling is itself would make this test pass without testing anything.
      const real = await seedPrivateFile(db, `abcdef00-${freshId().slice(9)}`);
      const upper = real.toUpperCase();
      expect(upper).not.toBe(real);
      const actor = await activate(newFileActor(upper, db));

      const refused = await refusalOf(async () => {
        await actor.onActorMethodPre();
        return actor.createUploadTarget(stranger, { kind: "item-image" });
      }, upper);
      const get = await refusalOf(
        async () => (await activate(newFileActor(real, db))).get(stranger),
        real,
      );
      expect(refused).toEqual(get);
      expect(
        await db.select({ id: files.id }).from(files).where(eq(files.id, real)),
      ).toHaveLength(1);
    });
  });
});

/* -------------------------------------------------------------------------- */
/* The upload key is not the served key (W4 security F5)                       */
/* -------------------------------------------------------------------------- */

/**
 * `services/actors/scripts/a8-acceptance.sh`'s shape — PUT, verify, presign a
 * read, GET — in unit form, against an in-memory object store that behaves
 * the way MinIO does for the four things that matter here: a presigned PUT
 * writes whatever bytes and `Content-Type` the client sends to the key in its
 * URL path and can be repeated for as long as the URL lives; the ETag is the
 * content's MD5; a copy stamps the new headers and honours `ifMatch`; a GET
 * serves the key in its URL path with the stored headers.
 * (`s3-presign.live.test.ts` checks the copy half against a real MinIO.)
 *
 * The attack is the second half: after `verify`, the uploader PUTs HTML with
 * `Content-Type: text/html` to the same, still-valid upload URL. The object
 * every read URL points at must not change.
 */
describe.skipIf(skip)(
  "FileActor: a PUT after verify cannot change what is served",
  () => {
    afterAll(closeTestDb);

    type StoredObject = {
      readonly bytes: Uint8Array;
      readonly contentType: string;
      readonly disposition: string | null;
      readonly etag: string;
    };

    const BUCKET_PATH = "/cellar-files/";
    const md5 = (bytes: Uint8Array): string =>
      createHash("md5").update(bytes).digest("hex");
    const keyOfUrl = (url: string): string => {
      const path = decodeURIComponent(new URL(url).pathname);
      if (!path.startsWith(BUCKET_PATH)) throw new Error(`not ours: ${url}`);
      return path.slice(BUCKET_PATH.length);
    };

    const objectStore = () => {
      const objects = new Map<string, StoredObject>();
      const put = (url: string, bytes: Uint8Array, contentType: string) => {
        objects.set(keyOfUrl(url), {
          bytes,
          contentType,
          disposition: null,
          etag: md5(bytes),
        });
      };
      const get = (url: string): StoredObject | undefined =>
        objects.get(keyOfUrl(url));
      const signGet = async (key: string) =>
        `https://files.example.test${BUCKET_PATH}${encodeURIComponent(key)}?sig=1`;
      const binding: FilesBinding = {
        stat: async (key) => {
          const found = objects.get(key);
          return found === undefined
            ? null
            : { size: found.bytes.byteLength, etag: found.etag };
        },
        presignGetPublic: signGet,
        presignGetInternal: signGet,
        readHead: async (key, count) =>
          (objects.get(key)?.bytes ?? new Uint8Array()).slice(0, count),
        setMediaType: async (key, contentType, options = {}) => {
          const source = objects.get(key);
          if (source === undefined) throw new Error(`no object at ${key}`);
          if (
            options.ifMatch !== undefined &&
            source.etag !== options.ifMatch
          ) {
            throw new ObjectChangedError(key);
          }
          objects.set(options.into ?? key, {
            ...source,
            contentType,
            disposition: "attachment",
          });
        },
        delete: async (key) => {
          objects.delete(key);
        },
      };
      return { objects, put, get, binding };
    };

    const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]);
    const HTML = new TextEncoder().encode("<html><script>alert(1)</script>");

    it("PUT → verify → presignRead → GET serves the verified image", async () => {
      await withTestDb(async (db) => {
        const uploader = userCtx(await seedUser(db), "r");
        const store = objectStore();
        const actor = await activate(
          newFileActor(freshId(), db, store.binding),
        );

        const target = await actor.createUploadTarget(uploader, {
          kind: "item-image",
          contentType: "image/jpeg",
        });
        store.put(target.uploadUrl, JPEG, "text/html");
        const verified = await actor.verify(uploader);
        const served = store.get((await actor.presignRead(uploader)).url);

        expect(verified.mimeType).toBe("image/jpeg");
        expect(verified.etag).toBe(md5(JPEG));
        expect(served?.bytes).toEqual(JPEG);
        expect(served?.contentType).toBe("image/jpeg");
        expect(served?.disposition).toBe("attachment");
        // The upload object is tidied away once the row says verified.
        expect([...store.objects.keys()]).toEqual([target.key]);
      });
    });

    it("a second PUT to the still-valid upload URL changes nothing a read serves", async () => {
      await withTestDb(async (db) => {
        const uploader = userCtx(await seedUser(db), "r");
        const store = objectStore();
        const actor = await activate(
          newFileActor(freshId(), db, store.binding),
        );

        const target = await actor.createUploadTarget(uploader, {
          kind: "item-image",
        });
        store.put(target.uploadUrl, JPEG, "image/jpeg");
        await actor.verify(uploader);

        // The attack: same URL, inside its fifteen minutes, HTML this time.
        store.put(target.uploadUrl, HTML, "text/html");
        // `verify` is idempotent and does not look again…
        expect((await actor.verify(uploader)).etag).toBe(md5(JPEG));

        // …and every read — the browser's and the in-network one — still
        // serves the bytes and headers that were verified.
        for (const read of [
          await actor.presignRead(uploader),
          await actor.presignReadInternal(uploader),
        ]) {
          const served = store.get(read.url);
          expect(served?.bytes).toEqual(JPEG);
          expect(served?.contentType).toBe("image/jpeg");
          expect(served?.disposition).toBe("attachment");
        }
        // The late PUT is garbage beside it, never under a read URL, and goes
        // when the file does.
        expect(store.objects.get(uploadKeyOf(target.key))?.bytes).toEqual(HTML);
        await actor.delete(uploader);
        expect(store.objects.size).toBe(0);
      });
    });

    it("refuses to publish an upload replaced between the check and the copy", async () => {
      await withTestDb(async (db) => {
        const uploader = userCtx(await seedUser(db), "r");
        const store = objectStore();
        let target: UploadTarget | undefined;
        // A PUT that lands after `verify` has sized and sniffed the JPEG, and
        // before it copies: exactly the window `ifMatch` exists for.
        const racing: FilesBinding = {
          ...store.binding,
          readHead: async (key, count) => {
            const head = await store.binding.readHead(key, count);
            if (target !== undefined)
              store.put(target.uploadUrl, HTML, "text/html");
            return head;
          },
        };
        const actor = await activate(newFileActor(freshId(), db, racing));
        target = await actor.createUploadTarget(uploader, {
          kind: "item-image",
        });
        store.put(target.uploadUrl, JPEG, "image/jpeg");

        await expect(actor.verify(uploader)).rejects.toThrow(
          /changed while it was being verified/,
        );
        // Nothing was published and the row is still provisional, so nothing
        // can be read.
        expect(store.objects.has(target.key)).toBe(false);
        await expect(actor.presignRead(uploader)).rejects.toBeInstanceOf(
          ConflictError,
        );
      });
    });
  },
);
