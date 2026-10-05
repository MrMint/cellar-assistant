/**
 * `FileActor`'s use of the `files` Dapr output binding
 * (`infra/dapr/components/files-binding.yaml`, `bindings.aws.s3`).
 *
 * Three operations, all verified empirically against A2's compose stack on
 * 2026-09-08 — both raw HTTP to the sidecar (`POST /v1.0/bindings/files`) and
 * through `DaprClient.binding.send`, which posts the identical envelope:
 *
 *   - **`list`** — `data: { prefix, maxResults }` → Go's default JSON
 *     marshaling of `s3.ListObjectsV2Output`, so the keys are capitalized:
 *     `{ Contents: [{ Key, ETag, Size, LastModified, ... }] | null, ... }`.
 *     `stat()` uses this in place of a HEAD (the binding has none): it proves
 *     the object exists and returns its size/etag without pulling the body
 *     through the sidecar the way `get` would.
 *   - **`presign`** — `metadata: { key, presignTTL }` → `{ presignURL }`.
 *     This is a **GET** URL only: `dapr/components-contrib`'s
 *     `presignObject()` calls `PresignGetObject` unconditionally, for this
 *     operation and for `create`'s `presignTTL` option alike. There is no
 *     PUT-presign anywhere on this binding — see `src/lib/s3-presign.ts` for
 *     how `createUploadTarget` gets an upload URL instead.
 *   - **`delete`** — `metadata: { key }` → 204, empty body.
 *
 * `presignTTL` is a Go duration string (`"900s"`, `"15m"`); this module always
 * sends whole seconds.
 *
 * ## `readHead` is not a fourth binding operation
 *
 * It is `presign` plus a ranged `fetch` the sidecar never sees, and it exists
 * because `FileActor.verify` has to decide an uploaded object's media type
 * from its bytes rather than from what the uploader claimed. The binding's own
 * `get` would do it too, but that pulls the whole body through the sidecar,
 * which target-stack §4 rules out for image bytes — and a sixteen-byte window
 * is all `detectImageMime` reads anyway. `src/lib/ai/images.ts` downloads a
 * whole image off a presigned URL the same way, for the same reason.
 *
 * ## Neither is `setMediaType`
 *
 * It is a server-side `CopyObject` issued by the in-process signer in
 * `src/lib/s3-presign.ts`, for the same reason `createUploadTarget`'s PUT URL
 * is signed there: the Dapr S3 binding has no operation for it. It lives on
 * this type anyway so `FileActor` keeps **one** collaborator to inject and one
 * shape to fake — the alternative is an actor that reaches past its own seam
 * for a single call, which is how a seam stops being one.
 *
 * ## And `presignGetPublic` is the one operation this binding cannot do at all
 *
 * E3. The binding signs for the endpoint it dials — the AWS SDK offers no way
 * to separate the two — and its endpoint is the in-network one, because
 * `list`, `delete` and `readHead`'s own presign are all server-side calls the
 * sidecar makes. A browser cannot resolve that name, and in development no
 * single name is correct from both sides (measured, exhaustively, in
 * `src/lib/s3-presign.ts`'s E3 section). So the URL a browser is given is
 * signed in-process for the browser-facing authority, exactly as
 * `createUploadTarget`'s PUT URL already was, and the two signers appear here
 * as two differently named methods:
 *
 *   presignGetPublic    for a URL leaving this network  (FILES_S3_ENDPOINT)
 *   presignGetInternal  for a URL fetched inside it     (FILES_S3_INTERNAL_*)
 *
 * The position is in the name rather than in a parameter on purpose: a wrong
 * choice is then visible in a diff instead of being a boolean nobody reads,
 * and this whole class of bug is a caller standing somewhere the URL did not
 * expect. In production the two authorities are the same string, so both
 * methods return interchangeable URLs and the distinction costs nothing.
 */
import type { DaprClient } from "@dapr/dapr";
import {
  filesS3Config,
  filesS3InternalConfig,
  type MediaTypeCopyOptions,
  presignedGetUrl,
  setObjectMediaType,
} from "./s3-presign.ts";

const BINDING_NAME = "files";

/**
 * `readHead`'s presign lives exactly as long as the `fetch` on the next line.
 * Nothing hands this URL to a client, so there is no reason for the window
 * `FileActor.presignRead` needs — and for the same reason it is signed for the
 * in-network authority: the `fetch` happens here, in this container.
 */
const HEAD_TTL_SECONDS = 60;

/** One round trip to the object store, inside a user-facing mutation's turn. */
const HEAD_FETCH_TIMEOUT_MS = 15_000;

export type ObjectStat = { readonly size: number; readonly etag: string };

/**
 * `setMediaType`'s copy was refused because its source no longer carries the
 * ETag the caller checked (`ifMatch`): the object was replaced in between.
 * Its own class so `FileActor.verify` can answer that race with a
 * `ConflictError` and let everything else — a store that is down, bad
 * credentials — stay the unexpected error it is.
 */
export class ObjectChangedError extends Error {
  constructor(key: string) {
    super(`files: "${key}" changed after it was checked; nothing was copied`);
    this.name = "ObjectChangedError";
  }
}

/** The S3 error code a failed `x-amz-copy-source-if-match` answers with. */
const isPreconditionFailed = (error: unknown): boolean =>
  (error as { code?: unknown } | null)?.code === "PreconditionFailed";

/**
 * The seam `FileActor` calls through. Production gets `daprFilesBinding`
 * (below); the no-Dapr test harness (`src/lib/testing.ts`) has no sidecar to
 * reach, so tests construct `FileActor` with a fake of this shape instead —
 * the same pattern `OutboxActor.deliver` uses for the same reason.
 */
export type FilesBinding = {
  /** `null` when no object exists at `key`. */
  stat(key: string): Promise<ObjectStat | null>;
  /**
   * A GET URL for a client **outside** this network — a browser.
   *
   * Signed in process against `FILES_S3_ENDPOINT`/`FILES_S3_PORT` rather than
   * by the binding, which can only ever sign for the endpoint it dials. See
   * this module's E3 section.
   */
  presignGetPublic(key: string, ttlSeconds: number): Promise<string>;
  /**
   * A GET URL for a caller **inside** this network — the AI seams, and
   * `readHead` below. GET-only, per `presignObject()` in the binding source.
   */
  presignGetInternal(key: string, ttlSeconds: number): Promise<string>;
  /**
   * The object's first `byteCount` bytes, for deciding what it actually is.
   *
   * Fewer may come back — a `Range` past the end of a short object is answered
   * with what exists — so a caller must not assume a full window. More never
   * does: a store that ignores `Range` and returns the whole object is
   * truncated here rather than passed on.
   */
  readHead(key: string, byteCount: number): Promise<Uint8Array>;
  /**
   * Make the stored object serve `contentType`, replacing whatever the
   * uploader's PUT put there — see `setObjectMediaType` in `s3-presign.ts` for
   * why the uploader's value cannot be trusted and why this is a copy.
   *
   * Leaves the bytes, `size` and `etag` alone — measured, not assumed — so a
   * caller that already holds a `stat` does not have to take another.
   *
   * With `options.into`, the copy lands on that key instead of on `key`
   * (`FileActor.verify` publishing an upload away from the key its PUT URL
   * signs); with `options.ifMatch`, it happens only while `key` still carries
   * that ETag, and throws {@link ObjectChangedError} otherwise.
   */
  setMediaType(
    key: string,
    contentType: string,
    options?: MediaTypeCopyOptions,
  ): Promise<void>;
  delete(key: string): Promise<void>;
};

type S3Object = {
  Key?: string;
  key?: string;
  Size?: number;
  size?: number;
  ETag?: string;
  etag?: string;
};
type ListResponse = {
  Contents?: S3Object[] | null;
  contents?: S3Object[] | null;
};
type PresignResponse = { presignURL?: string };

/** MinIO/S3 return the ETag wrapped in literal quotes (it's a quoted-string HTTP header value). */
const stripQuotes = (etag: string): string => etag.replace(/^"|"$/g, "");

/**
 * Module-level rather than a method so `readHead` can reuse it without `this`
 * — the returned object is routinely destructured into a fake's spread, and a
 * `this.presignGet` would break the moment somebody did that.
 */
const presign = async (
  client: DaprClient,
  key: string,
  ttlSeconds: number,
): Promise<string> => {
  const raw = (await client.binding.send(BINDING_NAME, "presign", "", {
    key,
    presignTTL: `${ttlSeconds}s`,
  })) as PresignResponse;
  if (raw.presignURL === undefined || raw.presignURL === "") {
    throw new Error(
      `files binding: "presign" returned no presignURL for key "${key}"`,
    );
  }
  return raw.presignURL;
};

export const daprFilesBinding = (client: DaprClient): FilesBinding => ({
  async stat(key) {
    const raw = (await client.binding.send(
      BINDING_NAME,
      "list",
      { prefix: key, maxResults: 5 },
      {},
    )) as ListResponse;
    const contents = raw.Contents ?? raw.contents ?? [];
    const match = contents.find((o) => (o.Key ?? o.key) === key);
    if (match === undefined) return null;
    return {
      size: Number(match.Size ?? match.size ?? 0),
      etag: stripQuotes(String(match.ETag ?? match.etag ?? "")),
    };
  },

  async presignGetPublic(key, ttlSeconds) {
    return presignedGetUrl(filesS3Config(), key, ttlSeconds);
  },

  async presignGetInternal(key, ttlSeconds) {
    return presign(client, key, ttlSeconds);
  },

  async readHead(key, byteCount) {
    const url = await presign(client, key, HEAD_TTL_SECONDS);
    const response = await fetch(url, {
      // `Range` is not part of a SigV4 GET signature (the presigned URL carries
      // `X-Amz-SignedHeaders=host`), so adding it here cannot invalidate the
      // URL the sidecar just signed.
      headers: { range: `bytes=0-${byteCount - 1}` },
      signal: AbortSignal.timeout(HEAD_FETCH_TIMEOUT_MS),
    });
    // 206 when the range was served, 200 when the store answered with the
    // whole (shorter, or un-ranged) object. Both are fine; a 4xx/5xx is not.
    if (!response.ok) {
      throw new Error(
        `files binding: reading the first ${byteCount} bytes of "${key}" ` +
          `failed (${response.status})`,
      );
    }
    const buffer = await response.arrayBuffer();
    return new Uint8Array(
      buffer.byteLength > byteCount ? buffer.slice(0, byteCount) : buffer,
    );
  },

  async setMediaType(key, contentType, options) {
    // The INTERNAL config: this is a `CopyObject` **this process** makes, not
    // a URL anyone else dials. With the browser-facing one it would try the
    // published host port from inside the container and fail, which would fail
    // `verify` closed — safe, but for entirely the wrong reason.
    try {
      await setObjectMediaType(
        filesS3InternalConfig(),
        key,
        contentType,
        options,
      );
    } catch (error) {
      if (isPreconditionFailed(error)) throw new ObjectChangedError(key);
      throw error;
    }
  },

  async delete(key) {
    await client.binding.send(BINDING_NAME, "delete", "", { key });
  },
});
