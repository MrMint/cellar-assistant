/**
 * E2c · `STATIC_OPTIONS` against the Postgres enums it is a copy of.
 *
 * ## Why this file exists
 *
 * Six of the item form's pickers are backed by a `pgEnum` rather than by a
 * reference table, so they cannot come from `referenceData` the way the other
 * ten do — `itemFormRules.ts` types their labels out by hand. Nothing held that
 * copy to the database, and it had already drifted:
 * `STATIC_OPTIONS.sakeServingTemperature` listed seven of
 * `sake_serving_temperature`'s nine labels, missing `tobikiri_kan` and
 * `yuki_hie`.
 *
 * That is not a cosmetic gap, for two reasons that only meet here:
 *
 *  1. **`SakeAttributesInput.servingTemperature` is `String` in the SDL**, not
 *     the `SakeServingTemperature` enum the same schema defines. So GraphQL
 *     will not refuse a bad label; the picker is the only guard, and a picker
 *     missing two options makes two legal values unreachable by hand.
 *  2. **X1b constrains the model to the full nine.** `SAKE_SERVING_TEMPERATURES`
 *     in `@cellar-assistant/contracts` feeds the item-defaults output schema, so
 *     an extraction can legitimately propose `yuki_hie` — a value the server's
 *     `requireInVocabulary` accepts and this form had no option for.
 *
 * ## Why it reads the file rather than importing it
 *
 * `packages/db` is not a dependency of `@cellar-assistant/client` and should not
 * become one for a test — the client has no business importing Drizzle. So this
 * reads `packages/db/src/schema/tables.ts` off disk and pulls the labels out of
 * the `pgEnum(...)` calls, the way `capability-claims.test.ts` reads the SDL and
 * `upload-surface.test.ts` reads the schema file. The source of truth stays the
 * database's own schema; this file only refuses to let the copy diverge from it.
 *
 *   bun run --filter @cellar-assistant/client test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  STATIC_OPTIONS,
  type StaticSource,
  staticOptionValues,
} from "../../components/item-api/itemFormRules.ts";

const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));

const tables = readFileSync(
  join(repoRoot, "packages/db/src/schema/tables.ts"),
  "utf8",
);

/**
 * Which `pgEnum` each picker copies. Written out rather than derived from the
 * key by snake-casing it: a mapping that guesses is a mapping that can silently
 * guess wrong and then assert nothing.
 */
const PG_ENUM: readonly (readonly [StaticSource, string])[] = [
  ["coffeeRoastLevel", "coffee_roast_level"],
  ["coffeeSpecies", "coffee_species"],
  ["coffeeProcess", "coffee_process"],
  ["teaForm", "tea_form"],
  ["teaCaffeineLevel", "tea_caffeine_level"],
  ["sakeServingTemperature", "sake_serving_temperature"],
];

/** The labels of one `pgEnum("<name>", [...])` declaration, in file order. */
const pgEnumLabels = (name: string): string[] => {
  const declaration = new RegExp(
    `pgEnum\\(\\s*"${name}"\\s*,\\s*\\[([^\\]]*)\\]`,
  ).exec(tables);
  assert.notEqual(
    declaration,
    null,
    `packages/db/src/schema/tables.ts declares no pgEnum("${name}") — either ` +
      "the enum was renamed or dropped, and this picker now offers values no " +
      "column accepts.",
  );
  const body = declaration?.[1] ?? "";
  return Array.from(body.matchAll(/"([^"]+)"/g)).map((match) => match[1]);
};

describe("STATIC_OPTIONS vs the Postgres enums", () => {
  for (const [source, enumName] of PG_ENUM) {
    test(`${source} offers every ${enumName} label`, () => {
      const expected = pgEnumLabels(enumName);
      const offered: readonly string[] = STATIC_OPTIONS[source];

      const missing = expected.filter((label) => !offered.includes(label));
      assert.deepEqual(
        missing,
        [],
        `${source} is missing ${missing.join(", ")}. ${enumName} accepts them, ` +
          "the GraphQL input is a plain String so nothing else refuses a bad " +
          "one, and X1b lets the model propose them — a label with no option " +
          "is a value nobody can pick and an extraction that goes nowhere.",
      );

      const invented = offered.filter((label) => !expected.includes(label));
      assert.deepEqual(
        invented,
        [],
        `${source} offers ${invented.join(", ")}, which ${enumName} does not ` +
          "accept. Picking one is a constraint violation raised inside the " +
          "outbox, where nobody sees it.",
      );
    });
  }

  test("every static field in the rules resolves to a real option list", () => {
    // The lookup the merge uses. A field whose `options` key has no table is a
    // picker that renders empty, which is the failure this whole file is about.
    for (const [source] of PG_ENUM) {
      assert.notEqual(staticOptionValues(source), null, source);
    }
    // Totality: an added `pgEnum`-backed picker that nobody mapped here would
    // otherwise be checked by nothing at all.
    assert.deepEqual(
      Object.keys(STATIC_OPTIONS).sort(),
      PG_ENUM.map(([source]) => source).sort(),
      "STATIC_OPTIONS and PG_ENUM name different pickers — a picker missing " +
        "from PG_ENUM is one this file silently does not check.",
    );
    assert.equal(staticOptionValues("nonexistentPicker"), null);
    assert.equal(staticOptionValues(undefined), null);
  });
});
