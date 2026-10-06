/**
 * The edge-whitespace step of `canonicalBarcodeCode`, on its own.
 *
 * Kept out of `barcodes.test.ts` (the rule table) because these cases are
 * about the trim's *cost* as much as its result: it was a regex whose
 * trailing alternative backtracked quadratically on a whitespace run that is
 * not at the end of the string (CodeQL `js/polynomial-redos`), reachable
 * from any caller that sends a barcode.
 */
import { describe, expect, it } from "vitest";
import { canonicalBarcodeCode } from "./barcodes.ts";

describe("canonicalBarcodeCode's edge trim", () => {
  it("strips exactly the six ASCII spaces from both ends", () => {
    expect(canonicalBarcodeCode("\t\n\v\f\r abc123 \r\f\v\n\t")).toBe("ABC123");
  });

  it("leaves inner whitespace and non-ASCII spaces alone", () => {
    expect(canonicalBarcodeCode(" ab\t\tcd ")).toBe("AB\t\tCD");
    // U+00A0 and U+2028: JavaScript's trim() would strip these; Postgres's
    // mirror does not, so neither does this.
    expect(canonicalBarcodeCode(" abc ")).toBe(" ABC ");
  });

  it("reduces an all-whitespace code to the empty string", () => {
    expect(canonicalBarcodeCode(" \t\r\n ")).toBe("");
    expect(canonicalBarcodeCode("")).toBe("");
  });

  it("is linear on a long whitespace run that is not at the end", () => {
    // ~100 KB: inside the API's 128 KiB body limit. The old regex took
    // ~4.5 s on exactly this string (bun 1.4.2, 2026-10-05); a linear scan
    // takes under a millisecond. The bound is loose on purpose so a loaded
    // machine cannot fail it, and still well under the quadratic cost.
    const hostile = `a${"\t".repeat(100_000)}x`;
    const started = performance.now();
    const out = canonicalBarcodeCode(hostile);
    const elapsed = performance.now() - started;
    expect(out).toBe(`A${"\t".repeat(100_000)}X`);
    expect(elapsed).toBeLessThan(1_000);
  });
});
