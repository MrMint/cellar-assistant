/**
 * F-108: who a recipe share link opens for. A friends-only recipe opens for
 * its author's friends, so only the author may be told "your friends".
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { recipeShareSubtitle } from "./RecipeShare";

describe("recipeShareSubtitle", () => {
  test("public: anyone with the link", () => {
    assert.equal(recipeShareSubtitle("PUBLIC"), "Share · anyone with the link");
  });

  test("friends-only, shared by its author: your friends", () => {
    assert.equal(
      recipeShareSubtitle("FRIENDS", { isOwner: true }),
      "Share · your friends can open it",
    );
  });

  test("friends-only, shared by someone else: the author's friends", () => {
    assert.equal(
      recipeShareSubtitle("FRIENDS", { isOwner: false, authorName: "Sam" }),
      "Share · Sam’s friends can open it",
    );
    assert.equal(
      recipeShareSubtitle("FRIENDS", { isOwner: false }),
      "Share · the author’s friends can open it",
    );
  });
});
