/**
 * `FileActor` — A8 (migration plan §2.1, §3; target-stack §4).
 *
 * Owns `files`, the table replacing `storage.files`. Implements the upload
 * protocol:
 *
 *   createUploadTarget → client PUTs to the returned URL → verify() confirms
 *   the object exists (via the `files` binding) before the row is trusted →
 *   presignRead hands back a GET URL once verified.
 *
 * "Never trust a client's 'done'" (target-stack §4) is `verify()`'s whole job:
 * `verifiedAt` only ever moves from `null` once the binding itself reports the
 * object present.
 *
 * ## `mime_type` is decided from the bytes, not from the upload request
 *
 * It used to be `input.contentType ?? null` — a string the client handed to
 * `createUploadTarget`, stored with no allow-list anywhere in the path, and
 * then exposed as `File.mimeType` as if it were a fact. It was not: the same
 * client PUTs straight to MinIO, `presignedPutObject` signs **`host` only**
 * (`X-Amz-SignedHeaders=host` — measured), so the `Content-Type` on the PUT is
 * unsigned and free too. Two independently client-chosen values, neither one
 * evidence of anything.
 *
 * So `mime_type` now follows exactly the discipline `size` and `etag` already
 * follow: **null until verified**, then written from what the store actually
 * holds. `verify()` reads a sixteen-byte window off the object and hands it to
 * `detectImageMime` (`src/lib/ai/image-mime.ts`) — the one sniffer in this
 * repo, reused rather than reimplemented, because two sniffers that disagree
 * is the bug this replaces. The claim is kept, under `metadata.claimedContentType`,
 * where the name says what it is worth.
 *
 * Bytes that match no known image are **refused** rather than labelled with a
 * guess (see `#detectMime`), which is the same call `requireImageMime` makes on
 * the AI path and the same call `AI_PROVIDER` makes by erroring when unset.
 * Refusing leaves `verifiedAt` null, so the object is unreachable —
 * `presignRead` will not sign it — and `MaintenanceActor` reaps the row, and
 * with it the object, at 24h.
 *
 * ## Sniffing the bytes is half of it; the object has to be told too
 *
 * A row saying `image/jpeg` does not change what a browser sees. Files reach
 * browsers by presigned GET straight from MinIO, and MinIO answers with the
 * `Content-Type` **stored on the object** — which is the one the uploader's
 * own PUT set, because `presignedPutObject` signs `host` only and leaves that
 * header free. Measured against the compose stack on 2026-09-18: PUT
 * `Content-Type: text/html` is accepted, the GET replays `text/html` with no
 * `Content-Disposition`, and an HTML document uploaded that way executes when
 * the URL is opened. `File.mimeType` being honest does not touch any of that.
 *
 * Sniffing alone does not even close it: a JPEG/HTML polyglot — real `FF D8
 * FF` magic, `<script>` after it — passes `detectImageMime`, so `verify`
 * accepts it and `presignRead` signs it, and it still serves as `text/html`.
 * So `verify` also rewrites the stored object's own header to the detected
 * type (`setMediaType` → `setObjectMediaType` in `src/lib/s3-presign.ts`),
 * plus `Content-Disposition: attachment`. That is the half that a browser can
 * actually observe.
 *
 * Severity, so nobody re-inflates it later: files are served from the **files
 * origin** (`files.example.com`), not the app origin, and the app's session
 * cookies are host-only, so this was never app-session XSS. The app itself
 * only ever renders these URLs in `<img src>`, where HTML cannot run. It was
 * attacker-controlled content on a brand-adjacent subdomain behind a 30-minute
 * signed URL the uploader has to distribute themselves — real, worth closing,
 * and contained.
 *
 * ## The upload key is not the served key (W4 security F5)
 *
 * A presigned PUT cannot be revoked: it stays valid for its whole
 * `UPLOAD_TTL_SECONDS`, and `verify` runs once. When the PUT and the reads
 * shared one key, the uploader could verify a real JPEG and then, inside the
 * same fifteen minutes, PUT anything over it — new bytes, and a new
 * `Content-Type`/`Content-Disposition` replacing the ones `verify` had just
 * written — and every `presignRead` after that signed the replacement.
 *
 * So the PUT is signed for {@link uploadKeyOf}`(key)` — `uploads/<kind>/<id>` —
 * and nothing ever signs a read of that key. `verify` sizes and sniffs the
 * object there and then **copies** it to `key` (the row's key, the one reads
 * sign) with the detected type and `attachment` stamped on, on condition that
 * the upload still carries the ETag that was sized and sniffed
 * (`ifMatch` — a racing PUT between the check and the copy is refused rather
 * than published). Then it deletes the upload object. A PUT made afterwards
 * with the still-live URL lands on `uploads/…` again, where no read will ever
 * look; `key` changes only by `verify`, and `verify` does not run twice.
 *
 * Considered and not taken: re-checking the object's ETag at `presignRead`
 * time. It costs a store round trip on every image render, and it misses
 * both halves of the attack — a re-PUT of the *same* bytes with a new
 * `Content-Type` keeps the ETag (it is the content's MD5), and a check only
 * while the upload window is open misses a replacement read after it closes.
 * A shorter PUT TTL narrows the window without closing it.
 *
 * What is left: that late PUT's object at `uploads/…` is garbage nothing
 * reads, removed when the file is deleted (`delete` removes both keys) — the
 * same "writable, never readable" residual an unverified upload already has
 * (`presignedPutUrl`'s docblock). Rows and objects from before this change
 * are unaffected: a verified row's object is at `key`, where reads have
 * always looked, and `verify` short-circuits on it. The one casualty is an
 * upload target minted before the change and not yet verified: its bytes are
 * at `key`, so its `verify` answers "no object yet", and it is reaped at 24h
 * with every other unverified row — `delete` removes both keys.
 *
 * ## Why `createUploadTarget` doesn't ask the binding for the PUT URL
 *
 * See `src/lib/s3-presign.ts` — the binding can only presign GET. This actor
 * signs the upload URL itself and uses the binding for everything it *can* do
 * (`verify`, the read URLs, `delete`) via `src/lib/files-binding.ts`.
 *
 * ## Two read methods, because a URL is only valid where it is dialled
 *
 * E3. SigV4 covers the `Host` header, so a presigned URL can only be used from
 * a client that dials the authority it was signed for — and in development the
 * authority a *browser* can reach (`localhost:<published MinIO port>`) and the
 * one a *container* can reach (`minio:9000`) are different strings, with no
 * single name working from both sides on Docker Desktop for macOS. That is
 * measured exhaustively in `src/lib/s3-presign.ts`'s E3 section.
 *
 * So there are two:
 *
 *   - {@link presignRead} — for a browser. Its URL crosses `services/api` into
 *     a page (`services/api/src/schema/file.ts`).
 *   - {@link presignReadInternal} — for a process on this network. Its only
 *     caller is `src/lib/ai/images.ts`, which downloads the image bytes to
 *     hand a vision model.
 *
 * Same row, same visibility check, same TTL; only the authority differs. Two
 * names rather than one method with a flag, so that a caller standing in the
 * wrong place is visible in a diff — and `describeAuthorityMismatch` in
 * `src/lib/s3-presign.ts` turns the mistake into a message that names both
 * positions instead of an opaque connect error. In production the two
 * authorities are one hostname and the methods are interchangeable.
 *
 * ## The "provisional id" pattern
 *
 * Like every other entity actor's `create` (§2.1), the caller mints `fileId`
 * and addresses `FileActor(fileId)` before any row exists; `createUploadTarget`
 * is the method that inserts it. The row is "provisional" until `verify()`
 * succeeds — that's what `verifiedAt IS NULL` means, and what
 * `MaintenanceActor` reaps after 24h (`maintenance-actor.ts`).
 */
import {
  type ActorCategory,
  ConflictError,
  type CreateUploadTargetInput,
  type Ctx,
  FileActorDescriptor,
  type FileActorInterface,
  type FileDto,
  ForbiddenError,
  type ReadTarget,
  type UploadTarget,
  ValidationError,
} from "@cellar-assistant/contracts";
import { files, itemImage, placeGooglePhotos } from "@cellar-assistant/db";
import { and, eq } from "@cellar-assistant/db/orm";
import { isOwner } from "@cellar-assistant/policy";
import type { ActorId, DaprClient } from "@dapr/dapr";
import { EntityActorBase } from "../lib/actor-base.ts";
import { detectImageMime, type ImageMime } from "../lib/ai/image-mime.ts";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import {
  daprFilesBinding,
  type FilesBinding,
  ObjectChangedError,
} from "../lib/files-binding.ts";
import { requireSignedIn } from "../lib/guards.ts";
import {
  filesS3Config,
  MAX_UPLOAD_BYTES,
  presignedPutUrl,
} from "../lib/s3-presign.ts";

export type FileRow = typeof files.$inferSelect;
type FileAggregate = { readonly file: FileRow };

const iso = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

/**
 * The wire shape (`contracts/files.ts`), not the row shape: `services/api` has no
 * Drizzle, so `timestamptz` crosses as an ISO-8601 string.
 */
export const fileRowToDto = (row: FileRow): FileDto => ({
  id: row.id,
  bucket: row.bucket,
  key: row.key,
  size: row.size,
  mimeType: row.mimeType,
  etag: row.etag,
  uploadedBy: row.uploadedBy,
  verifiedAt: iso(row.verifiedAt),
  metadata: (row.metadata ?? {}) as Record<string, unknown>,
  createdAt: iso(row.createdAt) ?? new Date(0).toISOString(),
  updatedAt: iso(row.updatedAt) ?? new Date(0).toISOString(),
});

/** A2's own presign demonstration used 15m; kept the same here for the PUT side. */
const UPLOAD_TTL_SECONDS = 15 * 60;
/** Matches Nhost's own `storage.buckets.download_expiration` default (30m). */
const READ_TTL_SECONDS = 30 * 60;

const KIND_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Where the presigned PUT for the object at `key` lands — see the module doc,
 * "The upload key is not the served key". Derived, not stored, so it needs no
 * column and no backfill: a row from before this existed simply has nothing
 * there.
 */
export const uploadKeyOf = (key: string): string => `uploads/${key}`;

/**
 * The foreign keys into `files` that refuse a delete, named for the message.
 * `delete` reads the constraint off the error rather than pre-checking: a
 * `select` first would only race the delete.
 */
const ATTACHMENTS: Readonly<Record<string, string>> = {
  item_image_file_id_files_id_fkey: "an item image",
  item_onboardings_front_label_image_id_files_id_fkey:
    "an item onboarding's front label",
  item_onboardings_back_label_image_id_files_id_fkey:
    "an item onboarding's back label",
  menu_scans_original_image_id_files_id_fkey: "a menu scan",
  menu_scans_processed_image_id_files_id_fkey: "a menu scan",
  place_google_photos_storage_file_id_files_id_fkey: "a place photo",
};

/**
 * What Postgres raises when a delete is refused by a referencing row — and it
 * is two codes, not one: `ON DELETE RESTRICT` (`item_image`,
 * `item_onboardings`) raises **23001** `restrict_violation`, while `NO ACTION`
 * (`menu_scans`) raises 23503 `foreign_key_violation`. Measured against the
 * test database; matching 23503 alone missed the commonest case.
 */
const STILL_REFERENCED = new Set<unknown>(["23001", "23503"]);

/** The Postgres error under Drizzle's wrapper, if `error` is one. */
const pgErrorOf = (
  error: unknown,
): { code?: unknown; constraint?: unknown } | undefined => {
  if (!(error instanceof Error)) return undefined;
  const cause = (error as { cause?: unknown }).cause;
  return (cause instanceof Error ? cause : error) as {
    code?: unknown;
    constraint?: unknown;
  };
};

/**
 * The window `#detectMime` reads off an uploaded object.
 *
 * `detectImageMime`'s longest read is an ISO base-media brand at bytes 8-11, so
 * twelve would do; sixteen is the same single ranged request and leaves room
 * for a signature added there later without this constant having to be found.
 */
const SNIFF_BYTES = 16;

export class FileActor
  extends EntityActorBase<FileAggregate>
  implements FileActorInterface
{
  static readonly category: ActorCategory = FileActorDescriptor.category;

  readonly #binding: FilesBinding;

  /**
   * `filesBinding` is the fourth, defaulted parameter `ActorBase` leaves room
   * for: production gets the real binding; `file-actor.test.ts` passes a fake,
   * because the no-Dapr harness (`src/lib/testing.ts`) has no sidecar for a
   * real one to call.
   */
  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    filesBinding: FilesBinding = daprFilesBinding(daprClient),
  ) {
    super(daprClient, id, db);
    this.#binding = filesBinding;
  }

  protected async loadAggregate(id: string): Promise<FileAggregate | null> {
    const [row] = await this.db.select().from(files).where(eq(files.id, id));
    return row === undefined ? null : { file: row };
  }

  /**
   * Step 1. Refuses to run twice on the same id (§8.4 idempotency is a
   * conscious choice here, not a default: a second `createUploadTarget` would
   * silently hand out a second, different upload URL for the same `fileId`,
   * which is worse than telling the caller to look at what is already there).
   *
   * "Already has a row" is said only to a caller who may see that row (W4
   * security F6). It used to be said to anyone, while `get` and `verify`
   * answered the same id `NotFound` — so a client-chosen `fileId` was an
   * existence oracle over other users' files. A caller who may not see the
   * row now gets exactly the `NotFound` those two give, which is the rule
   * `MenuScanActor.create` and `ItemOnboardingActor.start` already follow
   * for their own client-minted ids.
   */
  async createUploadTarget(
    ctx: Ctx,
    input: CreateUploadTargetInput,
  ): Promise<UploadTarget> {
    requireSignedIn(ctx, "request an upload target");
    const existing = this.aggregate;
    if (existing !== null) {
      await this.requireVisible(ctx, existing);
      throw new ConflictError(`file ${this.key} already has a row`);
    }
    const kind = input.kind.toLowerCase();
    if (!KIND_PATTERN.test(kind)) {
      throw new ValidationError(
        `kind "${input.kind}" must match ${KIND_PATTERN.source} (e.g. "item-image")`,
      );
    }

    const config = filesS3Config();
    // `key` is where reads will look; the PUT is signed for the upload key
    // beside it, never for `key` itself (module doc).
    const key = `${kind}/${this.key}`;
    const uploadUrl = await presignedPutUrl(
      config,
      uploadKeyOf(key),
      UPLOAD_TTL_SECONDS,
    );

    // The client's `contentType` is a claim about bytes that do not exist yet,
    // so it is recorded as one and `mime_type` is left for `verify` to fill
    // from the object itself — see the module doc. Keeping the claim costs
    // nothing (`metadata` is already JSONB carrying `kind`) and it is worth
    // having when an upload is refused: the difference between what was
    // promised and what arrived is the whole diagnosis.
    const claimedContentType = input.contentType ?? null;

    await this.tx(async (tx) => {
      await tx.insert(files).values({
        id: this.key,
        bucket: config.bucket,
        key,
        uploadedBy: ctx.viewerId,
        metadata:
          claimedContentType === null ? { kind } : { kind, claimedContentType },
      });
    });
    await this.reload();

    return {
      fileId: this.key,
      bucket: config.bucket,
      key,
      uploadUrl,
      expiresAt: new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000).toISOString(),
    };
  }

  /**
   * Step 2. Confirms the browser's PUT actually landed by asking the binding
   * — never the client (target-stack §4: "never trust a client's 'done'").
   * Idempotent: a second call on an already-verified file is a cheap read,
   * with no repeat call to the binding.
   *
   * This is also where the media type is decided, because it is the first
   * moment bytes exist to decide it from (module doc). A `ValidationError`
   * here is terminal rather than transient: the same bytes will fail the same
   * way on every retry, and leaving the row unverified is what keeps the
   * object unreadable.
   */
  async verify(ctx: Ctx): Promise<FileDto> {
    const aggregate = this.requireAggregate();
    await this.#requireUploaderOrBypass(ctx, aggregate);

    if (aggregate.file.verifiedAt !== null) return fileRowToDto(aggregate.file);

    // Everything up to the copy reads the *upload* object; nothing reads
    // `key` until this method has written it (module doc).
    const uploadKey = uploadKeyOf(aggregate.file.key);
    const stat = await this.#binding.stat(uploadKey);
    if (stat === null) {
      throw new ConflictError(
        `file ${this.key}: no object at ${aggregate.file.bucket}/${uploadKey} ` +
          "yet — the PUT has not completed (or the presigned URL was never used)",
      );
    }

    // The only point at which the size of a presigned PUT becomes observable
    // to this process. `presignedPutUrl` cannot bound it at signing time —
    // SigV4 query presigning signs `host` only, so `Content-Length` is the
    // uploader's to choose (see that function's docblock, and the POST-policy
    // migration it names as the real fix). Until then this is the bound, and
    // it deletes rather than merely refusing: unlike a wrong media type, the
    // harm of an oversized object *is* the bytes sitting in the bucket, so
    // leaving them there would make the check a formality.
    if (stat.size > MAX_UPLOAD_BYTES) {
      await this.#binding.delete(uploadKey);
      throw new ValidationError(
        `file ${this.key} is ${stat.size} bytes, over the ${MAX_UPLOAD_BYTES}-byte ` +
          "upload limit. The object has been deleted; request a new upload " +
          "target for a smaller file.",
      );
    }

    const mimeType = await this.#detectMime(aggregate.file, uploadKey);
    // Sniffing decides what the *row* says; this decides what a *browser* is
    // told, and they are not the same lever. See the module doc — the upload
    // still carries the uploader's own `Content-Type`, so the published copy
    // is given the detected one (and `attachment`), and it is published to
    // `key`, which no PUT URL signs. `ifMatch`: only the bytes that were just
    // sized and sniffed — a PUT that raced in since is refused, not copied.
    try {
      await this.#binding.setMediaType(uploadKey, mimeType, {
        into: aggregate.file.key,
        ifMatch: stat.etag,
      });
    } catch (error) {
      if (error instanceof ObjectChangedError) {
        throw new ConflictError(
          `file ${this.key}: the upload changed while it was being verified; ` +
            "verify it again once the PUT has finished",
        );
      }
      throw error;
    }

    await this.tx(async (tx) => {
      await tx
        .update(files)
        .set({
          verifiedAt: new Date(),
          size: stat.size,
          etag: stat.etag,
          mimeType,
          updatedAt: new Date(),
        })
        .where(eq(files.id, this.key));
    });
    await this.reload();

    // After the row, not before: until `verifiedAt` is written, a failed
    // attempt must leave the upload in place for `verify` to be retried
    // against. Best-effort for the same reason `delete`'s object removal is —
    // the row is the truth, and a leftover upload object is never read.
    await this.#deleteObject(uploadKey, "verify");
    return fileRowToDto(this.requireAggregate().file);
  }

  /**
   * What the uploaded object is, from its first bytes.
   *
   * Every `kind` this app uploads is a photograph — `item-image`,
   * `label-front`, `label-back`, `menu-scan`, `recipe-photo`, all of them from
   * an `accept="image/*"` picker feeding a vision seam or an `<img>`. So
   * "unidentifiable" and "not an image" are the same answer here, and both are
   * refused. If a non-image kind is ever added, this is the method that has to
   * learn about it — branch on `metadata.kind` and keep the image kinds strict,
   * rather than widening this into "anything goes", which is where it started.
   *
   * SVG is refused as a side effect, and that is the outcome to want: it is
   * the one thing an `image/*` picker will offer that is a script-bearing
   * document, and `detectImageMime` does not recognise it.
   */
  async #detectMime(file: FileRow, key: string): Promise<ImageMime> {
    const head = await this.#binding.readHead(key, SNIFF_BYTES);
    const detected = detectImageMime(head);
    if (detected !== null) return detected;

    const claimed = (file.metadata as { claimedContentType?: unknown } | null)
      ?.claimedContentType;
    throw new ValidationError(
      `file ${this.key}: the uploaded object's format could not be identified ` +
        "from its bytes, so it is refused rather than stored with a media " +
        `type nothing checked${
          typeof claimed === "string" ? ` (the upload claimed ${claimed})` : ""
        }. Every upload this app accepts is an image — JPEG, PNG, WebP, GIF, ` +
        "HEIC/HEIF, AVIF, BMP or TIFF. The row stays unverified, so nothing " +
        "can read the object, and it is reaped within 24h.",
    );
  }

  /**
   * Step 3, repeatable. Only ever a GET URL (module doc) — signed for the
   * **browser-facing** authority, because that is who this one is for.
   */
  async presignRead(ctx: Ctx): Promise<ReadTarget> {
    return this.#readTarget(ctx, (key) =>
      this.#binding.presignGetPublic(key, READ_TTL_SECONDS),
    );
  }

  /**
   * The same URL for a caller **inside** this network — the AI seams
   * (`src/lib/ai/images.ts`), which fetch the bytes rather than hand the URL
   * on. Signed for the in-network authority; see the module doc.
   *
   * Not a cheaper or looser `presignRead`: identical visibility check,
   * identical "verified first" rule, identical TTL.
   */
  async presignReadInternal(ctx: Ctx): Promise<ReadTarget> {
    return this.#readTarget(ctx, (key) =>
      this.#binding.presignGetInternal(key, READ_TTL_SECONDS),
    );
  }

  /** The half both read methods share, so neither can drift from the other. */
  async #readTarget(
    ctx: Ctx,
    sign: (key: string) => Promise<string>,
  ): Promise<ReadTarget> {
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);
    if (aggregate.file.verifiedAt === null) {
      throw new ConflictError(`file ${this.key} is not verified yet`);
    }
    return {
      url: await sign(aggregate.file.key),
      expiresAt: new Date(Date.now() + READ_TTL_SECONDS * 1000).toISOString(),
    };
  }

  /** The row itself — metadata only, no signed URL. */
  async get(ctx: Ctx): Promise<FileDto> {
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);
    return fileRowToDto(aggregate.file);
  }

  /**
   * Called directly by the uploader/admin/system, and by `MaintenanceActor`
   * (system ctx) for orphan reaping (`maintenance-actor.ts`).
   *
   * ## Deleting an already-deleted row succeeds
   *
   * This is the one method here that is reached from the **outbox**, where
   * delivery is at least once (§8.4) — so "delete it again" is not an edge
   * case, it is the guaranteed steady state. `requireAggregate()` would throw
   * `NotFoundError`, which the outbox cannot tell from real work failing: it
   * would retry ten times and dead-letter, and `MaintenanceActor`'s reap of a
   * thousand orphans would manufacture a thousand dead letters *in the very
   * report `reportDeadLetters` exists to keep clean*. The reaper would poison
   * its own alarm.
   *
   * `maintenance-actor.ts` has always asserted this method behaves this way
   * ("a re-delivered reap is harmless"); it did not, and this is that claim
   * made true rather than a new liberty. It is also the ordinary meaning of
   * DELETE: the postcondition is "the row is gone", and it already is.
   *
   * No authorization check is skipped by returning early, because there is
   * nothing left to authorize and nothing left to disclose — a caller who may
   * not touch this file learns exactly what they learned before, that no such
   * row is there.
   *
   * ## …and so does deleting a row that is hidden from you (E5b)
   *
   * That early return is what forces the branch below to be a *return* rather
   * than a throw. A missing row answers "success, nothing to do"; if a row
   * that exists but is concealed from the caller answered anything else —
   * `ForbiddenError`, as it used to, or `NotFoundError`, which is the right
   * answer everywhere else in this actor — then the two would be
   * distinguishable and `deleteFile` would be an existence oracle over
   * `files.id`, just inverted. Both cases mean the same thing from where the
   * caller stands ("there is no such file of yours") and both now say it the
   * same way. Nothing is deleted on that branch.
   *
   * `ForbiddenError` survives only where a public referent already discloses
   * that the row exists, which is the same line `canSee` draws.
   */
  async delete(ctx: Ctx): Promise<void> {
    const aggregate = this.aggregate;
    if (aggregate === null) return;
    if (!isOwner(ctx, aggregate.file.uploadedBy)) {
      if (!(await this.canSee(ctx, aggregate))) return;
      throw new ForbiddenError(`file ${this.key} is not yours`);
    }

    try {
      await this.tx(async (tx) => {
        await tx.delete(files).where(eq(files.id, this.key));
      });
    } catch (error) {
      // Every foreign key into `files` is `RESTRICT`/`NO ACTION`, so a file
      // something still points at cannot go — and saying so is the owner's
      // answer, not an unexpected database error. Nothing was deleted.
      const pg = pgErrorOf(error);
      if (pg !== undefined && STILL_REFERENCED.has(pg.code)) {
        const constraint =
          typeof pg.constraint === "string" ? pg.constraint : "";
        const holder = ATTACHMENTS[constraint] ?? "another row";
        throw new ConflictError(
          `file ${this.key} is still attached to ${holder}; remove it from ` +
            "there before deleting the file",
        );
      }
      throw error;
    }
    this.setAggregate(null);

    // Best-effort, deliberately after the row is gone: the row is the
    // authoritative state (§1.3), so a stray object left behind by a failed
    // delete is inert — nothing references the key any more. Swallowed rather
    // than thrown so a storage hiccup never blocks a delete that has, from the
    // database's point of view, already succeeded. Both keys: the published
    // object, and the upload one — which is where an unverified row's bytes
    // live (so this is what reaps them for `MaintenanceActor`), and where a
    // PUT made after verification would have landed. Deleting a key that
    // holds nothing is a no-op in S3, which is every row from before the two
    // were split.
    await this.#deleteObject(aggregate.file.key, "delete");
    await this.#deleteObject(uploadKeyOf(aggregate.file.key), "delete");
  }

  /** A best-effort object removal: logged, never thrown (see `delete`). */
  async #deleteObject(key: string, during: string): Promise<void> {
    try {
      await this.#binding.delete(key);
    } catch (error) {
      console.warn(
        `[FileActor] ${during}(${this.key}): object delete failed for ` +
          `${key}: ${String(error)}`,
      );
    }
  }

  /**
   * Uploader (or admin/system) only — and a caller who is none of those is
   * refused as **absent** unless something public already discloses the file
   * (E5b).
   *
   * This used to throw `ForbiddenError` straight off `requireAggregate()`, so
   * `verifyUpload`/`deleteFile` on somebody else's file id answered
   * "file … is not yours" while an id naming no row answered `NotFoundError`.
   * That is an existence oracle over `files.id`. `#hasPublicReferent` is the
   * one condition under which a non-uploader may learn the file exists — a
   * public `item_image`, or a `place_google_photos` row — so the guard is that
   * check, and `ForbiddenError` survives exactly where existence was already
   * public. Same shape as `CellarActor.#requireOwner`.
   *
   * `verify` is the only caller; `delete` has to *return* rather than throw on
   * the concealed branch, for the reason written out above it.
   */
  async #requireUploaderOrBypass(
    ctx: Ctx,
    aggregate: FileAggregate,
  ): Promise<void> {
    // A caller who may not even read the file learns nothing more than that.
    await this.requireAllowed(
      ctx,
      isOwner(ctx, aggregate.file.uploadedBy),
      `file ${this.key} is not yours`,
      aggregate,
    );
  }

  /**
   * Reading is wider than writing, and this is why (A7c (2)).
   *
   * A8 gated every method on the uploader, which is right for `verify` and
   * `delete` and **makes item images undisplayable**: `item_image` rows are
   * visible when `is_public` or owned by the viewer (§2.1), so the common case
   * is reading a public photo somebody else uploaded. `FileActor` cannot know
   * that from `files` alone.
   *
   * Rather than give `files` a `public` flag — new state, and a backfill at
   * cutover for every migrated row — the rule is **derived** from the tables
   * that reference the file. `FileActor` writes neither of them, so §1.3 says
   * read them fresh per call rather than cache them; this query runs only on
   * the path where the viewer is *not* the uploader.
   *
   * The other three referents (`item_onboardings`' two label images and
   * `menu_scans`' two) are deliberately absent: both aggregates are owner-only,
   * and their owner is the uploader, so the first branch already covers them.
   */
  protected override async canSee(
    ctx: Ctx,
    aggregate: FileAggregate,
  ): Promise<boolean> {
    if (isOwner(ctx, aggregate.file.uploadedBy)) return true;
    return await this.#hasPublicReferent();
  }

  /**
   * "Does anything that is already public point at this file?" — the derived
   * rule described above `canSee`, factored out because all three
   * non-uploader paths (`verify`, `delete`, the two read methods) have to draw
   * the disclosure line in exactly the same place or the difference between
   * them becomes the oracle.
   */
  async #hasPublicReferent(): Promise<boolean> {
    const [publicImage] = await this.db
      .select({ id: itemImage.id })
      .from(itemImage)
      .where(and(eq(itemImage.fileId, this.key), eq(itemImage.isPublic, true)))
      .limit(1);
    if (publicImage !== undefined) return true;

    const [placePhoto] = await this.db
      .select({ id: placeGooglePhotos.id })
      .from(placeGooglePhotos)
      .where(eq(placeGooglePhotos.storageFileId, this.key))
      .limit(1);
    return placePhoto !== undefined;
  }
}
