/**
 * `canonicalBarcodeCode` — the one spelling of a barcode (`barcodes.ts`).
 *
 * Table-driven, because the function is a table: every row is one rule from
 * its doc comment. The GS1 vectors marked "(published)" are the worked
 * examples from the symbologies' own documentation, so they check the
 * check-digit arithmetic against something other than this file.
 *
 * `services/actors/src/lib/barcode-canonical-sql.test.ts` holds the SQL mirror
 * (`public.canonical_barcode_code`) to this same function.
 */
import { describe, expect, it } from "vitest";
import {
  barcodeActorId,
  canonicalBarcodeCode,
  displayBarcode,
  expandUpcE,
  hasValidGs1CheckDigit,
  isCanonicalBarcodeCode,
} from "./barcodes.ts";

type Case = {
  readonly why: string;
  readonly raw: string;
  readonly symbology?: string | null;
  readonly canonical: string;
};

const CANONICAL_CASES: readonly Case[] = [
  // GTIN-12 / -13 / -14: one product, one key.
  { why: "UPC-A", raw: "012345678905", canonical: "00012345678905" },
  {
    why: "the same GTIN as EAN-13",
    raw: "0012345678905",
    canonical: "00012345678905",
  },
  {
    why: "the same GTIN as GTIN-14",
    raw: "00012345678905",
    canonical: "00012345678905",
  },
  {
    why: "UPC-A (published)",
    raw: "036000291452",
    canonical: "00036000291452",
  },
  {
    why: "EAN-13 (published)",
    raw: "4006381333931",
    canonical: "04006381333931",
  },
  {
    why: "ITF-14 with a non-zero indicator digit is kept whole",
    raw: "10012345678902",
    canonical: "10012345678902",
  },
  {
    why: "a legacy row: UPC-A with type UPC_A",
    raw: "081240050376",
    symbology: "UPC_A",
    canonical: "00081240050376",
  },
  // 8 digits: EAN-8 or UPC-E.
  {
    why: "EAN-8 (published); cannot be UPC-E (starts 9)",
    raw: "96385074",
    canonical: "00000096385074",
  },
  {
    why: "UPC-E (published) expands to its UPC-A",
    raw: "04252614",
    canonical: "00042100005264",
  },
  {
    why: "UPC-E whose EAN-8 reading fails, even hinted EAN_8",
    raw: "04252614",
    symbology: "EAN_8",
    canonical: "00042100005264",
  },
  {
    why: "both readings valid, no hint → UPC-E",
    raw: "01234565",
    canonical: "00012345000065",
  },
  {
    why: "both readings valid, hinted UPC_E → UPC-E",
    raw: "01234565",
    symbology: "UPC_E",
    canonical: "00012345000065",
  },
  {
    why: "both readings valid, hinted EAN_8 → EAN-8",
    raw: "01234565",
    symbology: "EAN_8",
    canonical: "00000001234565",
  },
  {
    why: "the hint's spelling does not matter",
    raw: "01234565",
    symbology: "ean-8",
    canonical: "00000001234565",
  },
  {
    why: "only the EAN-8 reading is valid, hinted UPC_E",
    raw: "01234619",
    symbology: "UPC_E",
    canonical: "00000001234619",
  },
  {
    why: "neither 8-digit reading is valid → opaque",
    raw: "01234560",
    canonical: "01234560",
  },
  // Bad check digits and non-GTIN lengths stay exactly as typed.
  {
    why: "UPC-A with a wrong check digit → opaque",
    raw: "012345678900",
    canonical: "012345678900",
  },
  {
    why: "EAN-13 with a wrong check digit → opaque, not padded",
    raw: "0000000000001",
    canonical: "0000000000001",
  },
  {
    why: "GTIN-14 with a wrong check digit → opaque",
    raw: "00012345678900",
    canonical: "00012345678900",
  },
  { why: "11 digits is no GTIN", raw: "01234567890", canonical: "01234567890" },
  {
    why: "15 digits is no GTIN",
    raw: "000012345678905",
    canonical: "000012345678905",
  },
  { why: "6-digit UPC-E body alone", raw: "425261", canonical: "425261" },
  // Text codes: ASCII-trimmed and ASCII-upper-cased only.
  { why: "lowercase SKU", raw: "abc123", canonical: "ABC123" },
  { why: "already upper", raw: "ABC123", canonical: "ABC123" },
  {
    why: "mixed, with separators",
    raw: "x11-Probe.7",
    canonical: "X11-PROBE.7",
  },
  {
    why: "edge whitespace is a paste artefact",
    raw: " \t012345678905\r\n",
    canonical: "00012345678905",
  },
  {
    why: "inner whitespace is kept (legacy OCR row)",
    raw: "ANNO\n1822",
    canonical: "ANNO\n1822",
  },
  {
    why: "non-ASCII letters are not folded",
    raw: "straße-é",
    canonical: "STRAßE-é",
  },
  {
    why: "a Unicode space is not ASCII edge whitespace",
    raw: " abc",
    canonical: " ABC",
  },
  { why: "blank stays blank (legacy row)", raw: "", canonical: "" },
  { why: "whitespace-only trims to blank", raw: "  \n", canonical: "" },
];

describe("canonicalBarcodeCode", () => {
  it.each(CANONICAL_CASES)("$why: $raw → $canonical", (row) => {
    expect(canonicalBarcodeCode(row.raw, row.symbology)).toBe(row.canonical);
  });

  it.each(CANONICAL_CASES)("is idempotent with no hint: $raw", ({
    raw,
    symbology,
  }) => {
    const once = canonicalBarcodeCode(raw, symbology);
    expect(canonicalBarcodeCode(once)).toBe(once);
    expect(isCanonicalBarcodeCode(once)).toBe(true);
  });

  it("is idempotent over every 8-digit code with a 0/1 prefix sampled, under every hint", () => {
    // The 8-digit branch is the only one a hint changes, so it is the one
    // idempotence could break in; sample it densely rather than by example.
    for (let n = 0; n < 2_000_000; n += 97) {
      const raw = String(n).padStart(8, "0");
      for (const hint of [null, "UPC_E", "EAN_8"]) {
        const once = canonicalBarcodeCode(raw, hint);
        expect(canonicalBarcodeCode(once)).toBe(once);
      }
    }
  });

  it("barcodeActorId is canonicalBarcodeCode", () => {
    expect(barcodeActorId("012345678905")).toBe("00012345678905");
    expect(barcodeActorId("01234565", "EAN_8")).toBe("00000001234565");
  });

  it("reports non-canonical spellings as such", () => {
    expect(isCanonicalBarcodeCode("012345678905")).toBe(false);
    expect(isCanonicalBarcodeCode("abc123")).toBe(false);
    expect(isCanonicalBarcodeCode(" ABC123")).toBe(false);
    expect(isCanonicalBarcodeCode("00012345678905")).toBe(true);
    expect(isCanonicalBarcodeCode("012345678900")).toBe(true);
  });
});

describe("hasValidGs1CheckDigit", () => {
  it.each([
    ["036000291452", true],
    ["036000291453", false],
    ["4006381333931", true],
    ["4006381333932", false],
    ["96385074", true],
    ["96385075", false],
    ["00012345678905", true],
    ["0", false],
    ["", false],
    ["12a4", false],
  ] as const)("%s → %s", (digits, valid) => {
    expect(hasValidGs1CheckDigit(digits)).toBe(valid);
  });
});

describe("expandUpcE (GS1 zero suppression)", () => {
  it.each([
    ["01234505", "012000003455", "sixth digit 0"],
    ["01234514", "012100003454", "sixth digit 1"],
    ["01234523", "012200003453", "sixth digit 2"],
    ["01234531", "012300000451", "sixth digit 3"],
    ["01234543", "012340000053", "sixth digit 4"],
    ["01234558", "012345000058", "sixth digit 5"],
    ["01234565", "012345000065", "sixth digit 6"],
    ["01234572", "012345000072", "sixth digit 7"],
    ["01234589", "012345000089", "sixth digit 8"],
    ["01234596", "012345000096", "sixth digit 9"],
    ["04252614", "042100005264", "published example"],
    ["11234565", "112345000065", "number system 1"],
  ])("%s → %s (%s)", (upcE, upcA) => {
    expect(expandUpcE(upcE)).toBe(upcA);
    // UPC-E's check digit is its UPC-A's.
    expect(hasValidGs1CheckDigit(upcA)).toBe(upcE !== "11234565");
  });

  it.each([
    "21234565",
    "0123456",
    "012345678",
    "0123456x",
  ])("%s cannot be a UPC-E", (code) => {
    expect(expandUpcE(code)).toBeNull();
  });
});

/** `body` plus the GS1 check digit that makes it valid. */
const withCheckDigit = (body: string): string => {
  for (let digit = 0; digit <= 9; digit++) {
    if (hasValidGs1CheckDigit(`${body}${digit}`)) return `${body}${digit}`;
  }
  throw new Error(`no check digit for ${body}`);
};

type DisplayCase = {
  readonly why: string;
  readonly code: string;
  readonly type?: string | null;
  readonly display: string;
};

const DISPLAY_CASES: readonly DisplayCase[] = [
  // Rule 4: the leading zeros decide.
  {
    why: "the legacy row the item page showed as 14 digits",
    code: "00081240050376",
    type: "UPC_A",
    display: "081240050376",
  },
  { why: "UPC-A, no type", code: "00036000291452", display: "036000291452" },
  {
    why: "EAN-13 starting 0 is a UPC-A (AVFoundation's EAN_13)",
    code: "00036000291452",
    type: "EAN_13",
    display: "036000291452",
  },
  { why: "EAN-13, no type", code: "04006381333931", display: "4006381333931" },
  {
    why: "EAN-13, typed",
    code: "04006381333931",
    type: "EAN_13",
    display: "4006381333931",
  },
  {
    why: "a UPC_A type on a code that is no UPC-A is ignored",
    code: "04006381333931",
    type: "UPC_A",
    display: "4006381333931",
  },
  {
    why: "ITF-14 with a non-zero indicator stays whole",
    code: "10012345678902",
    display: "10012345678902",
  },
  // Rule 3: a case code keeps its leading zero.
  {
    why: "ITF_14 type on a 0-indicator case code",
    code: "00012345678905",
    type: "ITF_14",
    display: "00012345678905",
  },
  {
    why: "the ITF-14 hint's spelling does not matter",
    code: "00012345678905",
    type: "itf-14",
    display: "00012345678905",
  },
  // Rule 2: the 8-digit forms need the type.
  {
    why: "EAN-8 (published), typed",
    code: "00000096385074",
    type: "EAN_8",
    display: "96385074",
  },
  {
    why: "the same GTIN with no type is shown as its UPC-A",
    code: "00000096385074",
    display: "000096385074",
  },
  {
    why: "UPC-E (published), typed",
    code: "00042100005264",
    type: "UPC_E",
    display: "04252614",
  },
  {
    why: "the same GTIN with no type is its UPC-A",
    code: "00042100005264",
    display: "042100005264",
  },
  {
    why: "UPC-E, a UPC-A of the 'manufacturer ends 00' rule",
    code: "00012300000451",
    type: "UPC_E",
    display: "01234531",
  },
  {
    why: "UPC-E, the 'manufacturer ends 0' rule",
    code: "00012340000053",
    type: "UPC_E",
    display: "01234543",
  },
  {
    why: "UPC-E, the 'product 5-9' rule",
    code: "00012345000065",
    type: "UPC_E",
    display: "01234565",
  },
  {
    why: "UPC_E on a UPC-A that does not zero-suppress → UPC-A",
    code: "00036000291452",
    type: "UPC_E",
    display: "036000291452",
  },
  {
    why: "EAN_8 on a code with no six leading zeros → leading-zero rule",
    code: "00036000291452",
    type: "EAN_8",
    display: "036000291452",
  },
  {
    why: "an EAN-8 that would read back as a UPC-E is shown as 12 digits",
    code: "00000001234565",
    type: "EAN_8",
    display: "000001234565",
  },
  {
    why: "an EAN-8 only the EAN-8 reading validates is shown as 8",
    code: "00000001234619",
    type: "EAN_8",
    display: "01234619",
  },
  // Rule 1: opaque codes are the canonical code.
  { why: "a text SKU", code: "ABC123", display: "ABC123" },
  {
    why: "a text SKU with a stray symbology",
    code: "X11-PROBE.7",
    type: "UPC_A",
    display: "X11-PROBE.7",
  },
  {
    why: "14 digits with a bad check digit",
    code: "00012345678900",
    display: "00012345678900",
  },
  {
    why: "12 digits with a bad check digit",
    code: "012345678900",
    display: "012345678900",
  },
  {
    why: "8 digits neither reading validates",
    code: "01234560",
    type: "EAN_8",
    display: "01234560",
  },
  { why: "11 digits", code: "01234567890", display: "01234567890" },
  { why: "blank (legacy row)", code: "", display: "" },
  // A raw spelling is displayed as its canonical form would be.
  {
    why: "raw UPC-A with edge whitespace",
    code: " 036000291452\n",
    display: "036000291452",
  },
  { why: "raw lowercase SKU", code: "abc123", display: "ABC123" },
  {
    why: "raw EAN-8 scanned as EAN_8 keeps its own GTIN",
    code: "01234565",
    type: "EAN_8",
    display: "000001234565",
  },
  {
    why: "raw UPC-E scanned as UPC_E",
    code: "04252614",
    type: "UPC_E",
    display: "04252614",
  },
];

describe("displayBarcode", () => {
  it.each(DISPLAY_CASES)("$why: $code ($type) → $display", (row) => {
    expect(displayBarcode(row.code, row.type)).toBe(row.display);
  });

  it.each(DISPLAY_CASES)("round-trips with no hint: $code ($type)", ({
    code,
    type,
  }) => {
    // What is shown, typed back in with no symbology (the search box, the
    // wizard's field), reaches the same BarcodeActor.
    expect(canonicalBarcodeCode(displayBarcode(code, type))).toBe(
      canonicalBarcodeCode(code, type),
    );
  });

  it("round-trips every canonical code in the canonicalisation table", () => {
    for (const { canonical } of CANONICAL_CASES) {
      for (const type of [
        null,
        "UPC_A",
        "EAN_13",
        "UPC_E",
        "EAN_8",
        "ITF_14",
      ]) {
        expect(canonicalBarcodeCode(displayBarcode(canonical, type))).toBe(
          canonical,
        );
      }
    }
  });

  it("round-trips a dense sample of every GTIN length under every hint", () => {
    // The table can only hold the cases somebody thought of; the property is
    // what the search box depends on, so sample it. Bodies are spread across
    // the whole space and packed near zero, where the 8-digit forms live.
    const hints = [null, "UPC_A", "EAN_13", "UPC_E", "EAN_8", "ITF_14"];
    let checked = 0;
    for (const length of [8, 12, 13, 14]) {
      const bodies = new Set<string>();
      for (let n = 0; n < 20_000; n++) {
        bodies.add(String(n).padStart(length - 1, "0"));
        bodies.add(
          String(n * 7_919_117)
            .padStart(length - 1, "0")
            .slice(-(length - 1)),
        );
      }
      for (const body of bodies) {
        const raw = withCheckDigit(body);
        for (const hint of hints) {
          const shown = displayBarcode(raw, hint);
          expect(canonicalBarcodeCode(shown)).toBe(
            canonicalBarcodeCode(raw, hint),
          );
          expect(shown.length).toBeLessThanOrEqual(14);
          checked++;
        }
      }
    }
    // Guards the loop itself: a sampler that generated nothing passes vacuously.
    expect(checked).toBeGreaterThan(400_000);
  });

  it("shows a real UPC-E for every suppressible UPC-A it samples", () => {
    // compressUpcA is expandUpcE backwards; every 8-digit UPC-E whose UPC-A
    // validates must come back out of the display as some UPC-E that expands
    // to the same UPC-A (GS1 permits two spellings for some; either is right).
    let shownAsUpcE = 0;
    for (let n = 0; n < 2_000_000; n += 37) {
      const upcE = withCheckDigit(String(n).padStart(7, "0"));
      const upcA = expandUpcE(upcE);
      if (upcA === null || !hasValidGs1CheckDigit(upcA)) continue;
      const shown = displayBarcode(`00${upcA}`, "UPC_E");
      expect(shown).toHaveLength(8);
      expect(expandUpcE(shown)).toBe(upcA);
      shownAsUpcE++;
    }
    expect(shownAsUpcE).toBeGreaterThan(20_000);
  });
});
