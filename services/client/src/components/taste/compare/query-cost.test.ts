/**
 * Every document S1's screens send stays under the API's row limit
 * (`queryCostRule`, `services/api/src/limits.ts`): a `first: $first` is
 * costed at `MAX_PAGE_SIZE`, and nested pages multiply. The rule is the
 * server's own, run against the checked-in SDL (as
 * `tier-list/lists/row-cost.test.ts` does for the lists).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildSchema, type DocumentNode, Kind, validate } from "graphql";
import { queryCostRule } from "../../../../../api/src/limits.ts";
import * as friendQueries from "../../friend/fragments";
import * as profileQueries from "../../profile/queries";
import * as compareQueries from "./queries";

const schema = buildSchema(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../../../../../packages/schema/schema.graphql",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
);

const operations = (module: Record<string, unknown>) =>
  Object.entries(module).filter(
    (entry): entry is [string, DocumentNode] =>
      typeof entry[1] === "object" &&
      entry[1] !== null &&
      (entry[1] as { kind?: unknown }).kind === Kind.DOCUMENT &&
      (entry[1] as DocumentNode).definitions.some(
        (definition) => definition.kind === Kind.OPERATION_DEFINITION,
      ),
  );

describe("friends, profile and compare documents stay under the row limit", () => {
  const all = [
    ...operations(compareQueries),
    ...operations(profileQueries),
    ...operations(friendQueries),
  ];

  test("there are documents to check", () => {
    assert.ok(all.length >= 10, `found ${all.length}`);
    assert.ok(all.some(([name]) => name === "TasteCompareQuery"));
    assert.ok(all.some(([name]) => name === "PersonQuery"));
  });

  for (const [name, document] of all) {
    test(name, () => {
      assert.deepEqual(
        validate(schema, document, [queryCostRule()]).map(
          (error) => error.message,
        ),
        [],
      );
    });
  }
});
