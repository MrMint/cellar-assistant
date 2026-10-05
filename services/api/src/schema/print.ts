/**
 * The printed schema is a checked-in artefact, not a build output:
 * `packages/schema/schema.graphql` is what gql.tada generates types from (so
 * the frontend never introspects a running server), and what the snapshot test
 * compares against.
 *
 * `lexicographicSortSchema` makes the file independent of module import order,
 * so a diff shows the change and nothing else.
 */
import {
  assertValidSchema,
  lexicographicSortSchema,
  printSchema,
} from "graphql";
import { schema } from "./index.ts";

/** `packages/schema/schema.graphql`, resolved from this file. */
export const SCHEMA_FILE = new URL(
  "../../../../packages/schema/schema.graphql",
  import.meta.url,
);

const HEADER = `# GENERATED — do not edit.
# Printed from services/api by \`bun run --filter @cellar-assistant/api schema:print\`.
# A change here is a schema change: call it out in the PR (plan §7).
`;

export const printApiSchema = (): string => {
  // Cheap, and it catches the one mistake `printSchema` will happily emit:
  // an object type that implements an interface but not that interface's own
  // interfaces. graphql-js rejects such a schema at execution time.
  assertValidSchema(schema);
  return `${HEADER}\n${printSchema(lexicographicSortSchema(schema))}`;
};
