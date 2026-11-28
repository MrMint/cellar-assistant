/**
 * Every GraphQL document in `services/actors/scripts/demo-seed.ts` is valid
 * against `packages/schema/schema.graphql` — offline, like the e2e suite's
 * documents are (`e2e-documents.test.ts`).
 *
 * The demo seed (`bun run dev:seed:demo`) sends raw strings, so nothing else
 * type-checks them, and it is run rarely enough that a renamed field would go
 * unnoticed until the next time someone needs demo data. Its documents are
 * the `gql`-tagged templates in that file; this harvests each one and runs
 * graphql-js's `validate` over it.
 *
 *   bun run --filter @cellar-assistant/client test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildSchema, parse, validate } from "graphql";
import ts from "typescript";

const SEED_PATH = fileURLToPath(
  new URL(
    "../../../../../services/actors/scripts/demo-seed.ts",
    import.meta.url,
  ),
);
const SCHEMA_PATH = fileURLToPath(
  new URL("../../../../../packages/schema/schema.graphql", import.meta.url),
);

type Harvested = { where: string; text: string };

const harvest = (): Harvested[] => {
  const text = readFileSync(SEED_PATH, "utf8");
  const source = ts.createSourceFile(
    SEED_PATH,
    text,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  );
  const found: Harvested[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isTaggedTemplateExpression(node) &&
      ts.isIdentifier(node.tag) &&
      node.tag.text === "gql"
    ) {
      const line =
        source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      assert.ok(
        ts.isNoSubstitutionTemplateLiteral(node.template),
        `demo-seed.ts:${line}: a gql document with \${…} cannot be validated offline`,
      );
      found.push({ where: `demo-seed.ts:${line}`, text: node.template.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};

describe("demo seed GraphQL documents", () => {
  const schema = buildSchema(readFileSync(SCHEMA_PATH, "utf8"));
  const documents = harvest();

  test("the harvest finds the seed's documents", () => {
    // A rename of the `gql` tag would otherwise pass with nothing checked.
    assert.ok(documents.length >= 25, `found only ${documents.length}`);
  });

  for (const { where, text } of documents) {
    test(where, () => {
      const errors = validate(schema, parse(text)).map((e) => e.message);
      assert.deepEqual(errors, []);
    });
  }
});
