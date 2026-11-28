/**
 * Where the phone's tab bar shows (F-170, FR-2 / H-65): the Search boards
 * draw the tab bar on /search, so the shell keeps it there. It still steps
 * aside for capture and the full-screen routes.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { contentLayout } from "./AppShell";

describe("the tab bar", () => {
  test("shows on /search (the board wins)", () => {
    assert.equal(contentLayout("/search").tabBar, true);
    assert.equal(contentLayout("/").tabBar, true);
  });
  test("steps aside for capture and full-screen routes", () => {
    assert.equal(contentLayout("/add").tabBar, false);
    assert.equal(contentLayout("/recap").tabBar, false);
    assert.equal(contentLayout("/recipes/r1/make").tabBar, false);
  });
});
