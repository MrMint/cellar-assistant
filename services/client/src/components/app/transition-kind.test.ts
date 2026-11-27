/**
 * B05's direction rules, without a browser: which kind a push, a replace, a
 * Back, a tab switch and a browser history move get, and that reduced motion
 * or a missing View Transition API gets no transition types at all.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  inferKind,
  isTabRoot,
  morphName,
  pathOf,
  popKind,
  TRANSITION_TYPE,
  transitionTypesFor,
} from "./transition-kind";

const ON = { supported: true, reducedMotion: false } as const;

describe("inferKind (a push, replace or link that did not say)", () => {
  test("a push deeper is forward", () => {
    assert.equal(inferKind("/cellars", "/cellars/1"), "forward");
    assert.equal(inferKind("/cellars/1", "/wines/9"), "forward");
    assert.equal(inferKind("/", "/search"), "forward");
    assert.equal(inferKind("/me", "/favorites"), "forward");
    // Lists is a tab of its own in the kit's bar, so Me → Lists crossfades.
    assert.equal(inferKind("/me", "/tier-lists"), "tab");
  });

  test("a move to an ancestor of the current page is back", () => {
    assert.equal(inferKind("/cellars/1", "/cellars"), "back");
    assert.equal(inferKind("/cellars/1/wines/2", "/cellars/1"), "back");
    assert.equal(inferKind("/tier-lists/3/edit", "/tier-lists/3"), "back");
  });

  test("`/` is no page's parent: Home from a deep page is a tab switch, not Back", () => {
    assert.equal(inferKind("/search", "/"), "forward");
    assert.equal(inferKind("/cellars/1", "/"), "tab");
  });

  test("a tab's root from another tab is a tab switch", () => {
    assert.equal(inferKind("/", "/cellars"), "tab");
    assert.equal(inferKind("/cellars/1", "/map"), "tab");
    assert.equal(inferKind("/tier-lists/3", "/cellars"), "tab");
  });

  test("within a tab: a path ancestor is Back, a sibling branch is forward", () => {
    assert.equal(inferKind("/favorites/3", "/me"), "forward");
    assert.equal(inferKind("/me/settings", "/me"), "back");
  });

  test("a replace that keeps the path (a filter, a query) is in place", () => {
    const from = "/cellars/1";
    assert.equal(inferKind(from, pathOf("?sort=name", from)), "none");
    assert.equal(inferKind(from, pathOf("/cellars/1?q=x", from)), "none");
    assert.equal(inferKind(from, pathOf("#reviews", from)), "none");
  });
});

describe("popKind (browser Back/Forward, from the nav-history stack)", () => {
  test("landing on the entry below the top is Back", () => {
    assert.equal(popKind(["/cellars", "/cellars/1"], "/cellars"), "back");
    assert.equal(popKind(["/", "/search", "/wines/9"], "/search"), "back");
  });

  test("any other entry is Forward (the stack cannot see forward entries)", () => {
    assert.equal(popKind(["/cellars"], "/cellars/1"), "forward");
    assert.equal(popKind(["/a", "/b", "/c"], "/a"), "forward");
  });

  test("between two tabs' roots it is a tab switch, Back or not", () => {
    assert.equal(popKind(["/", "/cellars"], "/"), "tab");
    assert.equal(popKind(["/map"], "/me"), "tab");
  });

  test("a cold stack or the same path animates nothing", () => {
    assert.equal(popKind([], "/cellars"), "none");
    assert.equal(popKind(["/cellars"], "/cellars"), "none");
  });
});

describe("transitionTypesFor", () => {
  test("each animated kind carries its one type", () => {
    assert.deepEqual(transitionTypesFor("forward", ON), ["nav-forward"]);
    assert.deepEqual(transitionTypesFor("back", ON), ["nav-back"]);
    assert.deepEqual(transitionTypesFor("tab", ON), ["nav-tab"]);
    assert.equal(transitionTypesFor("none", ON), undefined);
    assert.deepEqual(Object.values(TRANSITION_TYPE).sort(), [
      "nav-back",
      "nav-forward",
      "nav-tab",
    ]);
  });

  test("reduced motion: no types at all, so the page swaps instantly", () => {
    const reduced = { supported: true, reducedMotion: true };
    for (const kind of ["forward", "back", "tab", "none"] as const) {
      assert.equal(transitionTypesFor(kind, reduced), undefined, kind);
    }
  });

  test("no View Transition API: no types, so the router call is unchanged", () => {
    const none = { supported: false, reducedMotion: false };
    for (const kind of ["forward", "back", "tab"] as const) {
      assert.equal(transitionTypesFor(kind, none), undefined, kind);
    }
  });
});

describe("pathOf, isTabRoot, morphName", () => {
  test("pathOf resolves against the current page and drops query and hash", () => {
    assert.equal(pathOf("/wines/1?x=1#y", "/"), "/wines/1");
    assert.equal(pathOf("edit", "/tier-lists/3/"), "/tier-lists/3/edit");
    assert.equal(pathOf("/cellars/", "/"), "/cellars");
    assert.equal(pathOf("", "/me"), "/me");
  });

  test("the four tab roots, and nothing below them", () => {
    for (const root of ["/", "/cellars", "/map", "/me"]) {
      assert.ok(isTabRoot(root), root);
    }
    assert.ok(!isTabRoot("/cellars/1"));
    assert.ok(!isTabRoot("/search"));
  });

  test("a card's href and its page's pathname give the same CSS-safe name", () => {
    const name = morphName("/cellars/c-1/wines/b_2?from=grid");
    assert.equal(name, morphName("/cellars/c-1/wines/b_2"));
    assert.match(name, /^[A-Za-z0-9_-]+$/);
    assert.notEqual(morphName("/wines/1"), morphName("/wines/2"));
  });
});
