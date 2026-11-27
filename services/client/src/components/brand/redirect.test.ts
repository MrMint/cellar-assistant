import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { brandsRedirectHref } from "./redirect";

describe("/brands redirect (L37)", () => {
  test("opens search with Brands, keeping the term", () => {
    assert.equal(brandsRedirectHref(undefined), "/search?in=brands");
    assert.equal(brandsRedirectHref("  "), "/search?in=brands");
    assert.equal(
      brandsRedirectHref(["Demo Brewing", "x"]),
      "/search?in=brands&q=Demo+Brewing",
    );
  });
});
