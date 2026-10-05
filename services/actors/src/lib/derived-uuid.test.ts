import { describe, expect, it } from "vitest";
import { derivedUuid } from "./derived-uuid.ts";

describe("derivedUuid (C4c)", () => {
  it("is deterministic and shaped like a v5 uuid", () => {
    const a = derivedUuid("ns", "item");
    expect(derivedUuid("ns", "item")).toBe(a);
    expect(derivedUuid("ns", "cellar-item")).not.toBe(a);
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("does not collide namespace/name pairs that only differ in where the boundary falls", () => {
    // A plain concatenation (or a separator that can appear in either input)
    // would make ("ab", "c") and ("a", "bc") collide. The NUL-byte separator
    // is chosen so this never happens for realistic inputs.
    expect(derivedUuid("ab", "c")).not.toBe(derivedUuid("a", "bc"));
  });
});
