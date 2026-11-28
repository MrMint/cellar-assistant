/**
 * Every GraphQL document the client sends, validated against the checked-in
 * SDL with graphql-js's **full** rule set — offline, in the client suite.
 *
 * ## Why this exists
 *
 * `tsc` does not catch an invalid document. gql.tada types a result from the
 * document it parses, so a field the schema lacks types as `unknown` instead
 * of failing the build, and a selection that cannot merge (`style` as
 * `String!` on one item type and `String` on another; `code` as `String!` on
 * `Barcode` and `ActorErrorCode!` on the errors) type-checks cleanly. D3 hit
 * that three times, and every one was a hard `GRAPHQL_VALIDATION_FAILED` at
 * the server.
 *
 * The guard used to be ~66 tests in nine files that each signed in and POSTed
 * their module's documents to a running API — and each skipped itself when
 * the stack was down, which in `app-ci` is always. So the suite's green was,
 * for those files, a count of skips. This is the same check with no network:
 * `validate(buildSchema(schema.graphql), document)` is what graphql-yoga runs
 * before executing, and `schema.graphql` is exactly what `services/api`
 * prints (its snapshot test fails otherwise), so a document valid here is
 * valid there.
 *
 * ## What it validates
 *
 * The documents themselves, imported — not their source text. A gql.tada
 * `graphql()` call returns the operation with every fragment it reaches
 * appended, deduplicated by identity and with `@_unmask` stripped, which is
 * the document URQL puts on the wire. (URQL then adds `__typename` to each
 * selection set; that can never make a document invalid.)
 *
 * **Completeness is checked, not assumed**: every non-test file under `src/`
 * with a `graphql()` call must be in {@link MODULES}, and must export as many
 * documents as it has calls — a document kept module-local would otherwise
 * never be imported and never checked. That scan looks for the identifier
 * `graphql`, so `import { graphql as gql }` walks past it; the backstop is
 * `services/api/src/client-documents.test.ts`, which finds calls by symbol and
 * runs the same full rule set over every one (with a negative control for
 * exactly that rename).
 *
 * The one live check that survives is `round-trip.test.ts`, which proves the
 * transport rather than the documents.
 *
 *   bun run --filter @cellar-assistant/client test
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildSchema,
  type DocumentNode,
  Kind,
  NoUnusedFragmentsRule,
  print,
  specifiedRules,
  validate,
} from "graphql";
import ts from "typescript";
import * as barQueries from "@/components/bar/queries";
import * as brandQueries from "@/components/brand/queries";
import * as captureQueries from "@/components/capture/queries";
import * as cellarFragments from "@/components/cellar/fragments";
import * as cellarListRate from "@/components/cellar/list/rate";
import * as onboardingQueries from "@/components/common/OnboardingWizard/queries";
import * as draftsQueries from "@/components/drafts/queries";
import * as drinkLogQueries from "@/components/drink-log/queries";
import * as favoritesFragments from "@/components/favorites/fragments";
import * as lovedRecipes from "@/components/favorites/loved-recipes";
import * as friendFragments from "@/components/friend/fragments";
import * as homeQueries from "@/components/home/queries";
import * as itemFragments from "@/components/item/fragments";
import * as itemCardFragments from "@/components/item/ItemCard/fragments";
import * as itemSeenAt from "@/components/item/seen-at";
import * as makeBrewQueries from "@/components/make/brew-queries";
import * as placeListOwners from "@/components/map/places/own-list-entries";
import * as mapQueries from "@/components/map/queries";
import * as scanHeaderRename from "@/components/map/scanning/header-rename";
import * as menuLinesQueries from "@/components/menu-lines/queries";
import * as pourQueries from "@/components/pour/queries";
import * as profileQueries from "@/components/profile/queries";
import * as rankingFragments from "@/components/ranking/fragments";
import * as recapData from "@/components/recap/recap-data";
import * as recipeEditorDocuments from "@/components/recipe/editor/documents";
import * as recipeFragments from "@/components/recipe/fragments";
import * as recipeQueries from "@/components/recipe/queries";
import * as searchQueries from "@/components/search/queries";
import * as universalSearch from "@/components/search/universal-search";
import { SECTION_LIMITS } from "@/components/search/universal-search";
import * as shareQueries from "@/components/share/queries";
import * as tasteCompareQueries from "@/components/taste/compare/queries";
import * as tasteQueries from "@/components/taste/queries";
import * as tierListFragments from "@/components/tier-list/fragments";
import * as tierListQueries from "@/components/tier-list/queries";
import * as userFragments from "@/components/user/fragments";
import * as meHubData from "@/components/user/me-hub-data";
import * as whoSeesCellars from "@/components/user/WhoSeesCellars";
import * as wantToTryQueries from "@/components/want-to-try/queries";
import * as ai from "./ai.ts";
import * as cellars from "./cellars.ts";
import * as errors from "./errors.ts";
import * as files from "./files.ts";
import * as itemCorrection from "./item-correction.ts";
import * as items from "./items.ts";
import * as recipePhotos from "./recipe-photos.ts";

const CLIENT_SRC = fileURLToPath(new URL("../..", import.meta.url));
const SCHEMA_PATH = fileURLToPath(
  new URL("../../../../../packages/schema/schema.graphql", import.meta.url),
);

/** Every module that defines documents, by its path under `src/`. */
const MODULES: Readonly<Record<string, Record<string, unknown>>> = {
  "components/bar/queries.ts": barQueries,
  "components/brand/queries.ts": brandQueries,
  "components/capture/queries.ts": captureQueries,
  "components/cellar/fragments.ts": cellarFragments,
  "components/cellar/list/rate.ts": cellarListRate,
  "components/common/OnboardingWizard/queries.ts": onboardingQueries,
  "components/drafts/queries.ts": draftsQueries,
  "components/drink-log/queries.ts": drinkLogQueries,
  "components/favorites/fragments.ts": favoritesFragments,
  "components/favorites/loved-recipes.ts": lovedRecipes,
  "components/friend/fragments.ts": friendFragments,
  "components/home/queries.ts": homeQueries,
  "components/item/ItemCard/fragments.ts": itemCardFragments,
  "components/item/fragments.ts": itemFragments,
  "components/item/seen-at.ts": itemSeenAt,
  "components/make/brew-queries.ts": makeBrewQueries,
  "components/map/queries.ts": mapQueries,
  "components/map/places/own-list-entries.ts": placeListOwners,
  "components/map/scanning/header-rename.ts": scanHeaderRename,
  "components/menu-lines/queries.ts": menuLinesQueries,
  "components/pour/queries.ts": pourQueries,
  "components/profile/queries.ts": profileQueries,
  "components/ranking/fragments.ts": rankingFragments,
  "components/recap/recap-data.ts": recapData,
  "components/recipe/editor/documents.ts": recipeEditorDocuments,
  "components/recipe/fragments.ts": recipeFragments,
  "components/recipe/queries.ts": recipeQueries,
  "components/search/queries.ts": searchQueries,
  "components/search/universal-search.ts": universalSearch,
  "components/share/queries.ts": shareQueries,
  "components/taste/compare/queries.ts": tasteCompareQueries,
  "components/taste/queries.ts": tasteQueries,
  "components/tier-list/fragments.ts": tierListFragments,
  "components/tier-list/queries.ts": tierListQueries,
  "components/tier-list/lists/queries.ts": await import(
    "@/components/tier-list/lists/queries"
  ),
  "components/user/fragments.ts": userFragments,
  "components/want-to-try/queries.ts": wantToTryQueries,
  "components/user/me-hub-data.ts": meHubData,
  "components/user/WhoSeesCellars.tsx": whoSeesCellars,
  "lib/api/ai.ts": ai,
  "lib/api/cellars.ts": cellars,
  "lib/api/errors.ts": errors,
  "lib/api/files.ts": files,
  "lib/api/item-correction.ts": itemCorrection,
  "lib/api/items.ts": items,
  "lib/api/recipe-photos.ts": recipePhotos,
};

const isDocument = (value: unknown): value is DocumentNode =>
  typeof value === "object" &&
  value !== null &&
  (value as { kind?: unknown }).kind === Kind.DOCUMENT;

const isOperation = (document: DocumentNode): boolean =>
  document.definitions.some(
    (definition) => definition.kind === Kind.OPERATION_DEFINITION,
  );

type Entry = { module: string; name: string; document: DocumentNode };

const entries: Entry[] = Object.entries(MODULES).flatMap(([module, exports]) =>
  Object.entries(exports)
    .filter((entry): entry is [string, DocumentNode] => isDocument(entry[1]))
    .map(([name, document]) => ({ module, name, document })),
);
const operations = entries.filter((entry) => isOperation(entry.document));
const fragments = entries.filter((entry) => !isOperation(entry.document));

/**
 * A fragment exported on its own is not a sendable document, so the one rule
 * that is about the *document* rather than the selection — every fragment
 * must be spread — is the one it is exempt from. Everything else about it is
 * checked, including against the type it claims to be on.
 */
const FRAGMENT_RULES = specifiedRules.filter(
  (rule) => rule !== NoUnusedFragmentsRule,
);

/** `graphql()` calls per source file, read from the TypeScript AST. */
const graphqlCallsByFile = (): Map<string, number> => {
  const counts = new Map<string, number>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (entry !== "node_modules") walk(path);
        continue;
      }
      if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
      const text = readFileSync(path, "utf8");
      if (!text.includes("graphql(")) continue;
      const source = ts.createSourceFile(
        path,
        text,
        ts.ScriptTarget.ESNext,
        true,
        path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      let calls = 0;
      const visit = (node: ts.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "graphql"
        ) {
          calls += 1;
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
      if (calls > 0) counts.set(relative(CLIENT_SRC, path), calls);
    }
  };
  walk(CLIENT_SRC);
  return counts;
};

describe("client documents against packages/schema/schema.graphql", () => {
  const schema = buildSchema(readFileSync(SCHEMA_PATH, "utf8"));

  test("every module that calls graphql() is listed here", () => {
    const onDisk = [...graphqlCallsByFile().keys()].sort();
    assert.deepEqual(
      onDisk,
      Object.keys(MODULES).sort(),
      "Add the module to MODULES in documents.test.ts (or remove a stale entry): " +
        "a document in an unlisted file is never validated.",
    );
  });

  test("every graphql() call is an exported document", () => {
    const calls = graphqlCallsByFile();
    const mismatched = Object.keys(MODULES).flatMap((module) => {
      const exported = entries.filter(
        (entry) => entry.module === module,
      ).length;
      const called = calls.get(module) ?? 0;
      return exported === called
        ? []
        : [`${module}: ${called} graphql() calls, ${exported} exported`];
    });
    assert.deepEqual(
      mismatched,
      [],
      "Export every document so it can be imported and validated here.",
    );
  });

  test("the count is not a vacuous pass", () => {
    // ~140 operations and ~40 fragments today. The floors leave room for the
    // client to shrink without leaving room for the import to go blind.
    assert.ok(operations.length > 100, `${operations.length} operations`);
    assert.ok(fragments.length > 20, `${fragments.length} fragments`);
  });

  for (const { module, name, document } of operations) {
    test(`${module} ${name}`, () => {
      assert.deepEqual(
        validate(schema, document).map((error) => error.message),
        [],
      );
    });
  }

  for (const { module, name, document } of fragments) {
    test(`${module} ${name} (fragment)`, () => {
      assert.deepEqual(
        validate(schema, document, FRAGMENT_RULES).map(
          (error) => error.message,
        ),
        [],
      );
    });
  }
});

/**
 * Argument *values*, which validation does not look at.
 *
 * A literal is type-correct whatever its size, so these are the two caps the
 * SDL documents in prose and cannot enforce — each a runtime `VALIDATION`
 * error that no amount of type-checking would find. (The API's own tests pin
 * the caps themselves: `services/api/src/schema/schema.test.ts`.)
 */
describe("argument values the schema documents but cannot enforce", () => {
  test("no document asks for more than the API's connection cap of 100", () => {
    // A7c item 6 / A7d item 2: a `first` over 100 on a plain connection field
    // escapes as a top-level error with `data: null`, taking every sibling
    // alias in the document down with it. Variables are the callers' concern;
    // this catches the literals.
    const over = operations.flatMap(({ module, name, document }) =>
      [...print(document).matchAll(/\bfirst:\s*(\d+)/g)]
        .filter((match) => Number(match[1]) > 100)
        .map((match) => `${module} ${name}: first: ${match[1]}`),
    );
    assert.deepEqual(over, []);
  });

  test("universal search's limits stay inside each search's documented cap", () => {
    // Each `limit` description in the SDL reads "1 to N inclusive … over the
    // cap is a VALIDATION error rather than a silent clamp (A7g)"; the
    // sections pass these constants as both `limit` and `first`, so only a
    // test holds them to the documented ranges.
    const caps = {
      bottles: 50,
      items: 50,
      places: 50,
      recipes: 50,
      people: 10,
      brands: 100,
    } as const;
    for (const [section, cap] of Object.entries(caps)) {
      const limit = SECTION_LIMITS[section as keyof typeof caps];
      assert.ok(
        limit >= 1 && limit <= cap,
        `SECTION_LIMITS.${section} is ${limit}; the search accepts 1-${cap}`,
      );
    }
  });
});
