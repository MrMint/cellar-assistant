/**
 * `parseDrankAt` (X03): the one rule for when a drink can be logged, shared
 * by `CheckInActor` and the log sheet's "When".
 */
import { describe, expect, it } from "vitest";
import {
  EARLIEST_DRANK_AT,
  MAX_DRANK_AT_SKEW_MS,
  parseDrankAt,
} from "./check-ins.ts";
import { ValidationError } from "./errors.ts";

const now = new Date("2026-10-08T20:00:00.000Z");

describe("parseDrankAt", () => {
  it("absent is now", () => {
    expect(parseDrankAt(undefined, now)).toBe(now);
    expect(parseDrankAt(null, now)).toBe(now);
  });

  it("an instant in the past is that instant", () => {
    expect(parseDrankAt("2026-10-01T18:30:00.000Z", now).toISOString()).toBe(
      "2026-10-01T18:30:00.000Z",
    );
    expect(parseDrankAt(EARLIEST_DRANK_AT, now).toISOString()).toBe(
      EARLIEST_DRANK_AT,
    );
  });

  it("a clock running a little fast is still now; the future is refused", () => {
    const skewed = new Date(now.getTime() + MAX_DRANK_AT_SKEW_MS);
    expect(parseDrankAt(skewed.toISOString(), now)).toEqual(skewed);
    const later = new Date(now.getTime() + MAX_DRANK_AT_SKEW_MS + 1000);
    expect(() => parseDrankAt(later.toISOString(), now)).toThrow(
      ValidationError,
    );
  });

  it("refuses before 1900 and anything that is not an instant", () => {
    expect(() => parseDrankAt("1899-12-31T23:59:59Z", now)).toThrow(/1900/);
    expect(() => parseDrankAt("last Tuesday", now)).toThrow(ValidationError);
  });
});
