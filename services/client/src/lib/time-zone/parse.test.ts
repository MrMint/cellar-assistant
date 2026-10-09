import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseTimeZoneCookie } from "./parse.ts";

describe("parseTimeZoneCookie (X04)", () => {
  test("takes IANA names, encoded or not", () => {
    assert.equal(parseTimeZoneCookie("America/Chicago"), "America/Chicago");
    assert.equal(
      parseTimeZoneCookie("America%2FArgentina%2FBuenos_Aires"),
      "America/Argentina/Buenos_Aires",
    );
    assert.equal(parseTimeZoneCookie("UTC"), "UTC");
    assert.equal(parseTimeZoneCookie("Etc/GMT+5"), "Etc/GMT+5");
  });

  test("refuses anything else", () => {
    assert.equal(parseTimeZoneCookie(undefined), null);
    assert.equal(parseTimeZoneCookie(""), null);
    assert.equal(parseTimeZoneCookie("<script>"), null);
    assert.equal(parseTimeZoneCookie("a/b/c/d"), null);
    assert.equal(parseTimeZoneCookie("%E0%A4%A"), null);
    assert.equal(parseTimeZoneCookie(`A/${"x".repeat(80)}`), null);
  });
});
