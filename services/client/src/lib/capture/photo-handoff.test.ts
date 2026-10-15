import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  captureHrefWithPhoto,
  createPhotoHandoff,
  PHOTO_HANDOFF_LIMIT,
  PHOTO_HANDOFF_TTL_MS,
  photoTokenFrom,
} from "./photo-handoff.ts";

describe("photo hand-off (X06)", () => {
  test("a photo is taken once", () => {
    const store = createPhotoHandoff(() => 0);
    const token = store.put("data:image/jpeg;base64,AAA");
    assert.equal(store.has(token), true);
    assert.equal(store.take(token), "data:image/jpeg;base64,AAA");
    assert.equal(store.take(token), undefined);
    assert.equal(store.has(token), false);
  });

  test("a caller may name the token, case-insensitively", () => {
    const store = createPhotoHandoff(() => 0);
    const id = "3F2504E0-4F89-11D3-9A0C-0305E82C3301";
    assert.equal(store.put("p", id), id.toLowerCase());
    assert.equal(store.take(id), "p");
  });

  test("an unclaimed photo expires", () => {
    let clock = 0;
    const store = createPhotoHandoff(() => clock);
    const token = store.put("p");
    clock = PHOTO_HANDOFF_TTL_MS + 1;
    assert.equal(store.take(token), undefined);
  });

  test("only a few wait at once; the oldest goes first", () => {
    let n = 0;
    const mint = () => {
      n += 1;
      return `token-${n}aaaa`;
    };
    const store = createPhotoHandoff(() => 0, mint);
    const tokens = Array.from({ length: PHOTO_HANDOFF_LIMIT + 1 }, (_, i) =>
      store.put(`p${i}`),
    );
    assert.equal(store.has(tokens[0] ?? ""), false);
    assert.equal(store.take(tokens.at(-1) ?? ""), `p${PHOTO_HANDOFF_LIMIT}`);
  });

  test("?photo= is read only as a token this store could mint", () => {
    assert.equal(photoTokenFrom(undefined), undefined);
    assert.equal(photoTokenFrom(""), undefined);
    assert.equal(photoTokenFrom("../etc"), undefined);
    assert.equal(photoTokenFrom(["ABCDEF12-aa"]), "abcdef12-aa");
    assert.equal(
      photoTokenFrom("3f2504e0-4f89-11d3-9a0c-0305e82c3301"),
      "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    );
  });

  test("the hand-off link opens the capture surface in a mode", () => {
    assert.equal(
      captureHrefWithPhoto("menu", "abcdef12"),
      "/add?mode=menu&photo=abcdef12",
    );
  });
});
