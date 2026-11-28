/**
 * The desktop cellar's keys (KIT § 3; desktop-cellar-05 to -07): arrows and
 * J/K move the selection over the tiles on screen, a row at a time up and
 * down, clamped at the ends.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { KEY_ROWS } from "@/components/app/overlays/app-keys";
import { LIST_KEYS, moveOf, moveSelection } from "./keys";

const order = ["a", "b", "c", "d", "e", "f", "g"];

describe("list keys", () => {
  test("arrows and J/K are moves; other keys are not", () => {
    assert.equal(moveOf("ArrowRight"), "next");
    assert.equal(moveOf("j"), "next");
    assert.equal(moveOf("k"), "previous");
    assert.equal(moveOf("ArrowLeft"), "previous");
    assert.equal(moveOf("ArrowDown"), "down");
    assert.equal(moveOf("ArrowUp"), "up");
    assert.equal(moveOf("Enter"), null);
  });

  test("nothing selected: any move selects the first tile", () => {
    assert.equal(moveSelection(order, null, "up", 4), "a");
    assert.equal(moveSelection(order, "gone", "next", 4), "a");
    assert.equal(moveSelection([], null, "next", 4), null);
  });

  test("left and right step one; up and down a row of columns; clamped", () => {
    assert.equal(moveSelection(order, "b", "next", 4), "c");
    assert.equal(moveSelection(order, "b", "previous", 4), "a");
    assert.equal(moveSelection(order, "a", "previous", 4), "a");
    assert.equal(moveSelection(order, "b", "down", 4), "f");
    assert.equal(moveSelection(order, "f", "up", 4), "b");
    assert.equal(moveSelection(order, "e", "down", 4), "g");
    assert.equal(moveSelection(order, "c", "down", 1), "d");
  });

  test("every key the list answers is one the keys dialog shows", () => {
    const shown = KEY_ROWS.map((row) => row.keys).join(" ");
    for (const key of ["J", "K", "Enter", "⌫", "O", "T", "F", "1 5"]) {
      assert.ok(shown.includes(key), `${key} is in the keys dialog`);
    }
    assert.ok(LIST_KEYS.includes("Backspace"));
    for (const key of ["f", "1", "2", "3", "4", "5"] as const) {
      assert.ok(
        (LIST_KEYS as readonly string[]).includes(key),
        `${key} is a list key`,
      );
    }
  });
});
