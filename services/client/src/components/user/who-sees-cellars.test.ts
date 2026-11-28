import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { whoWord } from "./WhoSeesCellars";

describe("whoWord (the Who sees your cellars row)", () => {
  test("the one answer your cellars share", () => {
    assert.equal(whoWord(["PRIVATE", "PRIVATE"]), "Only me");
    assert.equal(whoWord(["PUBLIC"]), "Everyone");
  });
  test("Varies when they differ; Friends when you have none", () => {
    assert.equal(whoWord(["PRIVATE", "FRIENDS"]), "Varies");
    assert.equal(whoWord([]), "Friends");
  });
});
