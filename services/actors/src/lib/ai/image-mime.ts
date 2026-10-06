/**
 * What an image actually is, decided from its bytes.
 *
 * ## Why this is not read off the file row
 *
 * `FileActor.create` stores `mimeType: input.contentType ?? null` — a string
 * the *client* supplied, with no allow-list and no validation anywhere in the
 * upload path. So `files.mimeType` records what an uploader claimed, which is
 * not evidence. The four vision seams are handed `files.id` values and
 * `images.ts` turns them into bytes; the bytes are the only trustworthy source,
 * and this module is the one place they are interpreted.
 *
 * ## Why guessing is worse than failing
 *
 * `gemini.ts` used to declare a flat `const IMAGE_MIME = "image/jpeg"` and
 * label every image with it. Gemini does not ignore `mime_type` — it decodes
 * according to it — so a PNG or an iPhone HEIC announced as JPEG is either
 * rejected with an opaque upstream error or decoded wrongly, and this is now
 * the **deployed** path (`docs/architecture/e4-decisions.md` §12). A
 * mislabelled image that *nearly* works is the silent-wrong-answer shape this
 * whole directory is written against, so an unidentifiable or unsupported
 * image raises instead.
 *
 * ## `ValidationError`, not `ConflictError`
 *
 * The rest of this directory raises `ConflictError` because a missing
 * credential is a deployment state that a retry might resolve, and the outbox
 * should retry rather than dead-letter (`config.ts`). This is the opposite
 * case: no number of retries turns a TIFF into something Gemini accepts. A
 * `ValidationError` dead-letters on the first attempt, which is the honest
 * outcome for input that will never become acceptable.
 */
import { ValidationError } from "@cellar-assistant/contracts";

export type ImageMime =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "image/heic"
  | "image/heif"
  | "image/avif"
  | "image/bmp"
  | "image/tiff";

/**
 * Gemini's documented image set, and therefore what `vertex-ai` and
 * `google-ai` accept. Notably **excludes GIF**, which several other vision
 * APIs take — so a GIF is refused here rather than sent and 400'd upstream.
 */
export const GEMINI_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const satisfies readonly ImageMime[];

/**
 * What an OpenAI-compatible vision server can be relied on to decode. This is
 * a deliberate common denominator rather than any one server's maximum: vLLM
 * and llama-server decode through Pillow and would manage BMP and TIFF, but
 * **HEIC needs `pillow-heif` installed** and silently is not there by default.
 *
 * The asymmetry with `GEMINI_IMAGE_MIMES` is real and intentional: an iPhone
 * HEIC photo works on the deployed path and is refused on the local one. That
 * is a loud, named failure in development rather than a surprise in
 * production, which is the right way round.
 */
export const OPENAI_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const satisfies readonly ImageMime[];

/**
 * What Ollama's own `/api/chat` decodes — **measured**, not inferred from the
 * other two lists.
 *
 * Probed against ollama 0.34.1 / `gemma3:4b` on 2026-09-18, one 64×64 image
 * per format, `POST /api/chat` with `images: [base64]`:
 *
 *   JPEG 200 · PNG 200 · GIF 200 · WebP 200 (lossy *and* lossless) · BMP 200
 *   TIFF **400** · HEIC **400**
 *
 * Both refusals come back as the same sentence — `Failed to load image or
 * audio file` — which says nothing about the format, so they are refused here
 * instead. That matters most for HEIC: an iPhone photo is HEIC by default, so
 * without this check the single most likely real-world menu photo dies against
 * the local provider with an error naming neither the file nor the format.
 *
 * BMP is in and TIFF is out, which is why this is its own list rather than a
 * reuse of {@link OPENAI_IMAGE_MIMES}: Ollama decodes in Go, whose standard
 * library covers JPEG/PNG/GIF and whose `x/image` covers BMP and WebP, and
 * neither covers TIFF or HEIC. The overlap with the OpenAI list is a
 * coincidence of two servers, not a shared contract.
 *
 * Being on this list means Ollama can *decode* the container. It does not mean
 * every such file works: Go's decoders are strict about the pixel data too, so
 * a file with a valid signature and a truncated raster is refused with that
 * same sentence. Nothing short of decoding catches that, which is why
 * `ollama.ts` says what it sent when the model refuses.
 */
export const OLLAMA_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
] as const satisfies readonly ImageMime[];

/** ASCII bytes of `text`, compared at `offset`. */
const matchesAscii = (
  bytes: Uint8Array,
  offset: number,
  text: string,
): boolean => {
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
};

const matchesBytes = (
  bytes: Uint8Array,
  offset: number,
  expected: readonly number[],
): boolean => {
  for (let i = 0; i < expected.length; i += 1) {
    if (bytes[offset + i] !== expected[i]) return false;
  }
  return true;
};

/**
 * ISO base-media brands, read from bytes 8-11 after an `ftyp` box.
 *
 * HEIC and HEIF are the same container with different brands, and an iPhone
 * emits several of them depending on capture mode — which is exactly why a
 * brand table beats matching one string.
 */
const ISO_BRANDS: Readonly<Record<string, ImageMime>> = {
  heic: "image/heic",
  heix: "image/heic",
  heim: "image/heic",
  heis: "image/heic",
  hevc: "image/heic",
  hevm: "image/heic",
  hevs: "image/heic",
  hevx: "image/heic",
  mif1: "image/heif",
  msf1: "image/heif",
  avif: "image/avif",
  avis: "image/avif",
};

/**
 * The format, or `null` when the bytes match nothing known.
 *
 * Deliberately returns `null` rather than a default. A caller that wants a
 * default has to write it down; `requireImageMime` is what production uses and
 * it has none.
 */
export const detectImageMime = (bytes: Uint8Array): ImageMime | null => {
  // JPEG: FF D8 FF. The fourth byte varies by segment marker (E0/E1/DB/...).
  if (matchesBytes(bytes, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";

  // PNG: the full 8-byte signature, not just the first four — the trailing
  // CRLF/EOF bytes are there to catch corrupting transfers and are free to check.
  if (
    matchesBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return "image/png";
  }

  // GIF87a / GIF89a.
  if (matchesAscii(bytes, 0, "GIF8")) return "image/gif";

  // WebP is a RIFF container: "RIFF" ---- "WEBP".
  if (matchesAscii(bytes, 0, "RIFF") && matchesAscii(bytes, 8, "WEBP")) {
    return "image/webp";
  }

  // HEIC / HEIF / AVIF: an ISO base-media file whose second box is `ftyp`.
  if (matchesAscii(bytes, 4, "ftyp")) {
    let brand = "";
    for (let i = 8; i < 12; i += 1) {
      const byte = bytes[i];
      if (byte === undefined) return null;
      brand += String.fromCharCode(byte);
    }
    return ISO_BRANDS[brand] ?? null;
  }

  if (matchesAscii(bytes, 0, "BM")) return "image/bmp";

  // TIFF, little- and big-endian. Also what some scanners emit for a "photo".
  if (
    matchesBytes(bytes, 0, [0x49, 0x49, 0x2a, 0x00]) ||
    matchesBytes(bytes, 0, [0x4d, 0x4d, 0x00, 0x2a])
  ) {
    return "image/tiff";
  }

  return null;
};

/**
 * The format, or a `ValidationError` naming what was found and what is taken.
 *
 * `where` identifies the image for an operator reading a dead-lettered job —
 * the seam plus the index, never the file's contents.
 */
export const requireImageMime = (
  bytes: Uint8Array,
  accepted: readonly ImageMime[],
  where: string,
): ImageMime => {
  const detected = detectImageMime(bytes);
  if (detected === null) {
    throw new ValidationError(
      `${where}: the image's format could not be identified from its bytes ` +
        `(starts with ${signature(bytes)}). ${accepted.join(", ")} are ` +
        "accepted. It is refused rather than labelled with a guess, because " +
        "the model decodes according to the media type it is told and a wrong " +
        "one either fails upstream with an opaque error or decodes to " +
        "something that is not the picture. Note `files.mime_type` is " +
        "client-supplied and unvalidated, so it is not consulted here.",
    );
  }
  if (!accepted.includes(detected)) {
    throw new ValidationError(
      `${where}: the image is ${detected}, which this provider does not ` +
        `accept. ${accepted.join(", ")} are accepted. Convert it before ` +
        "upload, or extend the provider's accepted set only if the server " +
        "genuinely decodes the format — mislabelling it is not a workaround.",
    );
  }
  return detected;
};

/**
 * What was actually put on the wire, for an error message.
 *
 * A provider that refuses an image tells you only that it refused it. The
 * thirteen dead `MenuScanActor.process` rows of 2026-09-18 all read
 * `Failed to load image or audio file` and nothing else — not which image, not
 * how big, not what format we thought it was. Every one of them was the same
 * 68-byte PNG whose pixel data is two bytes short of what its own header
 * declares, and any one of those three facts would have said so.
 *
 * Deliberately byte counts and formats only — never any of the content. The
 * twelve-byte signature {@link signature} falls back to is the same bound
 * `requireImageMime` works to, and for the same reason: these are user photos.
 */
export const describeImages = (images: readonly Uint8Array[]): string => {
  if (images.length === 0) return "no images";
  const described = images.map((bytes, index) => {
    const detected = detectImageMime(bytes);
    return (
      `image ${index + 1}: ${bytes.byteLength} bytes, ` +
      (detected ?? `no format recognised (starts with ${signature(bytes)})`)
    );
  });
  return `${images.length} image${images.length === 1 ? "" : "s"} — ${described.join("; ")}`;
};

/**
 * The first bytes, hex, for an error message.
 *
 * Twelve bytes: enough to show a magic number, far short of anything that
 * could reconstruct a menu photo or a wine label. `ollama.ts` records that the
 * Nhost provider logged whole prompts and responses, and that these images are
 * user content.
 */
const signature = (bytes: Uint8Array): string => {
  if (bytes.byteLength === 0) return "no bytes at all";
  const hex = Array.from(bytes.slice(0, 12))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
  return `${hex}${bytes.byteLength > 12 ? " …" : ""}`;
};
