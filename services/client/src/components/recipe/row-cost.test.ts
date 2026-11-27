/**
 * The API refuses a document that asks for more than `MAX_QUERY_ROWS` rows
 * (`services/api/src/limits.ts`, `queryCostRule`); a page nested in a page
 * multiplies. R2 added `recipes(first: 20)` to the group page and `me` and
 * the pick to the versions page: this runs the server's own rule, against
 * the checked-in SDL, over every recipe document (as
 * `tier-list/lists/row-cost.test.ts` does for lists).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildSchema, type DocumentNode, Kind, validate } from "graphql";
import { queryCostRule } from "../../../../api/src/limits.ts";
import * as editorDocuments from "./editor/documents";
import * as recipeQueries from "./queries";

const schema = buildSchema(
  readFileSync(
    fileURLToPath(
      new URL("../../../../../packages/schema/schema.graphql", import.meta.url),
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

describe("recipe documents stay under the API's row limit", () => {
  const all = [...operations(recipeQueries), ...operations(editorDocuments)];

  test("there are documents to check", () => {
    assert.ok(all.length >= 8, `found ${all.length}`);
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
