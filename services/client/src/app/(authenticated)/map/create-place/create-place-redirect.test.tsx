/**
 * FS-1: Add a place without a pin (the capture sheets' "Add a place" link)
 * opens the sheet over the live map, instead of dropping the person on the
 * map with nothing open.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";

class Redirect extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}
mock.module("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/map/create-place",
  useSearchParams: () => new URLSearchParams(),
}));

const { default: CreatePlacePage } = await import("./page");

const redirectOf = async (params: Record<string, string>) => {
  try {
    await CreatePlacePage({ searchParams: Promise.resolve(params) });
  } catch (error) {
    if (error instanceof Redirect) return error.to;
    throw error;
  }
  return null;
};

describe("/map/create-place without a pin (FS-1)", () => {
  test("opens the Add a place sheet on the map", async () => {
    assert.equal(await redirectOf({}), "/map?add=1");
  });
  test("a pin still opens the form at it", async () => {
    assert.equal(await redirectOf({ lat: "43.07", lng: "-89.4" }), null);
  });
});
