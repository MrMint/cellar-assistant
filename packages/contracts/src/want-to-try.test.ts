import { describe, expect, it } from "vitest";
import {
  isWantToTryKind,
  parseWantToTryKey,
  type WantToTryTarget,
  wantToTryKey,
} from "./user.ts";

/** X08: one string per Save target, and back — the batch answer's shape. */
describe("wantToTryKey / parseWantToTryKey", () => {
  const ID = "11111111-1111-4111-8111-111111111111";

  it("round-trips every kind", () => {
    const targets: WantToTryTarget[] = [
      { kind: "ITEM", item: { type: "WINE", id: ID } },
      { kind: "ITEM", item: { type: "TEA", id: ID } },
      { kind: "RECIPE", recipeId: ID },
      { kind: "PLACE", placeId: ID },
    ];
    for (const target of targets) {
      expect(parseWantToTryKey(wantToTryKey(target))).toEqual(target);
    }
  });

  it("an item key is its ItemActor id", () => {
    expect(wantToTryKey({ kind: "ITEM", item: { type: "SAKE", id: ID } })).toBe(
      `sake:${ID}`,
    );
  });

  it("rejects what is not a key", () => {
    for (const key of ["", "wine:", ":abc", "bottle:abc", "noseparator"]) {
      expect(parseWantToTryKey(key)).toBeNull();
    }
  });

  it("knows its three kinds", () => {
    expect(["ITEM", "RECIPE", "PLACE"].every(isWantToTryKind)).toBe(true);
    expect(isWantToTryKind("BOTTLE")).toBe(false);
    expect(isWantToTryKind(undefined)).toBe(false);
  });
});
