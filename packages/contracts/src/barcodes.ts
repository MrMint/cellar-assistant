/**
 * `BarcodeActor` (migration plan §2.1, §3) — B2.
 *
 * > **`BarcodeActor(code)`**
 * > - Owns: `barcodes`. Natural-key entity; doubles as the registry for
 * >   barcode uniqueness.
 * > - Methods: `get`, `ensure(type)`, `linkItem`. **Today any user can update
 * >   any barcode; now only the actor can, and only on creation or admin.**
 *
 * ## The live hole this closes
 *
 * `target-stack.md` §7 lists it among the "live authorization holes on the
 * current stack", and the metadata is unambiguous — `nhost/metadata/databases/
 * default/tables/public_barcodes.yaml`:
 *
 * ```yaml
 * update_permissions:
 *   - role: user
 *     permission:
 *       columns: [code, type]
 *       filter: {}          # ← every row, for every signed-in user
 * ```
 *
 * `barcodes` has **no owner column at all** — it is `(code text primary key,
 * type text)` and nothing else — so "the row's owner" cannot be a column
 * check. Ownership here is *derived*, and `BarcodeActor` uses the two places it
 * actually exists:
 *
 * 1. **Creation.** A row that does not exist yet may be created by any signed-in
 *    caller. A row that *does* exist may only be re-typed by an admin or a
 *    system caller — §2.1's "only on creation or admin", verbatim.
 * 2. **The item side.** `linkItem` writes `<table>.barcode_code`, and that row
 *    *does* have an owner: `created_by_id`. A caller who is not the item's
 *    creator is refused, so a stranger can neither steal a code onto their own
 *    item nor point someone else's item at a code of their choosing.
 */
import type { ActorDescriptor } from "./actors.ts";
import type { Ctx } from "./ctx.ts";
import type { ItemRef, ItemType } from "./items.ts";

/* -------------------------------------------------------------------------- */
/* The key: one spelling per product                                          */
/* -------------------------------------------------------------------------- */

/** GS1's retail GTIN lengths, all of which fit the 14-digit form. */
const GTIN_LENGTHS: ReadonlySet<number> = new Set([8, 12, 13, 14]);

/**
 * JavaScript's `trim()` also strips Unicode spaces and line separators, and
 * Postgres's `btrim(x)` strips only `' '`. The migration that canonicalises
 * stored codes has to agree with this function byte for byte, so both strip
 * exactly these six ASCII characters (`\t \n \v \f \r` and space) and nothing
 * else — `canonical_barcode_code` in
 * `packages/db/migrations/20260928200000_canonical_barcode_codes` spells the
 * same set as `chr(9)`…`chr(13)` and `' '`.
 */
const isAsciiEdgeSpace = (code: number): boolean =>
  code === 0x20 || (code >= 0x09 && code <= 0x0d);

/**
 * Strip {@link isAsciiEdgeSpace} characters from both ends, in linear time.
 *
 * This used to be `/^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g`, whose second
 * alternative is quadratic: on a run of whitespace that is *not* at the end
 * (`"a" + "\t".repeat(n) + "x"`) the engine re-scans the rest of the run from
 * every start position before `$` fails. The input is a caller's barcode
 * (`createItem`'s `barcodeCode`, `Query.barcode`), bounded only by the API's
 * 128 KiB body, and ~40k tabs already held the actor host's event loop for
 * ~1.8 s. Index scanning has no backtracking to exploit.
 */
const trimAsciiEdgeSpace = (raw: string): string => {
  let start = 0;
  let end = raw.length;
  while (start < end && isAsciiEdgeSpace(raw.charCodeAt(start))) start += 1;
  while (end > start && isAsciiEdgeSpace(raw.charCodeAt(end - 1))) end -= 1;
  return raw.slice(start, end);
};

/**
 * GS1's mod-10 check, over a digit string whose last digit is the check
 * digit: weights 3, 1, 3, 1, … from the digit left of the check digit
 * leftwards, and the weighted sum *including* the check digit (weight 1) is a
 * multiple of ten. One algorithm for GTIN-8, -12, -13 and -14, and for the
 * UPC-A a UPC-E expands to.
 */
export const hasValidGs1CheckDigit = (digits: string): boolean => {
  if (!/^[0-9]+$/.test(digits) || digits.length < 2) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const fromRight = digits.length - 1 - i;
    sum += Number(digits[i]) * (fromRight % 2 === 1 ? 3 : 1);
  }
  return sum % 10 === 0;
};

/**
 * UPC-E (8 digits: number system `0`/`1`, six data digits, check digit) to
 * the UPC-A (12 digits) it is a zero-suppressed rendering of, or `null` when
 * `upcE` cannot be one (wrong length, not digits, number system not 0 or 1).
 * The check digit is carried over unvalidated — UPC-E's check digit *is* its
 * UPC-A's, so validate the result with {@link hasValidGs1CheckDigit}.
 *
 * The expansion is keyed on the sixth data digit (GS1 General Specifications,
 * UPC-E zero suppression):
 *
 * | 6th data digit | UPC-A                          |
 * |----------------|--------------------------------|
 * | 0, 1, 2        | `NS d1 d2 d6 0 0 0 0 d3 d4 d5 C` |
 * | 3              | `NS d1 d2 d3 0 0 0 0 0 d4 d5 C`  |
 * | 4              | `NS d1 d2 d3 d4 0 0 0 0 0 d5 C`  |
 * | 5 – 9          | `NS d1 d2 d3 d4 d5 0 0 0 0 d6 C` |
 */
export const expandUpcE = (upcE: string): string | null => {
  if (!/^[01][0-9]{7}$/.test(upcE)) return null;
  const ns = upcE.slice(0, 1);
  // `split`, not destructuring the string itself: the client imports this
  // module (`displayBarcode`) and type-checks it at `target: es5`, where
  // iterating a string needs `downlevelIteration`.
  const [d1, d2, d3, d4, d5, d6] = upcE.slice(1, 7).split("");
  const check = upcE.slice(7);
  let body: string;
  switch (d6) {
    case "0":
    case "1":
    case "2":
      body = `${d1}${d2}${d6}0000${d3}${d4}${d5}`;
      break;
    case "3":
      body = `${d1}${d2}${d3}00000${d4}${d5}`;
      break;
    case "4":
      body = `${d1}${d2}${d3}${d4}00000${d5}`;
      break;
    default:
      body = `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  }
  return `${ns}${body}${check}`;
};

/** `UPC_E`, `upc-e`, `UpcE` → `UPCE`: the scanner's own spelling varies. */
const symbologyOf = (type: string | null | undefined): string =>
  (type ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

const toGtin14 = (digits: string): string => digits.padStart(14, "0");

/**
 * The one spelling of a barcode — `BarcodeActor`'s key, `barcodes.code`, and
 * every `<item>.barcode_code`.
 *
 * Without it, UPC-A `012345678905` and EAN-13 `0012345678905` — one GTIN; the
 * second is what Apple's AVFoundation, which has no UPC-A type, reports for
 * the first — were two actor activations and two `barcodes` rows, and so were
 * `abc123` and `ABC123` (`docs/architecture/actor-keys.md`, "BarcodeActor").
 *
 * ## The rules, in order
 *
 * 1. **Trim** the six ASCII edge-whitespace characters (see
 *    `trimAsciiEdgeSpace`); inner characters are never touched.
 * 2. **All digits, of a GTIN length, with a valid GS1 check digit → GTIN-14**:
 *    left-padded with zeros to 14 digits. `012345678905` (UPC-A),
 *    `0012345678905` (EAN-13) and `00012345678905` (GTIN-14) are one key.
 *    - **8 digits are two symbologies.** EAN-8 is a GTIN-8 in its own right;
 *      UPC-E is a zero-suppressed UPC-A, whose GTIN is the 12-digit expansion
 *      ({@link expandUpcE}). Whichever of the two the check digit validates
 *      wins. When both validate — the textbook UPC-E `01234565` does — the
 *      code is read as **UPC-E unless `symbology` says EAN-8**. Only a code
 *      starting `0` or `1` can be a UPC-E at all, and a GTIN-8 starting `0`
 *      is one GS1 reserves for restricted, in-store circulation, not a
 *      product's trade number; and today every caller but a scanner sends no
 *      hint (the wizard's text field, `Query.barcode`), so the default has to
 *      be the reading a person typing from a US can or bottle means.
 * 3. **All digits otherwise** — a length that is no GTIN, or a check digit
 *    that does not validate — **is kept as typed (opaque).** Not refused: a
 *    retailer's internal numeric code has no GS1 check digit to fail, and
 *    `barcodes` already holds codes a check would reject that must stay
 *    addressable. A mistyped GTIN therefore stays a distinct key, exactly as
 *    before this function existed; it is never *merged into* the wrong one.
 * 4. **Anything with a non-digit is upper-cased, ASCII letters only.** Every
 *    scanner this app has shipped decodes EAN-13, EAN-8, UPC-A and UPC-E only
 *    (`SUPPORTED_FORMATS` in the legacy `useBarcodeScanner.ts`; the current
 *    client has no scanner, just a text field), so a non-numeric code was
 *    typed by a person from a label, where `abc123` for `ABC123` is a typing
 *    artefact, not a second product. Upper rather than lower because that is
 *    how an alphanumeric SKU is printed, and Code 39 has no lowercase at all.
 *    Only `a`–`z` are folded, so the result never depends on a locale and
 *    Postgres's `translate()` reproduces it exactly.
 *
 * ## Properties callers rely on
 *
 * - **Idempotent, whatever the hint:** `canonical(canonical(x, h)) ===
 *   canonical(x, h)` — a GTIN-14 re-canonicalises to itself with or without
 *   a hint, and opaque output is already trimmed and upper-cased. So
 *   `BarcodeActor` checks its key with no hint, and a code a caller got back
 *   from the API (`BarcodeDto.code`) addresses the same actor it came from.
 * - **Total.** It never throws; whether the result is an acceptable key at
 *   all (`CODE_PATTERN`) is `BarcodeActor`'s question, asked after this.
 * - **Mirrored in SQL** by `public.canonical_barcode_code(text, text)`, which
 *   the migration uses to rewrite stored codes and `barcodes_code_canonical`
 *   uses to refuse a non-canonical insert. `barcodes.test.ts` holds the two
 *   to the same table of cases.
 */
export const canonicalBarcodeCode = (
  raw: string,
  symbology?: string | null,
): string => {
  const code = trimAsciiEdgeSpace(raw);
  if (!/^[0-9]+$/.test(code)) {
    return code.replace(/[a-z]/g, (letter) => letter.toUpperCase());
  }
  if (!GTIN_LENGTHS.has(code.length)) return code;
  if (code.length !== 8) {
    return hasValidGs1CheckDigit(code) ? toGtin14(code) : code;
  }
  const ean8 = hasValidGs1CheckDigit(code);
  const upcA = expandUpcE(code);
  const upcE = upcA !== null && hasValidGs1CheckDigit(upcA);
  if (upcE && (!ean8 || symbologyOf(symbology) !== "EAN8")) {
    return toGtin14(upcA);
  }
  return ean8 ? toGtin14(code) : code;
};

/** Whether `code` is already in {@link canonicalBarcodeCode}'s form. */
export const isCanonicalBarcodeCode = (code: string): boolean =>
  canonicalBarcodeCode(code) === code;

/**
 * UPC-A (12 digits) to the UPC-E that zero-suppresses it, or `null` when it
 * has none — {@link expandUpcE} run backwards, trying GS1's four suppression
 * rules in their published order (manufacturer ending `000`/`100`/`200`, then
 * `00`, then `0`, then a product number of 5–9). Where two rules fit the same
 * UPC-A the first wins, which is the form a label prints. The result is checked
 * by expanding it again, so a `null` can mean "not suppressible", never "got it
 * wrong".
 */
const compressUpcA = (upcA: string): string | null => {
  if (!/^[01][0-9]{11}$/.test(upcA)) return null;
  const ns = upcA.slice(0, 1);
  const maker = upcA.slice(1, 6);
  const product = upcA.slice(6, 11);
  const check = upcA.slice(11);
  let body: string | null = null;
  if (/^[0-2]00$/.test(maker.slice(2)) && product.startsWith("00")) {
    body = `${maker.slice(0, 2)}${product.slice(2)}${maker.slice(2, 3)}`;
  } else if (maker.endsWith("00") && product.startsWith("000")) {
    body = `${maker.slice(0, 3)}${product.slice(3)}3`;
  } else if (maker.endsWith("0") && product.startsWith("0000")) {
    body = `${maker.slice(0, 4)}${product.slice(4)}4`;
  } else if (product.startsWith("0000") && product.slice(4) >= "5") {
    body = `${maker}${product.slice(4)}`;
  }
  if (body === null) return null;
  const upcE = `${ns}${body}${check}`;
  return expandUpcE(upcE) === upcA ? upcE : null;
};

/**
 * A code as a person would read it off the label — the inverse, for display,
 * of {@link canonicalBarcodeCode}. `barcodes.code` and every
 * `<item>.barcode_code` hold GTIN-14 (`00081240050376`); the can says
 * `081240050376`.
 *
 * ## The rules, in order
 *
 * The code is canonicalised first (with `type` as the hint), so a raw spelling
 * — `item_onboardings.barcode` is stored as scanned — is displayed exactly as
 * its canonical form would be. Then:
 *
 * 1. **Not a GTIN-14 → the canonical code, unchanged.** Text codes, numeric
 *    codes of no GTIN length, and digits whose check digit fails are opaque,
 *    so there is no shorter form to recover.
 * 2. **An 8-digit form only when `type` names it** — because it cannot be
 *    recovered from the digits. `00000096385074` is EAN-8 `96385074` *and*
 *    UPC-A `000096385074`; `00012345000065` is UPC-E `01234565` *and* UPC-A
 *    `012345000065`. Only the scan knew which symbol was printed.
 *    - `EAN_8` on a code starting `000000` → the last 8 digits.
 *    - `UPC_E` on a code starting `00` whose UPC-A zero-suppresses → the
 *      UPC-E.
 *    Either is shown only if it canonicalises back to this code **without a
 *    hint**, which is how it will come back when somebody types it into the
 *    search box. An 8-digit code whose EAN-8 and UPC-E readings both validate
 *    (`01234565`) reads as UPC-E there, so an EAN-8 like that is shown in
 *    its 12-digit form instead of as a code that finds a different product.
 * 3. **`ITF_14` / `GTIN_14` → all 14 digits**: a case code is printed whole,
 *    leading zero or not.
 * 4. **Otherwise the leading zeros decide**, not `type`: `00…` → UPC-A (12),
 *    `0…` → EAN-13 (13), anything else → 14 (a real ITF-14 indicator digit,
 *    `10012345678902`). `EAN_13` on a `00…` code still shows 12 digits, since
 *    an EAN-13 starting `0` *is* a UPC-A — it is what Apple's AVFoundation,
 *    which has no UPC-A type, reports for one — and the label says 12.
 *
 * ## The property callers rely on
 *
 * `canonicalBarcodeCode(displayBarcode(x, t)) === canonicalBarcodeCode(x, t)`
 * for every `x` and `t`: what is shown, typed back in with no hint, reaches
 * the same `BarcodeActor`. `barcodes.test.ts` holds it over a table and over
 * a dense sample of every GTIN length under every hint.
 */
export const displayBarcode = (code: string, type?: string | null): string => {
  const canonical = canonicalBarcodeCode(code, type);
  if (!/^[0-9]{14}$/.test(canonical) || !hasValidGs1CheckDigit(canonical)) {
    return canonical;
  }
  const symbology = symbologyOf(type);
  const namesSameKey = (form: string): boolean =>
    canonicalBarcodeCode(form) === canonical;

  if (symbology === "EAN8" && canonical.startsWith("000000")) {
    const ean8 = canonical.slice(6);
    if (namesSameKey(ean8)) return ean8;
  }
  if (symbology === "UPCE" && canonical.startsWith("00")) {
    const upcE = compressUpcA(canonical.slice(2));
    if (upcE !== null && namesSameKey(upcE)) return upcE;
  }
  if (symbology === "ITF14" || symbology === "GTIN14") return canonical;
  if (canonical.startsWith("00")) return canonical.slice(2);
  if (canonical.startsWith("0")) return canonical.slice(1);
  return canonical;
};

/**
 * `BarcodeActor`'s id for a code as scanned or typed. Every caller builds the
 * id through this — `services/api`'s three barcode fields and
 * `ItemOnboardingActor.confirm` — and `BarcodeActor` refuses any key it would
 * change, so two spellings of one product can no longer reach two
 * activations. Pass the scanner's symbology when there is one: it is what
 * tells an 8-digit UPC-E from an EAN-8 when both check digits validate.
 */
export const barcodeActorId = (
  code: string,
  symbology?: string | null,
): string => canonicalBarcodeCode(code, symbology);

/**
 * One `barcodes` row, plus what points at it.
 *
 * `items` is the six-table reverse lookup, which is the question every caller
 * actually has ("have we seen this code before?"). It is unpaged deliberately:
 * a barcode identifies one product, so the list is 0 or 1 long in practice and
 * bounded by six one-column index scans in the worst case.
 */
export type BarcodeDto = {
  readonly code: string;
  /** `EAN13`, `UPC_A`, … — free text today, not an enum. */
  readonly type: string | null;
  readonly items: readonly ItemRef[];
};

/** `ensure`'s argument. An object, not a scalar — see `LinkBarcodeItemInput`. */
export type EnsureBarcodeInput = {
  readonly type?: string | null;
};

/**
 * `linkItem`'s argument.
 *
 * An object rather than two positional arguments because this method is
 * reachable from the outbox, and `OutboxActor.deliver` invokes exactly
 * `method(systemCtx, payload)` with `payload: Record<string, unknown>` — the
 * trap B4 documented for `confirmFriendship`.
 */
export type LinkBarcodeItemInput = {
  readonly itemType: ItemType;
  readonly itemId: string;
};

/**
 * What `linkItem` returns. The item's own `barcode_code` is written by
 * `ItemActor.setBarcode` when the outbox delivers (§1.7), so the caller gets
 * the row id to correlate against rather than an already-updated item.
 */
export type LinkedBarcodeItem = {
  readonly code: string;
  readonly item: ItemRef;
  /** `outbox.id` of the queued `ItemActor.setBarcode`, or `null` if already set. */
  readonly outboxRowId: string | null;
};

/**
 * `BarcodeActor(code)` — entity actor keyed by the natural key.
 *
 * Every method is idempotent: `ensure` is find-or-create on the primary key,
 * and `linkItem` writes nothing when the item already carries the code.
 */
export type BarcodeActorInterface = {
  get(ctx: Ctx): Promise<BarcodeDto>;
  /** Find-or-create. Re-typing an existing row is admin/system only (§2.1). */
  ensure(ctx: Ctx, input: EnsureBarcodeInput): Promise<BarcodeDto>;
  /**
   * Point an item at this code. The caller must be the item's creator (or
   * `admin`/`system`); the item half is delivered by the outbox (§1.7).
   */
  linkItem(ctx: Ctx, input: LinkBarcodeItemInput): Promise<LinkedBarcodeItem>;
};

export const BarcodeActorDescriptor: ActorDescriptor<BarcodeActorInterface> = {
  actorType: "BarcodeActor",
  category: "entity",
  methods: {
    get: {},
    ensure: {},
    linkItem: {},
  },
};
