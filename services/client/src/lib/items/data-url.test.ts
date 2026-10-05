import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { dataUrlToFile } from "./data-url.ts";

describe("dataUrlToFile", () => {
  test("decodes a base64 JPEG capture into a File with its type", async () => {
    const bytes = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
    const url = `data:image/jpeg;base64,${btoa(String.fromCharCode(...bytes))}`;
    const file = dataUrlToFile(url, "front-label.jpg");
    assert.ok(file !== null);
    assert.equal(file.name, "front-label.jpg");
    assert.equal(file.type, "image/jpeg");
    assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], bytes);
  });

  test("refuses what is not a base64 data URL", () => {
    assert.equal(dataUrlToFile("https://example.com/a.jpg", "a.jpg"), null);
    assert.equal(dataUrlToFile("data:image/jpeg,plain", "a.jpg"), null);
    assert.equal(dataUrlToFile("data:image/jpeg;base64,", "a.jpg"), null);
    assert.equal(dataUrlToFile("data:image/jpeg;base64,***", "a.jpg"), null);
  });
});
