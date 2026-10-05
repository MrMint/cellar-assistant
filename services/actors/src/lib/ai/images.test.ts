/**
 * The download half of the AI image path.
 *
 * Both behaviours asserted here were written after 2026-09-18, when thirteen
 * `MenuScanActor.process` rows dead-lettered reading
 * `ollama … failed (400) … Failed to load image or audio file` — a sentence
 * about the *model*, for a failure that could equally have been about the
 * download. Nothing on the path could tell those two apart, so a real
 * investigation began by ruling out the transport.
 *
 * No sidecar and no MinIO: `download` is exported for exactly this, and
 * `fetch` is stubbed. `daprImageLoader` around it is a presign plus this.
 */
import { ConflictError, ValidationError } from "@cellar-assistant/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { download } from "./images.ts";

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
]);

const URL_ = "http://minio:9000/cellar-files/menu-scan/abc?X-Amz-Signature=xyz";

/** A `Response` with only the three members `download` touches. */
const reply = (options: {
  bytes?: Uint8Array;
  contentLength?: string | null;
  status?: number;
}): { response: unknown; arrayBuffer: ReturnType<typeof vi.fn> } => {
  const bytes = options.bytes ?? PNG;
  const arrayBuffer = vi.fn(async () => bytes.slice().buffer);
  return {
    arrayBuffer,
    response: {
      ok: (options.status ?? 200) < 400,
      status: options.status ?? 200,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-length"
            ? (options.contentLength ?? String(bytes.byteLength))
            : null,
      },
      arrayBuffer,
    },
  };
};

const stub = (response: unknown): void => {
  vi.stubGlobal("fetch", async () => response);
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("download", () => {
  it("returns the bytes of something that is actually an image", async () => {
    const { response } = reply({});
    stub(response);
    expect(await download(URL_, "file-1")).toEqual(PNG);
  });

  it("refuses an oversized body from its Content-Length, without reading it", async () => {
    // The ordering is the point. `arrayBuffer()` allocates the whole body
    // before it resolves, so a cap applied to its result reports an overrun
    // it has already suffered.
    const { response, arrayBuffer } = reply({
      contentLength: String(21 * 1024 * 1024),
    });
    stub(response);
    await expect(download(URL_, "file-1")).rejects.toThrowError(
      /over the .* limit/,
    );
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("still catches an oversized body that declares no length", async () => {
    // The backstop, for a chunked proxy or a response that lies.
    const big = new Uint8Array(21 * 1024 * 1024);
    big.set(PNG);
    const { response } = reply({ bytes: big, contentLength: null });
    stub(response);
    await expect(download(URL_, "file-1")).rejects.toThrowError(
      /over the .* limit/,
    );
  });

  it("refuses a 200 that is not an image, naming where it came from", async () => {
    // A presigned GET can answer 200 with an error document. Sent to a vision
    // model those bytes produce a refusal that describes the model, which is
    // the misleading error this check exists to pre-empt.
    const xml = new TextEncoder().encode(
      '<?xml version="1.0"?><Error><Code>AccessDenied</Code></Error>',
    );
    const { response } = reply({ bytes: xml });
    stub(response);
    const error = await download(URL_, "file-1").catch((thrown: unknown) =>
      thrown instanceof Error ? thrown.message : String(thrown),
    );
    expect(error).toMatch(/did not download as an image/);
    // The authority, so the two network positions can be told apart — and
    // never the signature query string.
    expect(error).toMatch(/http:\/\/minio:9000/);
    expect(error).not.toMatch(/X-Amz-Signature/);
  });

  it("dead-letters a non-image rather than retrying it", async () => {
    // `image-mime.ts`'s rule: a `ValidationError` dies on the first attempt.
    // A stored object that is not an image does not become one on the ninth.
    const { response } = reply({ bytes: new TextEncoder().encode("nope") });
    stub(response);
    await expect(download(URL_, "file-1")).rejects.toThrowError(
      ValidationError,
    );
  });

  it("keeps an empty body a retryable conflict, as it was", async () => {
    const { response } = reply({ bytes: new Uint8Array(0) });
    stub(response);
    await expect(download(URL_, "file-1")).rejects.toThrowError(ConflictError);
  });

  it("reports a non-ok status as a conflict, not as a bad image", async () => {
    const { response } = reply({ status: 403 });
    stub(response);
    await expect(download(URL_, "file-1")).rejects.toThrowError(/failed \(403/);
  });
});
