/**
 * `FileActor`'s wire contract — A8's actor, given the GraphQL surface it never
 * had (A7c (2)).
 *
 * A8 built the whole upload protocol and nothing exposed it, so images could
 * neither be uploaded nor **displayed**: `ItemImage` carries a `fileId` and
 * there was no field, anywhere, that turned one into a URL.
 *
 * The protocol, unchanged:
 *
 *   createUploadTarget → the client PUTs the bytes straight to storage →
 *   verify() asks storage whether the object is actually there → presignRead
 *   hands back a GET URL.
 *
 * **These are the wire shapes, not the row shapes** (same rule as `items.ts`):
 * `timestamptz` crosses as an ISO-8601 string, because `services/api` has no
 * Drizzle and no database.
 */
import type { ActorDescriptor } from "./actors.ts";
import type { Ctx } from "./ctx.ts";

/** One `files` row. */
export type FileDto = {
  readonly id: string;
  readonly bucket: string;
  readonly key: string;
  /** Bytes, from the object store — null until `verify` has run. */
  readonly size: number | null;
  readonly mimeType: string | null;
  readonly etag: string | null;
  /** `files.uploaded_by`; null for a file no user owns (a migrated one). */
  readonly uploadedBy: string | null;
  /**
   * ISO-8601, or null while the row is still provisional. `null` means the
   * PUT has not been confirmed, and `MaintenanceActor` reaps such a row at 24h
   * — provided nothing references it, since §2.1's orphan is "never
   * verified/**attached**" and every FK into `files` is `RESTRICT`/`NO ACTION`.
   */
  readonly verifiedAt: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CreateUploadTargetInput = {
  /**
   * A free-form namespace for the object key (`"item-image"`, `"label-front"`,
   * `"menu-scan"`, …) — lowercase letters, digits and hyphens.
   */
  readonly kind: string;
  readonly contentType?: string | null;
};

export type UploadTarget = {
  readonly fileId: string;
  readonly bucket: string;
  readonly key: string;
  /** PUT the bytes here. Never routed through the Dapr sidecar. */
  readonly uploadUrl: string;
  /** ISO-8601. */
  readonly expiresAt: string;
};

export type ReadTarget = {
  readonly url: string;
  /** ISO-8601. */
  readonly expiresAt: string;
};

export type DeletedFile = { readonly id: string };

/**
 * G32's upload kind for a photo taken only to search with (`/search`'s Photo
 * button, the onboarding wizard's display-photo match). Such a file is
 * verified and then never attached: its whole use is one
 * `itemSearch(imageFileId:)`. So it is short-lived — `ItemSearchActor`
 * discards it once the search has used it ({@link InternalFileActorInterface.discardSearchPhoto}),
 * and `MaintenanceActor` reaps any left over after {@link SEARCH_PHOTO_TTL_MS}.
 */
export const SEARCH_PHOTO_KIND = "image-search";

/**
 * How old an unattached `image-search` file may get before `MaintenanceActor`
 * reaps it, verified or not — the safety net under the immediate discard.
 * The reaper runs daily, so one can outlive this by up to a day.
 */
export const SEARCH_PHOTO_TTL_MS = 24 * 60 * 60 * 1000;

/** What `discardSearchPhoto` did: `false` when it left the file alone. */
export type DiscardedSearchPhoto = { readonly discarded: boolean };

export type FileActorInterface = {
  get(ctx: Ctx): Promise<FileDto>;
  createUploadTarget(
    ctx: Ctx,
    input: CreateUploadTargetInput,
  ): Promise<UploadTarget>;
  verify(ctx: Ctx): Promise<FileDto>;
  /**
   * A GET URL for a **browser** — signed for the authority a client outside
   * the deployment's network can dial. This is the one `services/api` hands to
   * a page.
   */
  presignRead(ctx: Ctx): Promise<ReadTarget>;
  delete(ctx: Ctx): Promise<void>;
};

/**
 * Only the actor host's own AI image loader calls these — never a resolver,
 * whose consumers are browsers. `context.actor(FileActorDescriptor, …)` is
 * typed over {@link FileActorInterface} alone, so a resolver cannot name them.
 */
export type InternalFileActorInterface = {
  /**
   * The same URL for a caller **inside** that network, which in development is
   * a different authority: SigV4 covers the `Host` header, so a URL is only
   * usable where it was signed to be dialled, and no single address means the
   * object store from both a host browser and a container on Docker Desktop
   * (measured in `services/actors/src/lib/s3-presign.ts`, §E3).
   *
   * `services/api` must not call this — its consumers are browsers. The only
   * caller is the actor host's own AI image loader, which downloads the bytes.
   * The visibility check, the "verified first" rule and the TTL are identical
   * to {@link presignRead}; only the authority differs.
   */
  presignReadInternal(ctx: Ctx): Promise<ReadTarget>;
  /**
   * G32: delete this file if — and only if — it is a search photo
   * ({@link SEARCH_PHOTO_KIND}) the caller uploaded (or the caller is
   * system/admin) and nothing references it. Anything else is left alone and
   * answered `{ discarded: false }`, never an error: the caller is
   * `ItemSearchActor` after a photo search, and a search may legitimately be
   * run over a file that is not a search photo (an item image the viewer may
   * read), which must survive it. A row already gone is `false` too.
   */
  discardSearchPhoto(ctx: Ctx): Promise<DiscardedSearchPhoto>;
};

export const FileActorDescriptor: ActorDescriptor<
  FileActorInterface,
  InternalFileActorInterface
> = {
  actorType: "FileActor",
  category: "entity",
  methods: {
    get: {},
    // One round trip to the object store each, inside a user-facing turn.
    // The actor host's callers always waited 30s; the API waited its 15s
    // default for the same work, so it could give up on a verify an actor
    // caller would have seen through.
    createUploadTarget: { timeoutMs: 30_000 },
    verify: { timeoutMs: 30_000 },
    presignRead: {},
    delete: {},
  },
  internalMethods: {
    presignReadInternal: {},
    discardSearchPhoto: {},
  },
};
