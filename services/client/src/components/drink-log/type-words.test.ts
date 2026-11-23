import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  containerCountLabel,
  thisContainerLabel,
  typeWords,
  yourContainersLabel,
} from "./type-words";

describe("W-20 · per-type wording", () => {
  test("wine keeps its bottle words", () => {
    assert.equal(containerCountLabel("WINE", 1), "1 bottle");
    assert.equal(typeWords("WINE").pour, "Pour");
    assert.equal(typeWords("WINE").serving, "glass");
    assert.equal(typeWords("WINE").windowUntil, "Drink until");
  });
  test("tea is a tin, steeped, by the cup, best by", () => {
    assert.equal(containerCountLabel("TEA", 1), "1 tin");
    assert.equal(containerCountLabel("TEA", 2), "2 tins");
    assert.equal(yourContainersLabel("TEA"), "Your tins");
    assert.equal(thisContainerLabel("TEA"), "This tin");
    assert.equal(typeWords("TEA").pour, "Steep");
    assert.equal(typeWords("TEA").serving, "cup");
    assert.equal(typeWords("TEA").windowUntil, "Best by");
  });
  test("coffee is a bag, brewed, roasted", () => {
    assert.equal(containerCountLabel("COFFEE", 3), "3 bags");
    assert.equal(typeWords("COFFEE").pour, "Brew");
    assert.equal(typeWords("COFFEE").packaged, "Roasted");
  });
  test("none is no count; an unknown type reads as a bottle", () => {
    assert.equal(containerCountLabel("TEA", 0), null);
    assert.equal(typeWords("MEAD").container, "bottle");
  });
});
