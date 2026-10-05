/**
 * The event catalog (`./events.ts`) against the code that emits and the rules
 * that alert. See that module's header for why both halves exist.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  lineOf,
  literalValues,
  type Project,
  referencedSymbol,
  relativePath,
  sourceFiles,
  unwrapExpression,
} from "@cellar-assistant/analysis";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { API_EVENTS } from "../../../api/src/events-catalog.ts";
import { ACTOR_REGISTRY } from "../actors/registry.ts";
import {
  ACTORS_SRC,
  actorsFixture,
  actorsProject,
} from "./analysis-testing.ts";
import { EVENTS, type EventSpec } from "./events.ts";

const ALERTING = fileURLToPath(
  new URL("../../../../infra/grafana/provisioning/alerting", import.meta.url),
);

const CATALOGS: Readonly<Record<string, Readonly<Record<string, EventSpec>>>> =
  { actors: EVENTS, api: API_EVENTS };

/** `errorAttributes(error)`'s keys (`./telemetry.ts`). */
const ERROR_KEYS = ["error.name", "error.code", "error.cause"];

/* -------------------------------------------------------------------------- */
/* The emit-site scan                                                          */
/* -------------------------------------------------------------------------- */

type Site = {
  readonly file: string;
  readonly line: number;
  readonly names: readonly string[];
  readonly attributes: readonly string[];
  /** Anything the scan could not resolve. A non-empty list is a failure. */
  readonly unresolved: readonly string[];
};

/**
 * The `const` initializer an identifier is bound to, in any module — the
 * checker follows imports and re-exports, where the old same-file table of
 * `const` names could not.
 */
const constInitializer = (
  checker: ts.TypeChecker,
  node: ts.Identifier,
): ts.Expression | undefined => {
  const symbol = referencedSymbol(checker, node);
  const declaration = symbol?.valueDeclaration;
  return declaration !== undefined &&
    ts.isVariableDeclaration(declaration) &&
    ts.isVariableDeclarationList(declaration.parent) &&
    declaration.parent.flags & ts.NodeFlags.Const
    ? declaration.initializer
    : undefined;
};

/** The property names a type fixes, or `null` for an open record. */
const keysOfType = (
  checker: ts.TypeChecker,
  type: ts.Type,
): string[] | null => {
  if (
    checker.getIndexInfosOfType(type).length > 0 ||
    type.getProperties().length === 0
  ) {
    return null;
  }
  return type.getProperties().map((property) => property.name);
};

/**
 * Every object literal shaped like an event — `name`, `severity` and
 * `message` properties — with its name(s) and attribute keys resolved: a
 * name by its literal type or the `const` it is bound to (any module), and
 * attributes syntactically through spreads and conditionals, following
 * identifiers to their `const` initializers and calls to their declared
 * return type. `keepAlivePrefixes` expands the one templated name
 * (`${keepAlive.event}.reminder_armed`).
 */
export const scanEmitSites = (
  project: Project,
  files: readonly ts.SourceFile[],
  keepAlivePrefixes: readonly string[],
): Site[] => {
  const { checker } = project;

  const namesOf = (node: ts.Expression, unresolved: string[]): string[] => {
    const e = unwrapExpression(node);
    const literals = literalValues(checker, e);
    if (literals?.every((l) => typeof l === "string")) {
      return literals as string[];
    }
    if (ts.isConditionalExpression(e)) {
      return [
        ...namesOf(e.whenTrue, unresolved),
        ...namesOf(e.whenFalse, unresolved),
      ];
    }
    if (ts.isIdentifier(e)) {
      const init = constInitializer(checker, e);
      if (init !== undefined) return namesOf(init, unresolved);
    }
    if (ts.isTemplateExpression(e) && e.templateSpans.length === 1) {
      const suffix = e.templateSpans[0]?.literal.text ?? "";
      if (e.head.text === "") {
        return keepAlivePrefixes.map((prefix) => `${prefix}${suffix}`);
      }
    }
    unresolved.push(`name ${e.getText().slice(0, 60)}`);
    return [];
  };

  const keysOf = (
    node: ts.Expression,
    unresolved: string[],
    seen = new Set<ts.Node>(),
  ): string[] => {
    const e = unwrapExpression(node);
    if (ts.isObjectLiteralExpression(e)) {
      return e.properties.flatMap((p) => {
        if (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) {
          const n = p.name;
          if (ts.isIdentifier(n) || ts.isStringLiteralLike(n)) return [n.text];
          unresolved.push(`key ${n.getText()}`);
          return [];
        }
        if (ts.isSpreadAssignment(p)) {
          return keysOf(p.expression, unresolved, seen);
        }
        unresolved.push(`member ${p.getText().slice(0, 60)}`);
        return [];
      });
    }
    if (ts.isConditionalExpression(e)) {
      return [
        ...keysOf(e.whenTrue, unresolved, seen),
        ...keysOf(e.whenFalse, unresolved, seen),
      ];
    }
    if (ts.isCallExpression(e)) {
      const keys = keysOfType(checker, checker.getTypeAtLocation(e));
      if (keys !== null) return keys;
    }
    if (ts.isIdentifier(e)) {
      const init = constInitializer(checker, e);
      if (init !== undefined && !seen.has(init)) {
        return keysOf(init, unresolved, new Set([...seen, init]));
      }
    }
    unresolved.push(`attributes ${e.getText().slice(0, 60)}`);
    return [];
  };

  const sites: Site[] = [];
  for (const source of files) {
    const file = relativePath(project.root, source.fileName);
    const visit = (node: ts.Node): void => {
      if (ts.isObjectLiteralExpression(node)) {
        const prop = (name: string) =>
          node.properties.find(
            (p) =>
              (ts.isPropertyAssignment(p) ||
                ts.isShorthandPropertyAssignment(p)) &&
              ts.isIdentifier(p.name) &&
              p.name.text === name,
          );
        const name = prop("name");
        if (
          name !== undefined &&
          ts.isPropertyAssignment(name) &&
          prop("severity") !== undefined &&
          prop("message") !== undefined
        ) {
          const unresolved: string[] = [];
          const names = namesOf(name.initializer, unresolved);
          const attrs = prop("attributes");
          const attributes =
            attrs === undefined
              ? []
              : ts.isPropertyAssignment(attrs)
                ? keysOf(attrs.initializer, unresolved)
                : keysOf(attrs.name as ts.Identifier, unresolved);
          sites.push({
            file,
            line: lineOf(node),
            names: [...new Set(names)],
            attributes: [...new Set(attributes)],
            unresolved,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return sites;
};

const KEEP_ALIVE_PREFIXES = ACTOR_REGISTRY.flatMap((entry) =>
  entry.keepAlive === undefined ? [] : [entry.keepAlive.event],
);

const PROJECT = actorsProject();
const SITES = scanEmitSites(
  PROJECT,
  sourceFiles(PROJECT, { under: ACTORS_SRC, includeHarness: true }),
  KEEP_ALIVE_PREFIXES,
);

/** Scans one fixture module overlaid on `src/`. */
const scanText = (
  text: string,
  others: Readonly<Record<string, string>> = {},
): Site[] => {
  const project = actorsFixture({ ...others, "synthetic.ts": text });
  return scanEmitSites(
    project,
    sourceFiles(project, { exclude: (file) => file !== "synthetic.ts" }),
    [],
  );
};

describe("the catalog against the code", () => {
  it("finds the emit sites", () => {
    expect(SITES.length).toBeGreaterThan(40);
    expect(KEEP_ALIVE_PREFIXES.length).toBeGreaterThanOrEqual(2);
  });

  it("resolves every site's name and attributes", () => {
    expect(
      SITES.filter((s) => s.unresolved.length > 0).map(
        (s) => `${s.file}:${s.line}  ${s.unresolved.join("; ")}`,
      ),
    ).toEqual([]);
  });

  it("emits only catalogued names", () => {
    const unknown = SITES.flatMap((s) =>
      s.names
        .filter((n) => !(n in EVENTS))
        .map((n) => `${s.file}:${s.line}  ${n}`),
    );
    expect(unknown).toEqual([]);
  });

  it("emits every catalogued name somewhere", () => {
    const emitted = new Set(SITES.flatMap((s) => s.names));
    expect(Object.keys(EVENTS).filter((n) => !emitted.has(n))).toEqual([]);
  });

  it("declares exactly the attributes each event's sites send", () => {
    // A site with a union name (`terminal ? A : B`) sends the union of keys,
    // so it can prove neither entry wrong about a key only one of them has;
    // it counts toward "sent" for both and is checked for "undeclared"
    // against the union.
    const sent = new Map<string, Set<string>>();
    const undeclared: string[] = [];
    for (const site of SITES) {
      const allowed = new Set(
        site.names.flatMap((n) => [
          ...((EVENTS as Record<string, EventSpec>)[n]?.attributes ?? []),
        ]),
      );
      for (const key of site.attributes) {
        if (!allowed.has(key)) {
          undeclared.push(
            `${site.file}:${site.line}  ${site.names.join("|")}  ${key}`,
          );
        }
      }
      for (const name of site.names) {
        const set = sent.get(name) ?? new Set<string>();
        for (const key of site.attributes) set.add(key);
        sent.set(name, set);
      }
    }
    const phantom = Object.entries(EVENTS as Record<string, EventSpec>).flatMap(
      ([name, spec]) =>
        spec.attributes
          .filter((key) => sent.get(name)?.has(key) !== true)
          .map((key) => `${name}  ${key}`),
    );
    expect(
      undeclared,
      "attributes a site sends that its entry does not declare",
    ).toEqual([]);
    expect(phantom, "attributes an entry declares that no site sends").toEqual(
      [],
    );
  });
});

/* -------------------------------------------------------------------------- */
/* The alert rules                                                             */
/* -------------------------------------------------------------------------- */

type RuleQuery = { readonly uid: string; readonly expr: string };

/** Each rule's `uid` and every `expr:` under it, folded scalars joined. */
export const ruleQueries = (yaml: string): RuleQuery[] => {
  const lines = yaml.split("\n");
  const out: RuleQuery[] = [];
  let uid = "<none>";
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const uidMatch = /^\s*-\s*uid:\s*(\S+)/.exec(line);
    if (uidMatch !== null) uid = uidMatch[1] ?? uid;
    const exprMatch = /^(\s*)expr:\s*(.*)$/.exec(line);
    if (exprMatch === null) continue;
    const indent = exprMatch[1]?.length ?? 0;
    const inline = (exprMatch[2] ?? "").trim();
    if (inline !== "" && !/^[>|][-+]?$/.test(inline)) {
      out.push({ uid, expr: inline.replace(/^['"]|['"]$/g, "") });
      continue;
    }
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j] ?? "";
      if (next.trim() === "") continue;
      if (next.length - next.trimStart().length <= indent) break;
      body.push(next.trim());
    }
    out.push({ uid, expr: body.join(" ") });
  }
  return out;
};

type Finding = { readonly uid: string; readonly problem: string };

/**
 * What a LogQL expression names: its `service_name`, its `event_name`s, and
 * every other label it filters or groups on — each of which must be one of
 * those events' attributes, dots as underscores.
 */
export const checkQuery = (
  query: RuleQuery,
  catalogs: typeof CATALOGS = CATALOGS,
): Finding[] => {
  const findings: Finding[] = [];
  const problem = (text: string) =>
    findings.push({ uid: query.uid, problem: text });

  const services = [
    ...query.expr.matchAll(/service_name\s*=\s*"([^"]+)"/g),
  ].map((m) => m[1] ?? "");
  if (services.length === 0) {
    problem(`no {service_name="…"} selector: ${query.expr}`);
    return findings;
  }
  const events = [...query.expr.matchAll(/event_name\s*=\s*"([^"]+)"/g)].map(
    (m) => m[1] ?? "",
  );
  if (events.length === 0) problem(`filters on no event_name: ${query.expr}`);

  const outsideSelectors = query.expr.replace(/\{[^}]*\}/g, " ");
  const labels = new Set<string>([
    ...[
      ...outsideSelectors.matchAll(
        /\b([a-z_][a-z0-9_]*)\s*(?:=~|!~|!=|=)\s*"/g,
      ),
    ].map((m) => m[1] ?? ""),
    ...[
      ...outsideSelectors.matchAll(/\b(?:by|without)\s*\(([^)]*)\)/g),
    ].flatMap((m) => (m[1] ?? "").split(",").map((l) => l.trim())),
    ...[...outsideSelectors.matchAll(/\bunwrap\s+([a-z_][a-z0-9_]*)/g)].map(
      (m) => m[1] ?? "",
    ),
  ]);
  labels.delete("event_name");
  labels.delete("");

  for (const service of new Set(services)) {
    const catalog = catalogs[service];
    if (catalog === undefined) {
      problem(`service_name="${service}" has no event catalog`);
      continue;
    }
    for (const event of events) {
      if (catalog[event] === undefined) {
        problem(`event_name="${event}" is not in ${service}'s catalog`);
      }
    }
    for (const label of labels) {
      const carriers = events.filter((event) =>
        (catalog[event]?.attributes ?? []).some(
          (key) => key.replaceAll(".", "_") === label,
        ),
      );
      if (carriers.length !== events.length) {
        const missing = events.filter((e) => !carriers.includes(e));
        problem(
          `label ${label} is not an attribute of ${missing.join(", ")} ` +
            `(Loki turns dots into underscores: an attribute \`a.b\` is \`a_b\`)`,
        );
      }
    }
  }
  return findings;
};

const RULE_FILES = readdirSync(ALERTING).filter((f) => f.endsWith(".yaml"));
const QUERIES = RULE_FILES.flatMap((file) =>
  ruleQueries(readFileSync(join(ALERTING, file), "utf8")).map((q) => ({
    ...q,
    uid: `${file}#${q.uid}`,
  })),
);

describe("the catalog against the alert rules", () => {
  it("finds every rule's query", () => {
    // Four rule files today, one of them routes and contact points only.
    expect(RULE_FILES.length).toBeGreaterThanOrEqual(3);
    expect(QUERIES.length).toBeGreaterThanOrEqual(10);
    expect(QUERIES.some((q) => q.expr.includes('service_name="api"'))).toBe(
      true,
    );
    expect(QUERIES.some((q) => q.expr.includes('service_name="actors"'))).toBe(
      true,
    );
  });

  it("filters only on catalogued events, and only on their attributes", () => {
    const findings = QUERIES.flatMap((q) => checkQuery(q));
    expect(findings.map((f) => `${f.uid}: ${f.problem}`)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* The mechanism, on inputs it must refuse                                     */
/* -------------------------------------------------------------------------- */

describe("the checks themselves", () => {
  it("refuses the rule that shipped matching nothing: `method` for `outbox_method`", () => {
    const [query] = ruleQueries(
      [
        "      - uid: synthetic",
        "            model:",
        "              expr: >-",
        '                sum(count_over_time({service_name="actors"} |',
        '                event_name="outbox.dead_letter" |',
        '                method="removeFriendOtherSide" [5m]))',
      ].join("\n"),
    );
    expect(query?.expr).toContain('method="removeFriendOtherSide"');
    expect(checkQuery(query as RuleQuery).map((f) => f.problem)).toEqual([
      expect.stringContaining(
        "label method is not an attribute of outbox.dead_letter",
      ),
    ]);
    const fixed = {
      uid: "synthetic",
      expr: (query as RuleQuery).expr.replace("| method=", "| outbox_method="),
    };
    expect(checkQuery(fixed)).toEqual([]);
  });

  it("refuses an event the catalog does not have, and a service without one", () => {
    expect(
      checkQuery({
        uid: "x",
        expr: 'sum(count_over_time({service_name="actors"} | event_name="outbox.deadletter" [5m]))',
      }).map((f) => f.problem),
    ).toEqual([expect.stringContaining("not in actors's catalog")]);
    expect(
      checkQuery({
        uid: "x",
        expr: 'sum(count_over_time({service_name="client"} | event_name="x" [5m]))',
      }).map((f) => f.problem),
    ).toEqual([expect.stringContaining("has no event catalog")]);
  });

  it("holds an unwrapped label to the event's attributes", () => {
    const expr = (label: string) =>
      `max(last_over_time({service_name="actors"} | event_name="outbox.heartbeat" | unwrap ${label} [5m]))`;
    expect(
      checkQuery({ uid: "x", expr: expr("outbox_oldest_due_age_s") }),
    ).toEqual([]);
    expect(
      checkQuery({ uid: "x", expr: expr("oldest_due_age_s") }).map(
        (f) => f.problem,
      ),
    ).toEqual([
      expect.stringContaining("label oldest_due_age_s is not an attribute"),
    ]);
  });

  it("holds a grouping label to every event in an `or`", () => {
    expect(
      checkQuery({
        uid: "x",
        expr:
          'sum by (outbox_method) (count_over_time({service_name="actors"} | ' +
          'event_name="outbox.dead_letter" or event_name="process.fatal" [5m]))',
      }).map((f) => f.problem),
    ).toEqual([expect.stringContaining("not an attribute of process.fatal")]);
  });

  it("sees an attribute a site sends, including inside a conditional spread", () => {
    const [site] = scanText(
      [
        'import { errorAttributes } from "../lib/telemetry.ts";',
        'import { BASE } from "./base.ts";',
        "declare const ok: boolean;",
        "declare const e: unknown;",
        "declare function emit(event: object): void;",
        "emit({",
        '  name: ok ? "outbox.retry" : "outbox.dead_letter",',
        '  severity: "WARN",',
        '  message: "m",',
        '  attributes: { ...BASE, "x.y": 2, ...(ok ? {} : { z: 3 }), ...errorAttributes(e) },',
        "});",
      ].join("\n"),
      { "base.ts": "export const BASE = { a: 1 };" },
    );
    expect(site?.names).toEqual(["outbox.retry", "outbox.dead_letter"]);
    expect(site?.attributes).toEqual(["a", "x.y", "z", ...ERROR_KEYS]);
    expect(site?.unresolved).toEqual([]);
  });

  it("reports what it cannot resolve rather than skipping it", () => {
    const [site] = scanText(
      [
        "declare function emit(event: object): void;",
        "declare function pick(): string;",
        "declare function somewhere(): Record<string, unknown>;",
        'emit({ name: pick(), severity: "INFO", message: "m", attributes: { ...somewhere() } });',
      ].join("\n"),
    );
    expect(site?.unresolved).toHaveLength(2);
  });
});
