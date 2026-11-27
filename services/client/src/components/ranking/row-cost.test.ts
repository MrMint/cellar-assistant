/**
 * The API refuses a document that asks for more than `MAX_QUERY_ROWS` rows
 * (`services/api/src/limits.ts`, `queryCostRule`), and a nested page
 * multiplies. This runs the server's own rule, against the checked-in SDL,
 * over every document the rankings, recap and taste-profile screens send
 * (the pattern of `tier-list/lists/row-cost.test.ts`).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildSchema, type DocumentNode, Kind, validate } from "graphql";
import { queryCostRule } from "../../../../api/src/limits.ts";
import * as recapData from "../recap/recap-data";
import * as tasteQueries from "../taste/queries";
import * as rankingQueries from "./fragments";

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

describe("rankings, recap and taste documents stay under the API's row limit", () => {
  const all = [
    ...operations(rankingQueries),
    ...operations(recapData),
    ...operations(tasteQueries),
  ];

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
