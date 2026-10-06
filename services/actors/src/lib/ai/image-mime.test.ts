/**
 * Image media types, decided from bytes.
 *
 * This exists because `gemini.ts` labelled **every** image `image/jpeg` from a
 * flat constant, and that is now the deployed path
 * (`docs/architecture/e4-decisions.md` §12). Gemini decodes according to the
 * `mime_type` it is told rather than sniffing, and `files.mime_type` is
 * client-supplied and unvalidated (`FileActor.create` stores
 * `input.contentType ?? null` with no allow-list anywhere), so the bytes are
 * the only trustworthy source.
 *
 * One case per format, plus the refusals — a fixture-free suite: every header
 * below is written out as the bytes the format specifies.
 */
import { ValidationError } from "@cellar-assistant/contracts";
import { describe, expect, it } from "vitest";
import { geminiBody } from "./gemini.ts";
import {
  describeImages,
  detectImageMime,
  GEMINI_IMAGE_MIMES,
  type ImageMime,
  OLLAMA_IMAGE_MIMES,
  OPENAI_IMAGE_MIMES,
  requireImageMime,
} from "./image-mime.ts";

/** A header followed by filler, so nothing depends on a short array. */
const withHeader = (...header: number[]): Uint8Array =>
  new Uint8Array([...header, ...new Array(32).fill(0x00)]);

const ascii = (text: string): number[] =>
  Array.from(text, (character) => character.charCodeAt(0));

/** An ISO base-media header carrying `brand`: 4 size bytes, `ftyp`, brand. */
const isoWithBrand = (brand: string): Uint8Array =>
  withHeader(0x00, 0x00, 0x00, 0x20, ...ascii("ftyp"), ...ascii(brand));

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("detectImageMime — one case per format", () => {
  const cases: readonly {
    name: string;
    bytes: Uint8Array;
    expected: ImageMime;
  }[] = [
    // The fourth byte is a segment marker and varies; both are real JPEGs.
    {
      name: "JPEG/JFIF",
      bytes: withHeader(0xff, 0xd8, 0xff, 0xe0),
      expected: "image/jpeg",
    },
    {
      name: "JPEG/Exif",
      bytes: withHeader(0xff, 0xd8, 0xff, 0xe1),
      expected: "image/jpeg",
    },
    { name: "PNG", bytes: withHeader(...PNG_SIGNATURE), expected: "image/png" },
    {
      name: "GIF87a",
      bytes: withHeader(...ascii("GIF87a")),
      expected: "image/gif",
    },
    {
      name: "GIF89a",
      bytes: withHeader(...ascii("GIF89a")),
      expected: "image/gif",
    },
    {
      name: "WebP",
      // "RIFF" + 4 size bytes + "WEBP".
      bytes: withHeader(
        ...ascii("RIFF"),
        0x1a,
        0x00,
        0x00,
        0x00,
        ...ascii("WEBP"),
      ),
      expected: "image/webp",
    },
    {
      name: "HEIC (heic)",
      bytes: isoWithBrand("heic"),
      expected: "image/heic",
    },
    {
      name: "HEIC (heix)",
      bytes: isoWithBrand("heix"),
      expected: "image/heic",
    },
    {
      name: "HEIF (mif1)",
      bytes: isoWithBrand("mif1"),
      expected: "image/heif",
    },
    { name: "AVIF", bytes: isoWithBrand("avif"), expected: "image/avif" },
    { name: "BMP", bytes: withHeader(...ascii("BM")), expected: "image/bmp" },
    {
      name: "TIFF little-endian",
      bytes: withHeader(0x49, 0x49, 0x2a, 0x00),
      expected: "image/tiff",
    },
    {
      name: "TIFF big-endian",
      bytes: withHeader(0x4d, 0x4d, 0x00, 0x2a),
      expected: "image/tiff",
    },
  ];

  for (const testCase of cases) {
    it(`identifies ${testCase.name}`, () => {
      expect(detectImageMime(testCase.bytes)).toBe(testCase.expected);
    });
  }

  it("returns null rather than a default for bytes it does not know", () => {
    // The whole point. A default here is the bug this module replaced.
    expect(detectImageMime(withHeader(1, 2, 3, 4))).toBeNull();
    expect(detectImageMime(new Uint8Array([]))).toBeNull();
    expect(detectImageMime(new Uint8Array([0xff]))).toBeNull();
  });

  it("does not mistake a truncated PNG signature for a PNG", () => {
    // The old sniffer checked four bytes; the full eight catch a corrupting
    // transfer, and cost nothing.
    expect(
      detectImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
    ).toBeNull();
  });

  it("does not mistake a bare RIFF container for WebP", () => {
    // A .wav is RIFF too. Without the WEBP tag at byte 8 this is not an image.
    const wav = withHeader(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE"));
    expect(detectImageMime(wav)).toBeNull();
  });

  it("does not claim an unknown ISO brand", () => {
    // `ftyp` + `mp42` is a video container, not a still.
    expect(detectImageMime(isoWithBrand("mp42"))).toBeNull();
  });
});

describe("requireImageMime refuses rather than mislabelling", () => {
  it("returns the type when it is accepted", () => {
    expect(
      requireImageMime(withHeader(...PNG_SIGNATURE), GEMINI_IMAGE_MIMES, "w"),
    ).toBe("image/png");
  });

  it("throws a ValidationError, not a ConflictError, on unidentifiable bytes", () => {
    // ValidationError dead-letters on the first attempt; ConflictError makes the
    // outbox retry. No retry turns these bytes into an image.
    const act = () =>
      requireImageMime(withHeader(9, 9, 9, 9), GEMINI_IMAGE_MIMES, "seam x");
    expect(act).toThrowError(ValidationError);
    expect(act).toThrowError(/could not be identified/i);
  });

  it("names where it happened, and the bytes, without dumping the image", () => {
    const bytes = new Uint8Array([
      0xde,
      0xad,
      0xbe,
      0xef,
      ...new Array(9999).fill(7),
    ]);
    try {
      requireImageMime(bytes, GEMINI_IMAGE_MIMES, "vertex-ai image 2 of 3");
      expect.unreachable("should have thrown");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain("vertex-ai image 2 of 3");
      expect(message).toContain("de ad be ef");
      // A magic-number preview, not user content: these are menu photos.
      expect(message.length).toBeLessThan(800);
    }
  });

  it("refuses a recognised format the provider does not take, naming it", () => {
    // Gemini's documented set excludes GIF, so this fails here rather than as
    // an opaque 400 from Google.
    const act = () =>
      requireImageMime(
        withHeader(...ascii("GIF89a")),
        GEMINI_IMAGE_MIMES,
        "vertex-ai",
      );
    expect(act).toThrowError(/image\/gif, which this provider does not accept/);
    expect(act).toThrowError(ValidationError);
  });

  it("accepts GIF on the OpenAI-compatible path, which does take it", () => {
    expect(
      requireImageMime(withHeader(...ascii("GIF89a")), OPENAI_IMAGE_MIMES, "w"),
    ).toBe("image/gif");
  });

  it("splits HEIC deliberately: Gemini takes it, a local server may not", () => {
    const heic = isoWithBrand("heic");
    // An iPhone photo. Documented by Google; needs pillow-heif locally, which
    // is not installed by default — so it fails loudly in dev, not in prod.
    expect(requireImageMime(heic, GEMINI_IMAGE_MIMES, "w")).toBe("image/heic");
    expect(() => requireImageMime(heic, OPENAI_IMAGE_MIMES, "w")).toThrowError(
      /image\/heic, which this provider does not accept/,
    );
  });

  it("takes BMP on the ollama path and refuses TIFF and HEIC, as measured", () => {
    // ollama 0.34.1 / gemma3:4b, 2026-09-18, one 64×64 image per format:
    // BMP 200, TIFF 400, HEIC 400 — Go's standard library plus `x/image`
    // covers BMP and WebP and covers neither TIFF nor HEIC. Both refusals
    // arrive as the same `Failed to load image or audio file`, so the list is
    // what separates them.
    expect(
      requireImageMime(withHeader(...ascii("BM")), OLLAMA_IMAGE_MIMES, "w"),
    ).toBe("image/bmp");
    expect(() =>
      requireImageMime(
        withHeader(0x49, 0x49, 0x2a, 0x00),
        OLLAMA_IMAGE_MIMES,
        "w",
      ),
    ).toThrowError(/image\/tiff, which this provider does not accept/);
    expect(() =>
      requireImageMime(isoWithBrand("heic"), OLLAMA_IMAGE_MIMES, "w"),
    ).toThrowError(/image\/heic, which this provider does not accept/);
  });

  it("is its own list, not a copy of the OpenAI one", () => {
    // BMP is in one and not the other, deliberately. A reader who assumes
    // they are the same list will widen the wrong one.
    expect(OLLAMA_IMAGE_MIMES).toContain("image/bmp");
    expect(OPENAI_IMAGE_MIMES).not.toContain("image/bmp");
  });
});

describe("describeImages — what was actually sent", () => {
  it("gives a count, a byte length and a detected format per image", () => {
    expect(
      describeImages([
        withHeader(...PNG_SIGNATURE),
        withHeader(0xff, 0xd8, 0xff, 0xe0),
      ]),
    ).toBe(
      "2 images — image 1: 40 bytes, image/png; image 2: 36 bytes, image/jpeg",
    );
  });

  it("falls back to the signature when nothing is recognised", () => {
    // The case this exists for: a downloaded error document, which otherwise
    // reaches an operator as the model's own complaint about a bad image.
    expect(describeImages([new Uint8Array([0x3c, 0x68, 0x74, 0x6d])])).toMatch(
      /image 1: 4 bytes, no format recognised \(starts with 3c 68 74 6d\)/,
    );
  });

  it("says so rather than producing an empty sentence", () => {
    expect(describeImages([])).toBe("no images");
  });
});

describe("geminiBody labels each image from its own bytes", () => {
  it("does not apply one media type to every image", () => {
    // The regression under test: a flat `image/jpeg` for the whole request.
    const body = geminiBody(
      {
        prompt: "read these",
        images: [
          withHeader(...PNG_SIGNATURE),
          withHeader(0xff, 0xd8, 0xff, 0xe0),
          withHeader(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")),
        ],
      },
      "vertex-ai",
    ) as {
      contents: {
        parts: { inline_data?: { mime_type: string } }[];
      }[];
    };

    const types = body.contents[0]?.parts
      .map((part) => part.inline_data?.mime_type)
      .filter((value): value is string => value !== undefined);
    expect(types).toEqual(["image/png", "image/jpeg", "image/webp"]);
  });

  it("keeps the prompt as the first part, ahead of the images", () => {
    const body = geminiBody(
      { prompt: "hello", images: [withHeader(...PNG_SIGNATURE)] },
      "google-ai",
    ) as { contents: { parts: { text?: string }[] }[] };
    expect(body.contents[0]?.parts[0]?.text).toBe("hello");
  });

  it("refuses the whole request when one image is unidentifiable", () => {
    // Partial success would mean a menu scan built from some of its pages.
    expect(() =>
      geminiBody(
        {
          prompt: "p",
          images: [withHeader(...PNG_SIGNATURE), withHeader(1, 2, 3)],
        },
        "vertex-ai",
      ),
    ).toThrowError(/image 2 of 2/);
  });

  it("still works with no images at all", () => {
    const body = geminiBody({ prompt: "text only" }, "vertex-ai") as {
      contents: { parts: unknown[] }[];
    };
    expect(body.contents[0]?.parts).toHaveLength(1);
  });
});
