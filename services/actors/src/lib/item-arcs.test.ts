/**
 * `ARCS` against the schema, and the rule that keeps arc maps out of actors.
 *
 * ## Coverage — discovered, not listed
 *
 * `item-country-fk.test.ts`'s reason: a hand-written list of arc tables would
 * share the blind spot of whoever wrote it. The arc tables are found here from
 * the Drizzle declaration through `getTableConfig`: every table with two or
 * more columns that are foreign keys into the item tables. Each must be in
 * `ARCS`, each arc column must point at *its own* type's table (so a `wine`
 * column cannot be mapped to `BEER`), all six must be present unless the
 * table is a documented exception, and the table's `num_nonnulls(...)` check
 * must name exactly the arc's columns plus its documented extras.
 *
 * ## The rule — parsed, not grepped
 *
 * Under `services/actors/src` (tests and `item-arcs.ts` itself excepted):
 *
 *  1. no `sql.raw(...)` whose literal text names an `_id` column — a column is
 *     rendered through `sql.identifier` or a template, never spliced as text;
 *  2. no `sql` template whose static text names two or more arc columns — a
 *     hand-typed `coalesce(...)`, `CASE` or `DISTINCT ON` list;
 *  3. no object literal keyed by two or more item types whose values name arc
 *     columns or properties, and no `[TYPE, <arc column>]` tuple list — a
 *     hand-written `ItemType → column` map.
 *
 * Each detector has a fixture it must flag, so a rule that silently stopped
 * matching fails here rather than passing vacuously.
 */
import {
  lineOf,
  PROGRAM_TIMEOUT_MS,
  referencedSymbol,
  relativePath,
  sourceFileAt,
  sourceFiles,
} from "@cellar-assistant/analysis";
import { ITEM_TYPES, type ItemType } from "@cellar-assistant/contracts";
import { tables } from "@cellar-assistant/db";
import { is, type SQL } from "@cellar-assistant/db/orm";
import { getTableConfig, PgDialect, PgTable } from "drizzle-orm/pg-core";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ACTORS_SRC,
  actorsFixture,
  actorsProject,
} from "./analysis-testing.ts";
import { ARCS, type ItemArc } from "./item-arcs.ts";
import { ITEM_TABLES } from "./item-bindings.ts";

const dialect = new PgDialect();
const render = (fragment: SQL): { sql: string; params: unknown[] } => {
  const { sql, params } = dialect.sqlToQuery(fragment);
  return { sql, params };
};

/* -------------------------------------------------------------------------- */
/* Coverage                                                                    */
/* -------------------------------------------------------------------------- */

const ITEM_TABLE_NAMES = new Map<string, ItemType>(
  ITEM_TYPES.map((type) => [getTableConfig(ITEM_TABLES[type]).name, type]),
);

type DiscoveredArc = {
  readonly table: string;
  /** SQL column name → the item type its foreign key points at. */
  readonly columns: ReadonlyMap<string, ItemType>;
  readonly checks: readonly string[];
};

/** Every table with ≥2 foreign-key columns into the item tables. */
const discoverArcTables = (): DiscoveredArc[] => {
  const found: DiscoveredArc[] = [];
  for (const table of Object.values(tables)) {
    if (!is(table, PgTable)) continue;
    const config = getTableConfig(table);
    const columns = new Map<string, ItemType>();
    for (const fk of config.foreignKeys) {
      const reference = fk.reference();
      const type = ITEM_TABLE_NAMES.get(
        getTableConfig(reference.foreignTable).name,
      );
      if (type === undefined || reference.columns.length !== 1) continue;
      const [column] = reference.columns;
      if (column !== undefined) columns.set(column.name, type);
    }
    if (columns.size < 2) continue;
    found.push({
      table: config.name,
      columns,
      checks: config.checks.map((check) => render(check.value).sql),
    });
  }
  return found.sort((a, b) => a.table.localeCompare(b.table));
};

/**
 * Tables that may carry fewer than all six arc columns, with the reason. None
 * today: since `20260928043553_place_menu_items_sake_tea_matches` every arc
 * table has a column for every type. An entry here is a statement that a type
 * *cannot* be named from that table, and belongs in review.
 */
const PARTIAL_ARCS: Readonly<Record<string, string>> = {};

/**
 * Columns a table's `num_nonnulls` check counts besides its six arc columns,
 * and the comparison. Each extra is a non-item referent sharing the one slot.
 */
const CHECK_SHAPE: Readonly<
  Record<string, { readonly extra: readonly string[]; readonly op: string }>
> = {
  item_match_suggestions: { extra: ["suggested_recipe_id"], op: "= 1" },
  // A menu line may be unmatched, so at most one — not exactly one.
  place_menu_items: { extra: [], op: "<= 1" },
  recipe_ingredients: { extra: ["generic_item_id"], op: "= 1" },
  tier_list_items: { extra: ["place_id"], op: "= 1" },
};

const NUM_NONNULLS = /num_nonnulls\(([^)]*)\)\s*(=|<=)\s*1/;

describe("ARCS · coverage of the schema", () => {
  const discovered = discoverArcTables();
  const arcs = Object.values(ARCS) as ItemArc[];

  it("finds the arc tables at all", () => {
    // Ten today; asserted as "some" so the next assertion is not vacuous.
    expect(discovered.length).toBeGreaterThanOrEqual(10);
  });

  it("every table with an item arc is in ARCS, and nothing else is", () => {
    expect(arcs.map((arc) => arc.name).sort()).toEqual(
      discovered.map((table) => table.table),
    );
  });

  for (const table of discovered) {
    describe(table.table, () => {
      const arc = arcs.find((candidate) => candidate.name === table.table);

      it("each arc column is a foreign key into its own type's table", () => {
        expect(arc).toBeDefined();
        if (arc === undefined) return;
        for (const type of ITEM_TYPES) {
          const name = arc.columns[type].name;
          expect(
            { column: name, pointsAt: table.columns.get(name) ?? null },
            `${table.table}.${name}`,
          ).toEqual({ column: name, pointsAt: type });
        }
      });

      it("carries all six item types, or is a documented exception", () => {
        const types = new Set(table.columns.values());
        const missing = ITEM_TYPES.filter((type) => !types.has(type));
        if (missing.length > 0) {
          expect(
            PARTIAL_ARCS[table.table],
            `${table.table} has no column for ${missing.join(", ")}`,
          ).toBeDefined();
        }
        // …and no type twice, which `refOf` could not tell apart.
        expect(table.columns.size).toBe(types.size);
      });

      it("has a num_nonnulls check naming exactly its arc columns", () => {
        const matches = table.checks
          .map((check) => NUM_NONNULLS.exec(check))
          .filter((match): match is RegExpExecArray => match !== null)
          .filter((match) =>
            [...table.columns.keys()].some((column) =>
              (match[1] ?? "").includes(column),
            ),
          );
        expect(matches, `${table.table}: one arc check`).toHaveLength(1);
        const [match] = matches;
        if (match === undefined) return;
        const named = (match[1] ?? "")
          .split(",")
          .map((column) => column.trim())
          .sort();
        const shape = CHECK_SHAPE[table.table] ?? { extra: [], op: "= 1" };
        expect(named).toEqual([...table.columns.keys(), ...shape.extra].sort());
        expect(`${match[2]} 1`).toBe(shape.op);
      });
    });
  }
});

/* -------------------------------------------------------------------------- */
/* What an arc renders                                                         */
/* -------------------------------------------------------------------------- */

describe("itemArc · fragments", () => {
  const arc = ARCS.itemMatchSuggestions;
  const ref = {
    type: "SAKE",
    id: "00000000-0000-0000-0000-000000000001",
  } as const;

  it("where / column / isSet use the type's own column, aliased on request", () => {
    expect(render(arc.where(ref, "s"))).toEqual({
      sql: '"s"."suggested_sake_id" = $1',
      params: [ref.id],
    });
    expect(render(arc.isSet("TEA", "s")).sql).toBe(
      '"s"."suggested_tea_id" is not null',
    );
    expect(render(arc.unqualified("WINE")).sql).toBe('"suggested_wine_id"');
  });

  it("values sets one property; assign clears the other five", () => {
    expect(arc.values(ref)).toEqual({ suggestedSakeId: ref.id });
    expect(arc.assign(ref)).toEqual({
      suggestedWineId: null,
      suggestedBeerId: null,
      suggestedSpiritId: null,
      suggestedCoffeeId: null,
      suggestedSakeId: ref.id,
      suggestedTeaId: null,
    });
    expect(Object.values(arc.assign(null)).every((v) => v === null)).toBe(true);
  });

  it("refOf reads by property or by SQL column name", () => {
    expect(
      arc.refOf({ suggestedSakeId: ref.id, suggestedWineId: null }),
    ).toEqual(ref);
    expect(arc.refOf({ suggested_sake_id: ref.id }, "column")).toEqual(ref);
    expect(arc.refOf({ suggested_sake_id: ref.id })).toBeNull();
    expect(() => arc.requireRefOf({ id: "x" })).toThrow(/names no item/);
  });

  it("idExpr / typeExpr cover the six, or a subset in ITEM_TYPES order", () => {
    expect(render(ARCS.itemFavorites.idExpr("f")).sql).toBe(
      'coalesce("f"."wine_id", "f"."beer_id", "f"."spirit_id", "f"."coffee_id", "f"."sake_id", "f"."tea_id")',
    );
    expect(render(ARCS.itemVectors.typeExpr("m", ["TEA", "BEER"])).sql).toBe(
      `(case when "m"."beer_id" is not null then 'BEER' when "m"."tea_id" is not null then 'TEA' end)`,
    );
    // Only enum literals reach `sql.raw`, whatever is passed.
    expect(
      render(
        ARCS.itemVectors.typeExpr("m", ["x'; drop table t; --" as ItemType]),
      ).sql,
    ).toBe("(case  end)");
  });
});

/* -------------------------------------------------------------------------- */
/* The rule                                                                    */
/* -------------------------------------------------------------------------- */

/** Every SQL column name and row property an arc owns. */
const ARC_NAMES: ReadonlySet<string> = new Set(
  (Object.values(ARCS) as ItemArc[]).flatMap((arc) =>
    ITEM_TYPES.flatMap((type) => [
      arc.columns[type].name,
      arc.properties[type],
    ]),
  ),
);
const ARC_COLUMN_NAMES: readonly string[] = [
  ...new Set(
    (Object.values(ARCS) as ItemArc[]).flatMap((arc) =>
      ITEM_TYPES.map((type) => arc.columns[type].name),
    ),
  ),
];
const TYPE_NAMES: ReadonlySet<string> = new Set(ITEM_TYPES);

/** Arc column names appearing as whole words in `text`. */
const arcColumnsIn = (text: string): Set<string> =>
  new Set(
    ARC_COLUMN_NAMES.filter((name) =>
      new RegExp(`(^|[^a-z_])${name}([^a-z_]|$)`).test(text),
    ),
  );

const literalText = (node: ts.Node): string[] => {
  const texts: string[] = [];
  const visit = (child: ts.Node): void => {
    if (
      ts.isStringLiteral(child) ||
      ts.isNoSubstitutionTemplateLiteral(child)
    ) {
      texts.push(child.text);
    } else if (ts.isTemplateExpression(child)) {
      texts.push(
        child.head.text,
        ...child.templateSpans.map((s) => s.literal.text),
      );
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return texts;
};

/** Does `node` name an arc column or property — `"wine_id"`, `x.wineId`? */
const namesArc = (node: ts.Node): boolean => {
  if (ts.isStringLiteral(node)) return ARC_NAMES.has(node.text);
  if (ts.isPropertyAccessExpression(node)) return ARC_NAMES.has(node.name.text);
  if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) {
    return namesArc(node.expression);
  }
  return false;
};

/** The arc names in one template's own text and interpolations (not nested ones'). */
const templateArcNames = (template: ts.TemplateLiteral): Set<string> => {
  if (ts.isNoSubstitutionTemplateLiteral(template)) {
    return arcColumnsIn(template.text);
  }
  const names = arcColumnsIn(
    [
      template.head.text,
      ...template.templateSpans.map((span) => span.literal.text),
    ].join(" "),
  );
  for (const span of template.templateSpans) {
    if (ts.isPropertyAccessExpression(span.expression)) {
      const name = span.expression.name.text;
      if (ARC_NAMES.has(name)) names.add(name);
    }
  }
  return names;
};

/** Does anything under `node` name an arc column or property? */
const mentionsArc = (node: ts.Node): boolean => {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) return;
    if (
      (ts.isIdentifier(child) || ts.isStringLiteral(child)) &&
      ARC_NAMES.has(child.text)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
};

const typeKeyOf = (property: ts.ObjectLiteralElementLike): string | null => {
  const name = property.name;
  if (name === undefined) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return TYPE_NAMES.has(name.text) ? name.text : null;
  }
  return null;
};

type Violation = { readonly line: number; readonly rule: string };

/**
 * Is `node` Drizzle's `sql` — by symbol, so `import { sql as q }` is still
 * it, or by name, as before, so a local `sql` helper is judged too?
 */
const isSqlTag = (checker: ts.TypeChecker, node: ts.Expression): boolean => {
  if (!ts.isIdentifier(node)) return false;
  if (node.text === "sql") return true;
  const symbol = referencedSymbol(checker, node);
  return (
    symbol?.name === "sql" &&
    (symbol.declarations ?? []).some((declaration) =>
      declaration
        .getSourceFile()
        .fileName.includes("/node_modules/drizzle-orm/"),
    )
  );
};

const arcViolations = (
  checker: ts.TypeChecker,
  source: ts.SourceFile,
): Violation[] => {
  const found: Violation[] = [];
  const at = (node: ts.Node, rule: string): void => {
    found.push({ line: lineOf(node), rule });
  };
  const visit = (node: ts.Node): void => {
    // 1. `sql.raw(<text naming an _id column>)`
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "raw" &&
      isSqlTag(checker, node.expression.expression) &&
      node.arguments.some((argument) =>
        literalText(argument).some((text) => /[a-z]_id\b/.test(text)),
      )
    ) {
      at(node, "sql.raw names an _id column");
    }
    // 2. a `sql` template hand-listing arc columns — typed into its text
    //    (`coalesce(f.wine_id, f.beer_id)`) or interpolated one by one
    //    (`${itemReviews.wineId}, ${itemReviews.beerId}`)
    if (
      ts.isTaggedTemplateExpression(node) &&
      isSqlTag(checker, node.tag) &&
      templateArcNames(node.template).size >= 2
    ) {
      at(node, "sql template lists arc columns by hand");
    }
    // 3c. `switch (type) { case "WINE": … wineId …; case "BEER": … }`
    if (ts.isSwitchStatement(node)) {
      const arms = node.caseBlock.clauses.filter(
        (clause) =>
          ts.isCaseClause(clause) &&
          ts.isStringLiteral(clause.expression) &&
          TYPE_NAMES.has(clause.expression.text) &&
          mentionsArc(clause),
      );
      if (arms.length >= 2) at(node, "ItemType switch over arc columns");
    }
    // 3a. `{ WINE: "wine_id", BEER: … }`
    if (ts.isObjectLiteralExpression(node)) {
      const mapped = node.properties.filter(
        (property) =>
          typeKeyOf(property) !== null &&
          ts.isPropertyAssignment(property) &&
          namesArc(property.initializer),
      );
      if (mapped.length >= 2) at(node, "ItemType → arc column map");
    }
    // 3b. `[["WINE", row.suggested_wine_id], ["BEER", …]]`
    if (ts.isArrayLiteralExpression(node)) {
      const tuples = node.elements.filter(
        (element) =>
          ts.isArrayLiteralExpression(element) &&
          element.elements.length === 2 &&
          ts.isStringLiteral(element.elements[0] as ts.Node) &&
          TYPE_NAMES.has((element.elements[0] as ts.StringLiteral).text) &&
          namesArc(element.elements[1] as ts.Node),
      );
      if (tuples.length >= 2) at(node, "ItemType → arc column tuple list");
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};

describe("no hand-written item arc under services/actors/src", () => {
  // The full program (Drizzle's `sql` is what the symbol reading resolves
  // into) and the checker's pass over the host, once, under a timeout sized
  // for CPU (PROGRAM_TIMEOUT_MS says why). Built before the fixture below,
  // which then parses none of `node_modules` itself.
  let scanned = 0;
  let violations: string[] = [];
  beforeAll(() => {
    const project = actorsProject({ scope: "full" });
    const files = sourceFiles(project, {
      includeHarness: true,
      exclude: (file) => file === "lib/item-arcs.ts",
    });
    scanned = files.length;
    violations = files.flatMap((file) =>
      arcViolations(project.checker, file).map(
        (violation) =>
          `${relativePath(ACTORS_SRC, file.fileName)}:${violation.line} ${violation.rule}`,
      ),
    );
  }, PROGRAM_TIMEOUT_MS);

  it("each detector flags its fixture (negative controls)", () => {
    const project = actorsFixture(
      {
        "fixture.ts": [
          'const a = sql.raw(`it.${"wine_id"}`);',
          'const b = sql.raw("c.created_by_id");',
          "const c = sql`coalesce(f.wine_id, f.beer_id)`;",
          'const d = { WINE: "wineId", BEER: "beerId" };',
          "const e = { WINE: itemImage.wineId, TEA: itemImage.teaId };",
          'const f = [["WINE", row.suggested_wine_id], ["BEER", row.suggested_beer_id]];',
          // Not violations: one arc column, a non-arc map, a table map.
          "const g = sql`select ${x} from t where t.wine_id = ${id}`;",
          'const h = { WINE: "wines", BEER: "beers" };',
          "const i = sql.raw(`::${cast}`);",
          "const j = sql`coalesce(${t.wineId}, ${t.beerId})`;",
          'switch (ref.type) { case "WINE": return { wineId: id }; case "BEER": return { beerId: id }; }',
          // Renamed: the checker knows `q` is Drizzle's `sql`.
          'import { sql as q } from "drizzle-orm";',
          "const k = q`coalesce(f.wine_id, f.beer_id)`;",
          'const l = q.raw("x.wine_id");',
        ].join("\n"),
      },
      "full",
    );
    const fixture = sourceFileAt(project, `${project.root}/fixture.ts`);
    expect(arcViolations(project.checker, fixture)).toEqual([
      { line: 1, rule: "sql.raw names an _id column" },
      { line: 2, rule: "sql.raw names an _id column" },
      { line: 3, rule: "sql template lists arc columns by hand" },
      { line: 4, rule: "ItemType → arc column map" },
      { line: 5, rule: "ItemType → arc column map" },
      { line: 6, rule: "ItemType → arc column tuple list" },
      { line: 10, rule: "sql template lists arc columns by hand" },
      { line: 11, rule: "ItemType switch over arc columns" },
      { line: 13, rule: "sql template lists arc columns by hand" },
      { line: 14, rule: "sql.raw names an _id column" },
    ]);
  });

  it("finds none in the source", () => {
    expect(scanned).toBeGreaterThan(50);
    expect(
      violations,
      "use `ARCS` (`lib/item-arcs.ts`) instead of naming arc columns by hand",
    ).toEqual([]);
  });
});
