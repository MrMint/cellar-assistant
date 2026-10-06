/**
 * X11 · the barcode a person types into the onboarding wizard.
 *
 * ## What this module is for
 *
 * The wizard's Barcode `Input` used to be bound to state that went nowhere:
 * `startItemOnboarding` was called on mount with `barcode: null` hardcoded —
 * before the field was on screen to type into — and
 * `ConfirmItemOnboardingInput` has no barcode field at all, so a typed code was
 * discarded every single time. The plan parked that as a product question
 * ("lookup key, or stored attribute?"). It is neither: the repository had
 * already answered it, in `services/actors/src/lib/item-defaults.ts`, which
 * refuses an extraction with no photograph and says why a barcode does not
 * substitute for one —
 *
 * > A barcode is a lookup key, not something a vision model can read a vintage
 * > off. `BarcodeActor.ensure` is the path that turns one into a product.
 *
 * — and the whole path exists and answers live: `ensureBarcode` (find-or-create
 * on the `barcodes` primary key) followed by `linkBarcodeItem` (creator-only;
 * `ItemActor.setBarcode` writes `<table>.barcode_code` when the outbox
 * delivers). The wizard now calls both. This module holds the decisions that
 * are worth testing away from React.
 *
 * ## 1 · The key space, mirrored rather than guessed
 *
 * `BarcodeActor` constrains the code, because codes are "scanned by a phone
 * camera and typed by hand" — {@link BARCODE_CODE_PATTERN} is a copy of its
 * `CODE_PATTERN`, and `barcode.test.ts` reads that actor off disk and fails if
 * the two drift. The server stays the authority; this only means a typo is
 * answered in the form instead of after an item has already been created.
 *
 * Worth knowing when reading the data: the legacy scanner wrote codes this
 * pattern would now reject. `barcodes` in the dev database holds a row whose
 * code is `"ANNO\n1822"` and another that is the empty string — OCR spill from
 * the Nhost-era flow, which validated nothing.
 *
 * ## 2 · Why nothing here proposes a barcode *type*
 *
 * `barcodes.type` is plain `text` with no check constraint and no enum in the
 * SDL, so there is no domain to pick from — and the client's legacy
 * `BarcodeType` enum in `src/constants/index.tsx` (four members, no callers) is
 * not one either. Deriving a symbology from the digit count would be a guess:
 * eight digits are an EAN-8 *or* a UPC-E, and the two name different products.
 * A symbology is a property of the *scan*, not of the number, and this form has
 * no scanner. So the wizard sends the code and no type.
 *
 * A guessed type is also not free. §2.1 lets a `barcodes` row be written "only
 * on creation or admin", so a type the first registrant sends is the one the
 * row keeps. What happens to a *later* caller's type depends on the key
 * (`BarcodeActor.ensure`, since `a3d1b0bb`):
 *
 * - **A GTIN** — every code of 8, 12, 13 or 14 digits with a valid check
 *   digit, stored as GTIN-14 — returns the existing row **unchanged** for a
 *   non-admin whose type differs. The UPC-A and the EAN-13 scan of one bottle
 *   are both true of it, so this is not a re-type, and nothing is written.
 * - **Any other code** (text, or digits that are no GTIN) keeps the refusal:
 *   `ForbiddenError "barcode … already exists with type …; only an admin may
 *   change it"`. Its type is not implied by its characters.
 *
 * Both halves are held by `services/actors/src/actors/barcode-actor.test.ts`.
 *
 * ## 3 · Codes come back canonical; show them as printed
 *
 * The API canonicalises every code it is sent (`canonicalBarcodeCode`,
 * `packages/contracts/src/barcodes.ts`): `012345678905` is stored, keyed and
 * returned as `00012345678905`. Nothing here canonicalises before sending —
 * the search box and this field send what was typed, and the server is the
 * one place that decides the key. What the client does is *display*: every
 * code it renders goes through {@link displayBarcode}, which turns the GTIN-14
 * back into the form on the label and is guaranteed to canonicalise back to
 * the same key when typed in again. `barcode.test.ts` scans the components for
 * a barcode rendered without it.
 */

/**
 * The label form of a code — `packages/contracts`' own `displayBarcode`.
 *
 * Through the `./barcodes` subpath, never the package root: the root is a
 * barrel of every contract, and `search.ts` among them imports `node:crypto`,
 * which has no business in a browser bundle. `barcodes.ts` imports nothing at
 * runtime (its imports are all `import type`), so the bundle gains that one
 * module. `dev-checks/image-inputs.test.ts` holds both halves: the client
 * image carries every workspace file this reaches, and nothing it reaches at
 * runtime imports a `node:` builtin.
 */
export { displayBarcode } from "@cellar-assistant/contracts/barcodes";

/**
 * `BarcodeActor`'s `CODE_PATTERN`, verbatim.
 *
 * Do not "improve" it here. `barcode.test.ts` compares this source string to
 * the one in `services/actors/src/actors/barcode-actor.ts` and fails on any
 * difference, in the same way `dev-checks/static-options.test.ts` holds the
 * form's static pickers to `packages/db`'s `pgEnum` declarations. If the key
 * space should change, change it in the actor — the server is what enforces it.
 */
export const BARCODE_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Derived from the pattern's own quantifier, and asserted against it in the test. */
export const BARCODE_CODE_MAX_LENGTH = 64;

/** What the wizard sends. Surrounding space is a paste artefact, not a code. */
export const normalizeBarcode = (raw: string): string => raw.trim();

/**
 * Why this code cannot be registered, or `null` when it can.
 *
 * Blank is `null`, not a problem: the field is optional and always has been.
 * Everything else restates {@link BARCODE_CODE_PATTERN} in words, because
 * "expected /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/" is the actor's message to a
 * caller, not a sentence to put in front of somebody holding a bottle.
 */
export const barcodeProblem = (raw: string): string | null => {
  const code = normalizeBarcode(raw);
  if (code === "") return null;
  if (BARCODE_CODE_PATTERN.test(code)) return null;
  if (code.length > BARCODE_CODE_MAX_LENGTH) {
    return `A barcode is at most ${BARCODE_CODE_MAX_LENGTH} characters; this one is ${code.length}.`;
  }
  return (
    "A barcode is letters and digits — a dot, underscore or hyphen is allowed " +
    "after the first character, and nothing else is. Most are all digits."
  );
};

/**
 * What to say about a code somebody has already registered, or `null`.
 *
 * Deliberately a note and not a refusal. Two items legitimately sharing a code
 * is how a re-release or a second bottling shows up, and `BarcodeActor.linkItem`
 * allows it — but being told beforehand is the difference between cataloguing a
 * duplicate and choosing to.
 */
export const describeRegisteredBarcode = (
  names: readonly string[] | null,
): string | null => {
  if (names === null || names.length === 0) return null;
  const [first] = names;
  if (first === undefined) return null;
  if (names.length === 1) return `Already registered to ${first}.`;
  return `Already registered to ${first} and ${names.length - 1} other${
    names.length === 2 ? "" : "s"
  }.`;
};
