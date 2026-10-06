/**
 * X11 · the typed barcode, and the three things that could quietly undo it.
 *
 * The bug this closes was not a broken call — it was a control wired to
 * nothing, which no typecheck, linter or GraphQL validator can see. So beside
 * the ordinary unit tests this file holds three fences, each reading the real
 * source rather than a copy of it:
 *
 *  1. **The key space.** {@link BARCODE_CODE_PATTERN} is a copy of
 *     `BarcodeActor`'s `CODE_PATTERN`. A copy with nothing holding it is how
 *     `STATIC_OPTIONS.sakeServingTemperature` came to list seven of nine
 *     labels (E2c/X1b), so this reads the actor off disk and compares.
 *  2. **The schema surface.** `ensureBarcode` and `linkBarcodeItem` sat in the
 *     SDL with client documents and *no callers* for four workstreams. Now that
 *     the wizard depends on them, their absence should fail here rather than at
 *     a person's fingertips.
 *  3. **The wiring.** That the wizard actually sends what the input collects.
 *     This is the check whose absence *was* the bug.
 *
 *   bun run --filter @cellar-assistant/client test
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildSchema, type GraphQLObjectType, isObjectType } from "graphql";
import {
  BARCODE_CODE_MAX_LENGTH,
  BARCODE_CODE_PATTERN,
  barcodeProblem,
  describeRegisteredBarcode,
  displayBarcode,
  normalizeBarcode,
} from "./barcode.ts";

const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));

const WIZARD = "services/client/src/components/common/OnboardingWizard";
const CREATE_ITEM = `${WIZARD}/actors/createItem.ts`;
const FETCH_DEFAULTS = `${WIZARD}/actors/fetchDefaults.ts`;
const ONBOARDING_FORM = `${WIZARD}/OnboardingItemForm.tsx`;
const read = (rel: string): string => readFileSync(join(repoRoot, rel), "utf8");

/* --------------------------------------------------------------------------
 * 1 · The key space is the actor's, not a lookalike
 * ----------------------------------------------------------------------- */

describe("BARCODE_CODE_PATTERN mirrors BarcodeActor.CODE_PATTERN", () => {
  const actor = read("services/actors/src/actors/barcode-actor.ts");

  /** The one `const CODE_PATTERN = /.../;` in the actor. */
  const actorPattern = (): string => {
    const match = /const CODE_PATTERN\s*=\s*\/(.+?)\/;/.exec(actor);
    assert.notEqual(
      match,
      null,
      `services/actors/src/actors/barcode-actor.ts no longer declares
CODE_PATTERN in the shape this test reads. It is the server's key space and
this module claims to copy it — re-point the fence, do not delete it.`,
    );
    return match?.[1] ?? "";
  };

  test("the two sources are identical", () => {
    assert.equal(
      BARCODE_CODE_PATTERN.source,
      actorPattern(),
      `src/lib/items/barcode.ts has drifted from BarcodeActor's CODE_PATTERN.

The actor is the authority: it is what rejects a code, and the wizard's own
check exists only so a typo is answered in the form rather than after the item
has been created. Copy the actor's pattern here — or, if the key space really
should change, change it there first.`,
    );
  });

  test("BARCODE_CODE_MAX_LENGTH is the pattern's own bound", () => {
    // `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` — one leading character plus 63.
    const quantifier = /\{0,(\d+)\}\$$/.exec(BARCODE_CODE_PATTERN.source);
    assert.notEqual(quantifier, null, "the pattern has no trailing {0,n}");
    assert.equal(
      BARCODE_CODE_MAX_LENGTH,
      Number(quantifier?.[1] ?? 0) + 1,
      "the advertised maximum length is not what the pattern accepts",
    );
  });

  test("the bound is exact in both directions", () => {
    const longest = "9".repeat(BARCODE_CODE_MAX_LENGTH);
    assert.equal(barcodeProblem(longest), null);
    assert.notEqual(barcodeProblem(`${longest}9`), null);
  });
});

/* --------------------------------------------------------------------------
 * 2 · barcodeProblem
 * ----------------------------------------------------------------------- */

describe("barcodeProblem", () => {
  test("an empty field is not a problem — the barcode is optional", () => {
    assert.equal(barcodeProblem(""), null);
    assert.equal(barcodeProblem("   "), null);
  });

  test("the codes this app actually holds are accepted", () => {
    // Real `barcodes.code` values from the dev database.
    for (const code of ["859996000750", "812949023459", "081240050376"]) {
      assert.equal(barcodeProblem(code), null, code);
    }
  });

  test("surrounding whitespace is trimmed, not rejected", () => {
    assert.equal(barcodeProblem("  081240050376 "), null);
    assert.equal(normalizeBarcode("  081240050376 "), "081240050376");
  });

  test("alphanumeric retailer codes are accepted, with . _ - inside", () => {
    for (const code of ["A1", "SKU_9.2-b", "x"]) {
      assert.equal(barcodeProblem(code), null, code);
    }
  });

  test("what the legacy scanner wrote is now refused", () => {
    // Both are real rows in `barcodes`, written by the Nhost-era flow, which
    // validated nothing. They are why `BarcodeActor` has a pattern at all.
    assert.notEqual(barcodeProblem("ANNO\n1822"), null);
    // The empty-string row cannot be re-created: blank means "no barcode".
    assert.equal(normalizeBarcode(""), "");
  });

  test("a leading separator is refused — the pattern anchors on [A-Za-z0-9]", () => {
    for (const code of ["-123", ".123", "_123"]) {
      assert.notEqual(barcodeProblem(code), null, code);
    }
  });

  test("spaces and slashes inside a code are refused", () => {
    for (const code of ["12 34", "12/34", "12%34", "héllo"]) {
      assert.notEqual(barcodeProblem(code), null, code);
    }
  });

  test("the message says what is allowed, not which regex failed", () => {
    const message = barcodeProblem("12 34") ?? "";
    assert.doesNotMatch(message, /\[A-Za-z0-9\]/);
    assert.match(message, /digits/);
  });
});

/* --------------------------------------------------------------------------
 * 3 · describeRegisteredBarcode
 * ----------------------------------------------------------------------- */

describe("describeRegisteredBarcode", () => {
  test("nothing registered says nothing", () => {
    assert.equal(describeRegisteredBarcode(null), null);
    assert.equal(describeRegisteredBarcode([]), null);
  });

  test("one item is named", () => {
    assert.equal(
      describeRegisteredBarcode(["Château Margaux"]),
      "Already registered to Château Margaux.",
    );
  });

  test("two and three read correctly", () => {
    assert.equal(
      describeRegisteredBarcode(["A", "B"]),
      "Already registered to A and 1 other.",
    );
    assert.equal(
      describeRegisteredBarcode(["A", "B", "C"]),
      "Already registered to A and 2 others.",
    );
  });
});

/* --------------------------------------------------------------------------
 * 4 · The surface the wizard now depends on really exists
 * ----------------------------------------------------------------------- */

describe("the barcode mutations are in the schema", () => {
  const schema = buildSchema(read("packages/schema/schema.graphql"));

  const objectType = (name: string): GraphQLObjectType => {
    const type = schema.getType(name);
    assert.ok(
      isObjectType(type),
      `schema.graphql does not define the object type ${name}`,
    );
    return type;
  };

  const REQUIRED_ARGS: readonly (readonly [string, readonly string[]])[] = [
    ["ensureBarcode", ["code", "type"]],
    ["linkBarcodeItem", ["code", "itemId", "itemType"]],
  ];

  for (const [field, args] of REQUIRED_ARGS) {
    test(`Mutation.${field}(${args.join(", ")})`, () => {
      const definition = objectType("Mutation").getFields()[field];
      assert.ok(
        definition !== undefined,
        `Mutation.${field} is missing from packages/schema/schema.graphql.
The onboarding wizard's barcode field is wired to it. If services/api really
dropped it, that is the change to reconsider — do not go back to an Input that
discards what somebody types.`,
      );
      assert.deepEqual(
        definition.args.map((arg) => arg.name).sort(),
        [...args].sort(),
        `Mutation.${field} does not take the arguments the wizard sends`,
      );
    });
  }

  test("Query.barcode is the reverse lookup the field hints with", () => {
    assert.ok("barcode" in objectType("Query").getFields());
  });

  test("LinkedBarcodeItem carries itemId and itemType", () => {
    // A7c added both. `src/lib/api/items.ts` still carries a comment saying it
    // does not — stale, and the reason this assertion is written down: the
    // document may be narrowed to them without a round trip through `item`.
    const fields = objectType("LinkedBarcodeItem").getFields();
    for (const name of ["code", "itemId", "itemType", "outboxRowId"]) {
      assert.ok(name in fields, `LinkedBarcodeItem is missing ${name}`);
    }
  });
});

/* --------------------------------------------------------------------------
 * 5 · `barcodes.type` has no domain, which is why none is sent
 * ----------------------------------------------------------------------- */

describe("no barcode type is proposed, because there is none to propose", () => {
  test("barcodes.type is free text in packages/db, not a pgEnum", () => {
    const tables = read("packages/db/src/schema/tables.ts");
    const declaration =
      /export const barcodes = pgTable\("barcodes",\s*\{([^}]*)\}/.exec(tables);
    assert.notEqual(
      declaration,
      null,
      "packages/db does not declare a `barcodes` table",
    );
    assert.match(
      declaration?.[1] ?? "",
      /\btype:\s*text\(\)/,
      `barcodes.type is no longer plain text.

src/lib/items/barcode.ts sends no type precisely because the column has no
domain — and because §2.1 makes re-typing an existing row admin-only, so a
guessed symbology is kept by the row it creates, and is a ForbiddenError
against any text code somebody registered without one. If the column now has
an enum, that reasoning is worth redoing:
enumerate its labels and give the wizard a picker for ALL of them (X1b's sake
serving-temperature lesson), or keep sending null deliberately.`,
    );
  });

  test("a typed code is registered with no type", () => {
    // `src/constants/index.tsx` declares a four-member `BarcodeType` (UPC_A,
    // EAN_13, UPC_E, EAN_8). The restored scanner (`hooks/useBarcodeScanner.ts`)
    // reports one of them as the symbology it *detected* — a property of the
    // scan, and only ever an EAN/UPC, i.e. a GTIN, which `BarcodeActor.ensure`
    // never refuses on a type difference (§2 of barcode.ts). That one rides on
    // `startItemOnboarding`. A code typed into the form has no scan behind it,
    // so it is sent with `type: null` and the legacy enum is not reached for.
    const create = read(CREATE_ITEM);
    assert.doesNotMatch(create, /\bBarcodeType\b/);
    assert.match(
      create,
      /EnsureBarcodeMutation,\s*\{\s*code: typed,\s*type: null/,
    );
    assert.doesNotMatch(read(ONBOARDING_FORM), /\bBarcodeType\b/);
  });
});

/* --------------------------------------------------------------------------
 * 6 · The wiring itself — the check whose absence was the bug
 * ----------------------------------------------------------------------- */

describe("the wizard sends what its barcode input collects", () => {
  const create = read(CREATE_ITEM);
  const form = read(ONBOARDING_FORM);
  const start = read(FETCH_DEFAULTS);

  for (const name of ["EnsureBarcodeMutation", "LinkBarcodeItemMutation"]) {
    test(`createOnboardedItem uses ${name}`, () => {
      assert.match(
        create,
        new RegExp(`\\b${name}\\b`),
        `actors/createItem.ts no longer references ${name}.

X11 was exactly this: a Barcode <Input> bound to state that nothing read, with
start() hardcoding "barcode: null" and ConfirmItemOnboardingInput having no
barcode field. It type-checked, linted and passed every test for four
workstreams. If the control is being removed, remove the input too — an input
that silently discards what a person types is worse than no input.`,
      );
    });
  }

  test("the form's Barcode field reaches the save", () => {
    assert.match(form, /<FormLabel>Barcode<\/FormLabel>/);
    assert.match(form, /createOnboardedItem\(\{[^}]*\bbarcode,/s);
  });

  test("a scanned code opens the session; a typed one is linked after the row exists", () => {
    // The restored wizard scans before anything is created, so — unlike the
    // rewrite's form, which opened the session on mount — it has a truthful
    // code to hand `start`, and `confirm` registers it. A *typed* code that
    // differs is linked only after the poll: `linkItem` authorises against the
    // item's `created_by_id` and 404s on a row the outbox has not written.
    assert.match(start, /barcode: barcode\?\.text \?\? null/);
    const poll = create.indexOf("ItemSummaryQuery,");
    const ensure = create.indexOf(".mutation(EnsureBarcodeMutation");
    assert.ok(
      poll > 0 && ensure > poll,
      "ensureBarcode must run after the poll",
    );
  });
});

/* --------------------------------------------------------------------------
 * 7 · Codes come back canonical, and are shown as printed
 * ----------------------------------------------------------------------- */

describe("barcodes are displayed in their label form", () => {
  test("displayBarcode is packages/contracts' own function, not a copy", async () => {
    // A copy would be one more hand-kept mirror of the canonical rules; the
    // round-trip property is proven once, in packages/contracts.
    const contracts = await import(
      "../../../../../packages/contracts/src/barcodes.ts"
    );
    assert.equal(displayBarcode, contracts.displayBarcode);
  });

  test("a stored GTIN-14 is shown as the label prints it", () => {
    assert.equal(displayBarcode("00081240050376"), "081240050376");
    assert.equal(displayBarcode("04006381333931"), "4006381333931");
    assert.equal(displayBarcode("00042100005264", "UPC_E"), "04252614");
    assert.equal(displayBarcode("ABC123"), "ABC123");
  });

  /**
   * Every `x.barcode` / `x.barcodeCode` a component reads is either a null
   * check or the argument of `displayBarcode(...)`. A regex over source, so it
   * sees member reads only: `data?.barcode` (optional chaining) is the lookup
   * *result* union, not a code, and is skipped by construction; a code
   * destructured into a local first is not seen at all.
   */
  test("every barcode a component renders goes through displayBarcode", () => {
    const srcDir = join(repoRoot, "services/client/src");
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx$/.test(path) && !/\.test\.tsx$/.test(path)) {
          files.push(path);
        }
      }
    };
    walk(srcDir);

    const raw: string[] = [];
    let displayed = 0;
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const reads = /\b[A-Za-z_$][\w$]*\.(?:barcode|barcodeCode)\b/g;
      for (;;) {
        const match = reads.exec(source);
        if (match === null) break;
        const after = source.slice(match.index + match[0].length);
        if (/^\s*[!=]==/.test(after)) continue;
        const before = source.slice(0, match.index);
        if (/displayBarcode\(\s*$/.test(before)) {
          displayed++;
          continue;
        }
        const line = before.split("\n").length;
        raw.push(`${relative(repoRoot, file)}:${line}: ${match[0]}`);
      }
    }

    // Guards the scan: it walked the components. There is no known site any
    // more: the restored item page (82450ad1's, wave 3a) shows no barcode
    // line, and the restored onboarding wizard (wave 4) only ever shows the
    // code its own scanner read, as printed — the rewrite's form that echoed
    // a stored (canonical) code back went with it. `displayed` is still
    // counted so a new site is seen through `displayBarcode` or reported.
    assert.ok(files.length > 50, `walked only ${files.length} .tsx files`);
    assert.ok(displayed >= 0);
    assert.deepEqual(
      raw,
      [],
      `A barcode is rendered without displayBarcode:

${raw.join("\n")}

Codes come back from the API canonical — GTIN-14, so a can labelled
081240050376 reads 00081240050376. Wrap the read in displayBarcode(code, type)
(src/lib/items/barcode.ts); what it returns canonicalises back to the same key
when typed in, so it is also safe to prefill an input with.`,
    );
  });
});
