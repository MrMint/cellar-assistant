/**
 * Every `ITEM_FORM_RULES` key, against the schema the API prints and serves.
 *
 * A form field's key has to be two things at once, and both used to be claims
 * in a comment rather than anything a build could check:
 *
 *  1. **Writable** — a field of the matching `*AttributesInput`, because
 *     `ItemEditForm`'s `onSave` splices `field.key` verbatim into the attribute
 *     bag. `SAKE` declared `vintage` where the input has only `vintageYear`,
 *     and the whole `updateItem` failed with
 *     `Field "vintage" is not defined by type "SakeAttributesInput"` — but only
 *     once somebody filled the field in. On the add wizard, where the bag
 *     crosses as `attributes: JSON`, it was worse: nothing failed and the year
 *     was dropped.
 *  2. **Readable** — a field of the matching object type, because the edit form
 *     pre-fills from `ItemAttributesFragment`. Six fields were flagged
 *     `writeOnly` on the premise that their object type did not expose them;
 *     all six do, and the form was blanking them on every visit.
 *
 * ## What this covers that `tsc` cannot
 *
 * `AttributeKey<T>` in `itemFormRules.ts` now requires both halves, derived
 * from `packages/schema/graphql-env.d.ts` — so either mistake is a compile
 * error and neither needs a comment to be remembered. This is the runtime
 * half of the same check, for the case the type cannot see: a key typed as
 * a plain `string` somewhere upstream, or an `as` cast.
 *
 * It reads `packages/schema/schema.graphql`, the SDL `services/api` prints and
 * its snapshot test keeps identical to what it serves. It used to introspect a
 * running API instead, on the premise that the deployed build could lag the
 * SDL — and so skipped, all twelve cases, whenever the stack was down, which
 * in CI was always. The lag it guarded against (`reason` selected before the
 * API served it) is a deploy-order question, not a document one.
 *
 *   bun run --filter @cellar-assistant/client test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildSchema, isInputObjectType, isObjectType } from "graphql";
import { ITEM_FORM_RULES } from "@/components/item-api/itemFormRules";
import { type ApiItemType, ITEM_TYPES } from "@/components/item-api/itemTypes";

const schema = buildSchema(
  readFileSync(
    fileURLToPath(
      new URL("../../../../../packages/schema/schema.graphql", import.meta.url),
    ),
    "utf8",
  ),
);

/** `WINE` → `Wine`, the object type. The same derivation `AttributeKey` makes. */
const objectTypeName = (type: ApiItemType): string =>
  `${type.charAt(0)}${type.slice(1).toLowerCase()}`;

/** `WINE` → `WineAttributesInput`. */
const inputTypeName = (type: ApiItemType): string =>
  `${objectTypeName(type)}AttributesInput`;

/** The field names of one object or input type, failing if it is neither. */
const fieldsOf = (name: string): Set<string> => {
  const type = schema.getType(name);
  assert.ok(
    isObjectType(type) || isInputObjectType(type),
    `schema.graphql has no object or input type ${name}`,
  );
  return new Set(Object.keys(type.getFields()));
};

/** The keys of one item type that the named GraphQL type does not have. */
const absentFrom = (type: ApiItemType, graphqlType: string): string[] => {
  const fields = fieldsOf(graphqlType);
  return ITEM_FORM_RULES[type].attributes
    .map((field) => field.key)
    .filter((key) => !fields.has(key));
};

describe("ITEM_FORM_RULES keys against packages/schema/schema.graphql", () => {
  test("every item type has rules to check", () => {
    for (const type of ITEM_TYPES) {
      assert.ok(
        ITEM_FORM_RULES[type].attributes.length > 0,
        `${type} has no attribute rules`,
      );
    }
  });

  for (const type of ITEM_TYPES) {
    test(`every ${type} key is writable on ${inputTypeName(type)}`, () => {
      const name = inputTypeName(type);
      const missing = absentFrom(type, name);
      assert.deepEqual(
        missing,
        [],
        `${type} declares ${missing.join(", ")}, which ${name} does not accept — ` +
          "the mutation fails on the edit form and the value is silently " +
          "dropped by the add wizard",
      );
    });

    test(`every ${type} key is readable on ${objectTypeName(type)}`, () => {
      const name = objectTypeName(type);
      const missing = absentFrom(type, name);
      assert.deepEqual(
        missing,
        [],
        `${type} declares ${missing.join(", ")}, which ${name} does not return — ` +
          "the edit form cannot pre-fill it, so every visit would blank a " +
          "value the user has already set",
      );
    });
  }
});
