import { afterEach, describe, mock, test } from "bun:test";
import assert from "node:assert/strict";

const NOT_FOUND = "NEXT_HTTP_ERROR_FALLBACK;404";
let connected = 0;

mock.module("next/server", () => ({
  connection: async () => {
    connected += 1;
  },
}));
mock.module("next/navigation", () => ({
  notFound: () => {
    throw Object.assign(new Error(NOT_FOUND), { digest: NOT_FOUND });
  },
}));
mock.module("@/components/app/kit-gallery", () => ({
  KitGallery: () => null,
}));

const { default: KitPage } = await import("./page");
const { kitPageEnabled } = await import("./enabled");

const saved = process.env.CELLAR_KIT_PAGE;
afterEach(() => {
  if (saved === undefined) delete process.env.CELLAR_KIT_PAGE;
  else process.env.CELLAR_KIT_PAGE = saved;
});

describe("/kit", () => {
  test("a 404 unless CELLAR_KIT_PAGE is 1, after connection()", async () => {
    delete process.env.CELLAR_KIT_PAGE;
    const before = connected;
    await assert.rejects(KitPage(), (error: { digest?: string }) => {
      assert.equal(error.digest, NOT_FOUND);
      return true;
    });
    assert.equal(connected, before + 1);
    process.env.CELLAR_KIT_PAGE = "true";
    await assert.rejects(KitPage());
  });

  test("renders the gallery when CELLAR_KIT_PAGE=1", async () => {
    process.env.CELLAR_KIT_PAGE = "1";
    const before = connected;
    const element = await KitPage();
    assert.ok(element !== null && typeof element === "object");
    assert.equal(connected, before + 1);
  });

  test("the flag is exactly 1", () => {
    assert.equal(kitPageEnabled({ CELLAR_KIT_PAGE: "1" }), true);
    assert.equal(kitPageEnabled({ CELLAR_KIT_PAGE: "0" }), false);
    assert.equal(kitPageEnabled({ CELLAR_KIT_PAGE: "yes" }), false);
    assert.equal(kitPageEnabled({}), false);
  });
});
