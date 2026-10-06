/**
 * The item-image upload flow (D3, finished by D10).
 *
 * ## The protocol A8 built, and A7c exposed
 *
 * `FileActor` (`services/actors/src/actors/file-actor.ts`) implements a three-step
 * upload, and every step now has a GraphQL surface on `services/api`
 * (`services/api/src/schema/file.ts`):
 *
 *   1. `createUploadTarget(input: { kind, contentType }, fileId)` mints a
 *      provisional `files` row and returns `{ fileId, bucket, key, uploadUrl,
 *      expiresAt }`. The PUT URL is signed by the actor itself, because the
 *      Dapr S3 binding can only presign GET.
 *   2. The **browser** PUTs the bytes straight at `uploadUrl`. Nothing streams
 *      through `services/api`, and nothing through the Dapr sidecar.
 *   3. `verifyUpload(fileId)` stats the object through the binding and stamps
 *      `verifiedAt`. Only then is the row trusted; `MaintenanceActor` reaps
 *      unverified rows after 24h. `attachItemImage` calls `FileActor.verify`
 *      for you, so the common path needs no separate call — an upload that
 *      never landed is refused with `ConflictError`, and a made-up file id
 *      with `NotFoundError`.
 *
 * Reading is `File.url` — a presigned GET, 30 minutes — reachable either as
 * `ItemImage.file { url }` or as the `file(id:)` query. There is no separate
 * `presignRead` field; that actor method is what backs both.
 *
 * ## What can still block an upload, and how this module knows
 *
 * Exactly one thing, and it is **not** a missing mutation any more: the
 * presigned URL's origin has to be one the browser may actually address.
 *
 * SigV4 signs the `Host` header, so a presigned URL cannot be proxied onto
 * this origin or rewritten in flight — `services/actors/src/lib/s3-presign.ts`
 * spells out why, and it is confirmed empirically: rewriting
 * `http://minio:9000/…` to `http://localhost:9100/…` answers
 * `SignatureDoesNotMatch`. The browser must reach the exact host that was
 * signed, which means that host must be in this build's `connect-src`
 * (`next.config.mjs`), or the PUT is blocked with no network request at all.
 *
 * So the blockers here are **derived from that allowlist**, never asserted:
 *
 *   - `next.config.mjs` computes `fileOrigins()` for the CSP and hands the
 *     same list to the client as `NEXT_PUBLIC_FILE_ORIGINS`. One source, two
 *     consumers, no second place to keep in sync.
 *   - Before an upload, the only knowable failure is a build with *no* file
 *     origin at all — the case `next.config.mjs` already warns about, where
 *     every upload is CSP-blocked. {@link describeUploadBlockers} reports that
 *     and nothing else, so a correctly configured production build gets an
 *     empty list.
 *   - After `createUploadTarget` answers, the signed origin is a fact rather
 *     than a guess, and {@link assertReachable} compares it to the allowlist.
 *     This is what catches a default development stack, whose actors service
 *     has no `FILES_S3_ENDPOINT` and therefore signs the compose-internal
 *     `http://minio:9000`.
 *
 * The previous version of this comment hardcoded two blocker strings, both of
 * which had become false without anything failing — `src/lib/dev-checks/
 * upload-surface.test.ts` exists so that cannot happen a second time.
 */

import type { Client } from "urql";
import { ActorErrorFieldsFragment } from "./errors.ts";
import { graphql } from "./graphql.ts";
import { type ApiFailure, unwrapResult } from "./result.ts";

/** What `FileActor.createUploadTarget` returns, verbatim (A8's `UploadTarget`). */
export type UploadTarget = {
  readonly fileId: string;
  readonly bucket: string;
  readonly key: string;
  /** PUT the bytes here. Signed by the actor, valid for 15 minutes. */
  readonly uploadUrl: string;
  readonly expiresAt: string;
};

/**
 * The `kind` namespace that becomes the object key's prefix.
 *
 * Lowercase letters, digits and hyphens only — `FileActor` validates it against
 * `/^[a-z0-9][a-z0-9-]{0,63}$/` and rejects anything else.
 *
 * `menu-scan` and `recipe-photo` were added by X11 alongside the two upload
 * flows that need them. `menu-scan` is not an invention: `CreateUploadTargetInput.kind`
 * names it in the schema's own documentation, beside `item-image` and
 * `label-front`. The union is a client-side convenience — the server accepts
 * any string matching the pattern — so widening it costs nothing and keeps a
 * typo from reaching the actor.
 */
export type UploadKind =
  | "item-image"
  | "label-front"
  | "label-back"
  | "menu-scan"
  | "recipe-photo"
  | "image-search";

export class UploadUnavailableError extends Error {
  readonly blockers: readonly string[];
  constructor(blockers: readonly string[]) {
    super(blockers.join(" "));
    this.name = "UploadUnavailableError";
    this.blockers = blockers;
  }
}

/** A typed failure from the API, carried out of the upload helpers unchanged. */
export class UploadRejectedError extends Error {
  readonly failure: ApiFailure;
  constructor(failure: ApiFailure) {
    super(failure.message);
    this.name = "UploadRejectedError";
    this.failure = failure;
  }
}

/* -------------------------------------------------------------------------
 * Where the browser is allowed to send bytes
 * ---------------------------------------------------------------------- */

/**
 * The origins this build's `connect-src` permits for file traffic.
 *
 * Three distinct states, and the difference matters:
 *
 *   - `null` — the variable is absent, so this code is not running inside a
 *     Next build at all (a `node --test` run, say). Nothing is known, so
 *     nothing is claimed and no check is performed.
 *   - `[]` — a build that recorded an empty list. That is a production build
 *     with neither `PUBLIC_FILES_HOST` nor `FILES_S3_PUBLIC_URL` set, which
 *     `next.config.mjs` already warns about at build time. Every upload from
 *     it is CSP-blocked.
 *   - a non-empty list — the allowlist to compare a signed URL against.
 */
export const permittedFileOrigins = (
  raw: string | undefined = process.env.NEXT_PUBLIC_FILE_ORIGINS,
): readonly string[] | null =>
  raw === undefined ? null : raw.split(" ").filter((part) => part !== "");

/** `https://host:port` of a URL, or `null` when it is not a URL at all. */
const originOf = (url: string): string | null => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

/**
 * Everything that stops an upload completing, computed from this environment.
 *
 * Returned rather than thrown so the UI can render the list next to a disabled
 * control — a button that explains itself beats one that fails on click. An
 * empty list is the normal answer, including on a default development stack:
 * the one problem such a stack has is only observable once the API has signed
 * a URL, and {@link assertReachable} is what reports it then.
 */
export const describeUploadBlockers = (
  origins: readonly string[] | null = permittedFileOrigins(),
): readonly string[] =>
  origins !== null && origins.length === 0
    ? [
        "This build has no file host in its Content-Security-Policy, so the browser will refuse " +
          "every upload before it leaves the page. Set PUBLIC_FILES_HOST (or FILES_S3_PUBLIC_URL) " +
          "for the build — see next.config.mjs and docs/architecture/deploy-loki.md §7.",
      ]
    : [];

/**
 * Refuse a target the browser cannot actually PUT to, with a message naming
 * both origins.
 *
 * Without this the fetch fails as an opaque `TypeError: Failed to fetch` —
 * CSP blocks the request before it is made and reports nothing to the page.
 */
const assertReachable = (
  target: UploadTarget,
  origins: readonly string[] | null = permittedFileOrigins(),
): void => {
  if (origins === null || origins.length === 0) return;
  const signed = originOf(target.uploadUrl);
  if (signed === null || origins.includes(signed)) return;
  throw new UploadUnavailableError([
    `The API signed this upload for ${signed}, which this build may not contact ` +
      `(allowed: ${origins.join(", ")}). A presigned URL cannot be proxied or rewritten — the ` +
      "signature covers the host — so the signer has to be told the browser-facing address: set " +
      "FILES_S3_ENDPOINT / FILES_S3_PORT on the actors service. On the default development stack " +
      "it is unset, so uploads are signed for the compose-internal host and only work from inside " +
      "the compose network.",
  ]);
};

/* -------------------------------------------------------------------------
 * Documents
 * ---------------------------------------------------------------------- */

/**
 * Step 1. `fileId` is caller-minted like every other `create` in this schema,
 * so a retry after a dropped response addresses the same provisional row
 * rather than orphaning one — though note `FileActor.createUploadTarget`
 * deliberately *conflicts* on a second call for the same id instead of
 * re-signing, so a retry has to tolerate `CONFLICT` as "already have a
 * target". Omitted, the server mints the id and returns it.
 */
export const CreateUploadTargetMutation = graphql(
  `
  mutation CreateUploadTarget($fileId: ID, $input: CreateUploadTargetInput!) {
    createUploadTarget(fileId: $fileId, input: $input) {
      __typename
      ... on UploadTarget {
        fileId
        bucket
        key
        uploadUrl
        expiresAt
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/**
 * Step 3, for a flow that attaches later than it uploads.
 *
 * `attachItemImage` calls `FileActor.verify` itself, so the item-image path
 * does **not** need this — spending a round trip to learn what the next call
 * is about to check anyway would only widen the window in which the row is
 * provisional. Kept and exported because the onboarding wizard and menu scans
 * upload well before anything attaches.
 */
export const VerifyUploadMutation = graphql(
  `
  mutation VerifyUpload($fileId: ID!) {
    verifyUpload(fileId: $fileId) {
      __typename
      ... on File {
        id
        bucket
        key
        size
        mimeType
        verifiedAt
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/* -------------------------------------------------------------------------
 * The flow
 * ---------------------------------------------------------------------- */

/**
 * Step 1 — ask the API where to PUT, and refuse a target this browser cannot
 * reach before any bytes move.
 */
export const requestUploadTarget = async (
  client: Client,
  input: { kind: UploadKind; contentType?: string; fileId?: string },
): Promise<UploadTarget> => {
  const blockers = describeUploadBlockers();
  if (blockers.length > 0) throw new UploadUnavailableError(blockers);

  const response = await client
    .mutation(CreateUploadTargetMutation, {
      fileId: input.fileId ?? null,
      input: {
        kind: input.kind,
        contentType: input.contentType ?? null,
      },
    })
    .toPromise();

  const result = unwrapResult(
    response.data?.createUploadTarget,
    "UploadTarget",
  );
  if (!result.ok) throw new UploadRejectedError(result.error);

  const target: UploadTarget = {
    fileId: result.data.fileId,
    bucket: result.data.bucket,
    key: result.data.key,
    uploadUrl: result.data.uploadUrl,
    expiresAt: result.data.expiresAt,
  };
  assertReachable(target);
  return target;
};

/**
 * Step 2 — the browser PUTs the bytes.
 *
 * A presigned PUT takes the object body and no credentials. Nothing here goes
 * through `services/api`.
 *
 * **The `Content-Type` is not signed**, and an earlier version of this comment
 * claimed the opposite ("must match whatever was signed or S3 rejects the
 * signature"). `presignedPutObject` signs the `Host` header and nothing else —
 * every URL it produces carries `X-Amz-SignedHeaders=host`, measured against
 * `minio` 8.0.7 — so this header is a free-form hint, MinIO stores whatever
 * arrives, and nothing about it is evidence. It is sent because the object
 * store has to record *something*, not because it is trusted: the media type
 * the app relies on is the one `FileActor.verify` reads out of the bytes
 * server-side (`services/actors/src/actors/file-actor.ts`), which is what
 * `File.mimeType` returns.
 *
 * It does not survive either. Whatever this sends is what MinIO would replay
 * on every presigned GET of the object — measured, and an uploaded HTML
 * document served that way *executes* — so `verify` overwrites the stored
 * object's own `Content-Type` with the detected one and adds
 * `Content-Disposition: attachment`. By the time anything can read the file,
 * this header is gone. Sending it at all is a courtesy to the store's
 * defaults, nothing more.
 */
export const putToUploadTarget = async (
  target: UploadTarget,
  file: Blob,
): Promise<void> => {
  const response = await fetch(target.uploadUrl, {
    method: "PUT",
    body: file,
    headers: file.type === "" ? undefined : { "content-type": file.type },
    // A presigned URL carries its own auth; a cookie would only confuse S3.
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error(
      `Upload failed (${response.status}). The presigned URL may have expired — ask for a new one.`,
    );
  }
};

/**
 * Step 3 — ask the object store whether the bytes actually landed.
 *
 * Only for callers that will not immediately run something which verifies for
 * them. Returns the file's `verifiedAt`, which `FileActor` only ever moves off
 * `null` on the store's own word.
 */
export const verifyUploadedFile = async (
  client: Client,
  fileId: string,
): Promise<{ id: string; verifiedAt: string | null }> => {
  const response = await client
    .mutation(VerifyUploadMutation, { fileId })
    .toPromise();
  const result = unwrapResult(response.data?.verifyUpload, "File");
  if (!result.ok) throw new UploadRejectedError(result.error);
  return { id: result.data.id, verifiedAt: result.data.verifiedAt ?? null };
};

/**
 * Steps 1 and 2 together, returning the `files.id` to attach.
 *
 * Step 3 is left to the caller because the callers that matter get it free:
 * `attachItemImage` runs `FileActor.verify` before it writes the `item_image`
 * row. Pass `verify: true` when nothing downstream will.
 */
export const uploadFile = async (
  client: Client,
  file: Blob,
  kind: UploadKind,
  options: { fileId?: string; verify?: boolean } = {},
): Promise<string> => {
  const target = await requestUploadTarget(client, {
    kind,
    contentType: file.type === "" ? undefined : file.type,
    fileId: options.fileId,
  });
  await putToUploadTarget(target, file);
  if (options.verify === true) {
    await verifyUploadedFile(client, target.fileId);
  }
  return target.fileId;
};
