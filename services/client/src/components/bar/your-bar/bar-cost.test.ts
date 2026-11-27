/**
 * The API refuses a document that asks for more than `MAX_QUERY_ROWS` rows
 * (`services/api/src/limits.ts`, `queryCostRule`), and a page nested in a
 * page multiplies: a `first: $first` is costed at `MAX_PAGE_SIZE`, since a
 * variable has no value at validation time. `/tier-lists` once 500'd on
 * exactly that (ListsIndex: 100 lists × 113 rows each). This runs the
 * server's own rule, against the checked-in SDL, over every document Your
 * bar, the pantry, Make mode and the brew guide send (wave 3 shipped a 500 by
 * missing this).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildSchema, type DocumentNode, Kind, validate } from "graphql";
import { queryCostRule } from "../../../../../api/src/limits.ts";
import * as makeQueries from "../../make/brew-queries";
import * as barQueries from "../queries";

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

describe("bar and make documents stay under the API's row limit", () => {
  const all = [...operations(barQueries), ...operations(makeQueries)];

  test("there are documents to check", () => {
    assert.ok(all.length >= 7, `found ${all.length}`);
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
