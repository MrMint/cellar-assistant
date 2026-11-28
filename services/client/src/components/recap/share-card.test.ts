/**
 * L16 — a recap card is shared as a file with no URL and no text, and falls
 * back to a download where Web Share cannot take files.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  recapFileName,
  type ShareEnvironment,
  shareRecapImage,
} from "./share-card";

const png = () =>
  Promise.resolve(
    new Response(new Uint8Array([137, 80, 78, 71]), {
      status: 200,
      headers: { "content-type": "image/png" },
    }),
  );

const env = (
  navigator: ShareEnvironment["navigator"],
  fetch: ShareEnvironment["fetch"] = png,
) => {
  const downloads: File[] = [];
  return {
    downloads,
    value: {
      fetch,
      navigator,
      download: (file: File) => downloads.push(file),
    } satisfies ShareEnvironment,
  };
};

describe("shareRecapImage", () => {
  test("shares only a file: no url, no text", async () => {
    const shared: ShareData[] = [];
    const { value, downloads } = env({
      canShare: () => true,
      share: async (data) => {
        shared.push(data);
      },
    });
    const outcome = await shareRecapImage(
      "/api/recap/x/2026-10/0",
      "a.png",
      value,
    );
    assert.equal(outcome, "shared");
    assert.equal(downloads.length, 0);
    assert.equal(shared.length, 1);
    const data = shared[0] ?? {};
    assert.deepEqual(Object.keys(data), ["files"]);
    assert.equal(data.files?.[0]?.name, "a.png");
    assert.equal(data.files?.[0]?.type, "image/png");
  });

  test("falls back to a download without Web Share", async () => {
    const { value, downloads } = env(undefined);
    assert.equal(await shareRecapImage("/x", "a.png", value), "downloaded");
    assert.equal(downloads[0]?.name, "a.png");
  });

  test("falls back to a download when files cannot be shared", async () => {
    const { value, downloads } = env({
      canShare: () => false,
      share: async () => assert.fail("must not share"),
    });
    assert.equal(await shareRecapImage("/x", "a.png", value), "downloaded");
    assert.equal(downloads.length, 1);
  });

  test("a dismissed share sheet downloads nothing", async () => {
    const { value, downloads } = env({
      canShare: () => true,
      share: async () => {
        throw new DOMException("dismissed", "AbortError");
      },
    });
    assert.equal(await shareRecapImage("/x", "a.png", value), "cancelled");
    assert.equal(downloads.length, 0);
  });

  test("a refused image is a failure, not an empty file", async () => {
    const { value, downloads } = env(undefined, () =>
      Promise.resolve(new Response("Not found", { status: 404 })),
    );
    assert.equal(await shareRecapImage("/x", "a.png", value), "failed");
    assert.equal(downloads.length, 0);
  });

  test("names the file by period and card", () => {
    assert.equal(recapFileName("2026-10", 0), "cellar-recap-2026-10-1.png");
  });
});
