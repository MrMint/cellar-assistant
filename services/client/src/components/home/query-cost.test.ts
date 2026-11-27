/**
 * Every document Home sends stays under the API's row limit
 * (`services/api/src/limits.ts`, `queryCostRule`), run against the
 * checked-in SDL, as `tier-list/lists/row-cost.test.ts` does. The inbox
 * nests open bottles' fields, and the continue read nests brands, so a
 * page in a page is the risk this guards.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildSchema, type DocumentNode, Kind, validate } from "graphql";
import { queryCostRule } from "../../../../api/src/limits.ts";
import * as searchQueries from "../search/queries";
import * as homeQueries from "./queries";

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

describe("Home's documents stay under the API's row limit", () => {
  const all = [
    ...operations(homeQueries),
    ...operations({
      SearchCollectionStatsQuery: searchQueries.SearchCollectionStatsQuery,
      SearchNearbyPlacesQuery: searchQueries.SearchNearbyPlacesQuery,
    }),
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
