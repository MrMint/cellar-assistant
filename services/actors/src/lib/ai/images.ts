/**
 * Getting image bytes to a vision model.
 *
 * The three vision seams (`item-defaults`, `menu-ai`, `recipe-photo-ai`) are
 * handed `files.id` values, never bytes — A8's rule is that image bytes never
 * pass through the Dapr sidecar (`target-stack.md` §4), so what exists is a
 * row and an object in MinIO. This turns one into the other:
 *
 *   `FileActor(fileId).presignReadInternal(ctx)` → a GET URL → `fetch` → bytes.
 *
 * `presignReadInternal`, not `presignRead`, and the difference is load-bearing
 * (E3): the download below happens *in this process*, inside the compose
 * network, while `presignRead` is signed for the authority a **browser** can
 * dial. A presigned URL's `Host` is inside its SigV4 signature, so the two are
 * not interchangeable in development — `presignRead`'s URL fetched from here
 * reaches this container's own loopback and fails as `Unable to connect`, with
 * nothing in the message about MinIO or a signature. That is what
 * `describeAuthorityMismatch` is for, below. See
 * `services/actors/src/lib/s3-presign.ts`'s E3 section for why there is no one
 * address that would serve both.
 *
 * `FileActor` is on §8.5's synchronous allow-list for an entity actor, and it
 * is the thing that owns both the visibility check and the "is this object
 * actually there" check — so going through it rather than reaching into MinIO
 * here is what keeps a menu photo's ACL enforced on the AI path too.
 *
 * Injected as a type so a test can drive the seams with bytes it made up,
 * without a sidecar and without MinIO.
 *
 * ## What the download itself asserts, and why it is here rather than upstream
 *
 * Three things, all of which used to be somebody else's problem and all of
 * which surfaced as a *provider* error: the size cap is read from
 * `Content-Length` before the body is buffered rather than measured after it
 * (see {@link download}); an empty body is refused; and the bytes are run
 * through `detectImageMime` before anything downstream sees them, because a
 * presigned GET can answer 200 with an error document and a vision model's
 * refusal of that document says nothing about where it came from. This is the
 * last point on the path that still knows the file id *and* the URL, so it is
 * the only place an error can name both.
 */
import type { Ctx, ReadTarget } from "@cellar-assistant/contracts";
import {
  ConflictError,
  FileActorDescriptor,
  ValidationError,
} from "@cellar-assistant/contracts";
import { internal } from "../internal-client.ts";
import { describeAuthorityMismatch } from "../s3-presign.ts";
import { detectImageMime } from "./image-mime.ts";

export type ImageLoader = (
  ctx: Ctx,
  fileIds: readonly string[],
) => Promise<Uint8Array[]>;

/**
 * A presign (the default 15s — `FileActorDescriptor` declares nothing longer
 * for `presignReadInternal`) plus a download; well short of §8.5's 120s
 * request budget.
 */
const DOWNLOAD_TIMEOUT_MS = 30_000;

/** 20 MB. A label photo is ~2 MB; anything past this is not a photo. */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export const daprImageLoader: ImageLoader = async (ctx, fileIds) => {
  const images: Uint8Array[] = [];
  for (const fileId of fileIds) {
    // Typed by the contract, and still checked: a missing url here would
    // otherwise surface as an opaque fetch error naming neither the file nor
    // the seam.
    const target: Partial<ReadTarget> | null = await internal(ctx)(
      FileActorDescriptor,
      fileId,
    ).presignReadInternal();

    const url: unknown = target?.url;
    if (typeof url !== "string" || url === "") {
      throw new ConflictError(
        `FileActor(${fileId}).presignReadInternal returned no url; the AI seam ` +
          "cannot read this image",
      );
    }
    // Cheap, and it converts the one remaining way to get this wrong from an
    // opaque socket error into a sentence naming both network positions.
    const mismatch = describeAuthorityMismatch(url);
    if (mismatch !== undefined) {
      throw new ConflictError(`${mismatch} (file ${fileId}, AI image loader)`);
    }
    images.push(await download(url, fileId));
  }
  return images;
};

/**
 * A presigned GET, with the three assertions this module's header lists.
 *
 * Exported for `images.test.ts`, which stubs `fetch` around it: the loader
 * above needs a sidecar to reach `FileActor` at all, so the download is only
 * testable on its own.
 */
export const download = async (
  url: string,
  fileId: string,
): Promise<Uint8Array> => {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ConflictError(
      `could not download file ${fileId} for the AI seam: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!response.ok) {
    throw new ConflictError(
      `downloading file ${fileId} for the AI seam failed (${response.status})`,
    );
  }

  /*
   * The cap is asked of the *declared* length first.
   *
   * `arrayBuffer()` allocates the entire body before it resolves, so a limit
   * checked only afterwards is a limit on bytes that are already in this
   * process — it reports the overrun, it does not prevent it. MinIO sends
   * `Content-Length` on every GET of a stored object, so this is the branch
   * that actually runs against the deployment this code has.
   *
   * The check after the read stays, as the backstop for a response that
   * declares nothing (a chunked proxy) or declares wrongly. Reaching it still
   * means the bytes were buffered; that is the residual case, not the normal
   * one, and closing it properly means streaming the body with a running
   * total, which is a lot of machinery for a path where the header is always
   * present.
   */
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
    throw tooBig(fileId, declared, " (from its Content-Length, unread)");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new ConflictError(`file ${fileId} is empty`);
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw tooBig(fileId, bytes.byteLength, "");
  }

  /*
   * A 200 is not a promise that what came back is a picture.
   *
   * This is the failure mode the AI seams cannot diagnose from the far end: a
   * presigned GET that answers 200 with an XML fault, an HTML error page or a
   * proxy's interstitial produces bytes, those bytes go to a vision model, and
   * the model answers 400. The model's refusal is *correct* and it is about
   * the request it was given, so the error an operator reads names the model
   * and the status and nothing about the download that actually failed —
   * measured on the running Ollama, an S3-style `<Error>` document comes back
   * as the identical `Failed to load image or audio file` a corrupt JPEG does.
   *
   * `detectImageMime` is the one sniffer in this repository and it is the same
   * call `FileActor.verify` makes on upload, so this asks nothing new of the
   * bytes — it asks it at the one point where the URL is still in scope and
   * can be named. Which format is *acceptable* is still the provider's
   * question, asked against its own list; this one is only "is it an image".
   *
   * `ValidationError`, so the outbox dead-letters on the first attempt
   * (`image-mime.ts`): a stored object that is not an image does not become
   * one on the ninth retry, and neither does a path that rewrites it.
   */
  if (detectImageMime(bytes) === null) {
    throw new ValidationError(
      `file ${fileId} did not download as an image: ${bytes.byteLength} ` +
        `bytes from ${origin(url)} matching no known image signature. A ` +
        "presigned GET can answer 200 with an error document, and sending " +
        "that to a vision model produces a refusal that describes the model " +
        "rather than this. Nothing is sent.",
    );
  }
  return bytes;
};

const tooBig = (
  fileId: string,
  byteLength: number,
  how: string,
): ConflictError =>
  new ConflictError(
    `file ${fileId} is ${byteLength} bytes${how}, over the ` +
      `${MAX_IMAGE_BYTES}-byte limit for an AI image`,
  );

/**
 * The authority, for an error message — never the signature query string.
 *
 * `URL.canParse` rather than a `try`/`catch`, because `no-silent-fallback.test.ts`
 * reads every catch clause in this directory and requires it to rethrow. That
 * rule is about swallowed *failures*; this is a formatting question with a
 * total answer, and expressing it as a predicate keeps the rule absolute
 * instead of adding the first exception to it.
 */
const origin = (url: string): string =>
  URL.canParse(url) ? new URL(url).origin : "an unparseable URL";

/** `[a, null, b]` → `[a, b]`, preserving order. */
export const presentIds = (
  ...ids: readonly (string | null | undefined)[]
): string[] =>
  ids.filter((id): id is string => typeof id === "string" && id !== "");
