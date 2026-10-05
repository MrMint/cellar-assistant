import { describe, expect, it } from "vitest";
import { ACTOR_ERROR_CODES, ConflictError, ValidationError } from "./errors.ts";
import { formatStoredFailure, parseStoredFailure } from "./stored-failure.ts";

describe("formatStoredFailure", () => {
  it("keeps the class an ActorError already carried", () => {
    const stored = formatStoredFailure(
      new ValidationError("a 400 from ollama"),
    );
    expect(stored).toBe("VALIDATION: a 400 from ollama");
    expect(parseStoredFailure(stored)).toEqual({
      code: "VALIDATION",
      detail: "a 400 from ollama",
    });
  });

  it("leaves the message byte-identical after the prefix", () => {
    // The operator's half of the bargain: the detail is not summarised, not
    // reordered and not redacted — it is the same string it always was.
    const message =
      'ollama generateContent(gemma3:4b) failed (400) at http://x:1/y: {"a":1}';
    expect(
      parseStoredFailure(formatStoredFailure(new ConflictError(message)))
        .detail,
    ).toBe(message);
  });

  it("round-trips every code", () => {
    for (const code of ACTOR_ERROR_CODES) {
      expect(parseStoredFailure(`${code}: why`)).toEqual({
        code,
        detail: "why",
      });
    }
  });

  it("stores an untyped throw with no class at all", () => {
    expect(formatStoredFailure(new Error("boom"))).toBe("boom");
    expect(formatStoredFailure("a bare string")).toBe("a bare string");
    expect(formatStoredFailure(undefined)).toBe("undefined");
  });

  it("truncates the whole line, prefix included, to the column bound", () => {
    const stored = formatStoredFailure(new ConflictError("x".repeat(9_000)));
    expect(stored.length).toBe(4_000);
    expect(stored.startsWith("CONFLICT: ")).toBe(true);
    expect(formatStoredFailure(new ConflictError("xyz"), 12)).toBe(
      "CONFLICT: xy",
    );
  });
});

describe("parseStoredFailure", () => {
  it("reports no class for a row written before this existed", () => {
    // Backwards compatibility is the reason nothing had to be migrated.
    const legacy =
      "ollama generateContent(gemma3:4b) failed (400) at http://x:1/y";
    expect(parseStoredFailure(legacy)).toEqual({ code: null, detail: legacy });
  });

  it("only recognises an exact member of ACTOR_ERROR_CODES", () => {
    for (const impostor of [
      "Sorry: the provider said no",
      "validation: lowercase",
      "VALIDATION_FAILED: near miss",
      " VALIDATION: leading space",
      ": empty",
      "VALIDATION",
    ]) {
      expect(parseStoredFailure(impostor).code).toBeNull();
      expect(parseStoredFailure(impostor).detail).toBe(impostor);
    }
  });

  it("is total — every string is a StoredFailure", () => {
    for (const input of ["", " ", "\n", "::", "a: b: c"]) {
      expect(() => parseStoredFailure(input)).not.toThrow();
    }
    expect(parseStoredFailure("a: b: c").code).toBeNull();
  });
});
