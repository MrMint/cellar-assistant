/**
 * Shrink a photograph before it is embedded (G32).
 *
 * **Not a cost measure.** Measured on Vertex `gemini-embedding-2`
 * (2026-10-05): every image is billed as 258 tokens — a 512 px, a 1024 px and
 * a 3000 × 3000 px JPEG alike (`usageMetadata.promptTokensDetails`), so there
 * is no tiling to save. What it saves is the request: a 1 MB PNG became a
 * 58 KB JPEG, and that body goes base64 over the wire to the model on every
 * stored image and every search photo. Matching was unaffected on the same
 * run: cosine 0.96–0.98 between a photo and its downscaled self, the nearest
 * document the same for all six, its distance moving by at most 0.015.
 *
 * `Bun.Image` (Bun ≥ 1.4), which is what the actor host runs under in every
 * lane (`services/actors/Dockerfile`'s `CMD ["bun", …]`), so this adds no
 * dependency. It is looked up on `globalThis` rather than typed through
 * `bun-types`, which this package does not carry.
 *
 * Under Node (the Dockerfile's documented rollback `CMD`), or for a format
 * `Bun.Image` cannot decode, the original bytes go through unchanged and that
 * is logged: the model takes the original fine, so refusing would turn an
 * optimisation into an outage. The bytes have already passed
 * `detectImageMime` in the loader, so "cannot decode" here is a codec gap,
 * not a non-image.
 */

/** The long side, in pixels. */
export const EMBEDDING_IMAGE_MAX_SIDE = 768;

type BunImage = {
  metadata(): Promise<{ width: number; height: number }>;
  resize(
    width: number,
    height: number,
    options: { fit: "inside"; withoutEnlargement: boolean },
  ): BunImage;
  jpeg(options: { quality: number }): BunImage;
  bytes(): Promise<Uint8Array>;
};

type BunImageConstructor = new (bytes: Uint8Array) => BunImage;

const bunImage = (): BunImageConstructor | null => {
  const bun = (globalThis as { Bun?: { Image?: unknown } }).Bun;
  return typeof bun?.Image === "function"
    ? (bun.Image as BunImageConstructor)
    : null;
};

export const downscaleForEmbedding = async (
  bytes: Uint8Array,
  imageCtor: BunImageConstructor | null = bunImage(),
): Promise<Uint8Array> => {
  if (imageCtor === null) return bytes;
  try {
    const { width, height } = await new imageCtor(bytes).metadata();
    if (Math.max(width, height) <= EMBEDDING_IMAGE_MAX_SIDE) return bytes;
    return await new imageCtor(bytes)
      .resize(EMBEDDING_IMAGE_MAX_SIDE, EMBEDDING_IMAGE_MAX_SIDE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .bytes();
  } catch (error) {
    console.warn(
      "[image-downscale] could not downscale an image for embedding; sending " +
        "the original:",
      error instanceof Error ? error.message : error,
    );
    return bytes;
  }
};
