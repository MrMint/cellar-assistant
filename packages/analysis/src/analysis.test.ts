/**
 * The foundation's own tests. Every detector here is proved in both
 * directions: it fires on a fixture that breaks the rule (the negative
 * control), and stays quiet on one that does not.
 */
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  assertNoFindings,
  enclosingName,
  FIXTURE_OPTIONS,
  type Finding,
  findCalls,
  findingAt,
  findReferences,
  fixtureProject,
  formatFindings,
  isTestPath,
  literalValue,
  literalValues,
  loadProject,
  moduleSpecifiers,
  normalizePath,
  type Project,
  propertyLiterals,
  sourceFileAt,
  sourceFiles,
  workspacePaths,
} from "./index.ts";

const SRC = fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, "");

/** The first node in `project`'s file `path` matching `test`. */
const find = <T extends ts.Node>(
  project: Project,
  path: string,
  test: (node: ts.Node) => node is T,
): T => {
  const file = project.program.getSourceFile(`${project.root}/${path}`);
  let found: T | undefined;
  const visit = (node: ts.Node): void => {
    if (found === undefined && test(node)) found = node;
    else ts.forEachChild(node, visit);
  };
  if (file !== undefined) visit(file);
  if (found === undefined) throw new Error(`no match in ${path}`);
  return found;
};

/** The initializer of `const <name> = …` in `path`. */
const initializerOf = (
  project: Project,
  path: string,
  name: string,
): ts.Expression => {
  const declaration = find(
    project,
    path,
    (node): node is ts.VariableDeclaration =>
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name,
  );
  if (declaration.initializer === undefined) throw new Error(name);
  return declaration.initializer;
};

describe("files", () => {
  it("knows a test, a spec and a harness when it sees one", () => {
    for (const path of [
      "/a/x.test.ts",
      "/a/x.spec.tsx",
      "/a/lib/testing.ts",
      "/a/lib/outbox-scan-testing.ts",
    ]) {
      expect(isTestPath(path), path).toBe(true);
    }
    for (const path of ["/a/x.ts", "/a/testing/x.ts", "/a/contest.ts"]) {
      expect(isTestPath(path), path).toBe(false);
    }
  });

  it("enumerates production source only", () => {
    const project = fixtureProject({
      files: {
        "a.ts": `export const a = 1;`,
        "sub/b.ts": `export const b = 2;`,
        "a.test.ts": `export const t = 1;`,
        "lib/testing.ts": `export const h = 1;`,
        "keys.generated.ts": `export const g = 1;`,
        "types.d.ts": `export type T = 1;`,
      },
    });
    const names = (files: ts.SourceFile[]) =>
      files.map((file) => file.fileName.slice(project.root.length + 1));
    expect(names(sourceFiles(project))).toEqual(["a.ts", "sub/b.ts"]);
    expect(
      names(sourceFiles(project, { under: `${project.root}/sub` })),
    ).toEqual(["sub/b.ts"]);
    expect(
      names(
        sourceFiles(project, { exclude: (path) => path.startsWith("sub/") }),
      ),
    ).toEqual(["a.ts"]);
    expect(names(sourceFiles(project, { includeTests: true }))).toContain(
      "lib/testing.ts",
    );
    expect(names(sourceFiles(project, { includeHarness: true }))).toEqual([
      "a.ts",
      "lib/testing.ts",
      "sub/b.ts",
    ]);
  });
});

describe("moduleSpecifiers", () => {
  it("lists static, re-exported, require-style and dynamic literal imports", () => {
    const project = fixtureProject({
      files: {
        "a.ts": `
          import { x } from "./x.ts";
          import type { T } from "./t.ts";
          export * from "./y.ts";
          import z = require("./z.cjs");
          export const f = async (name: string) => [await import("./d.ts"), await import(name), x, z];
          export type U = T;
        `,
      },
    });
    expect(
      moduleSpecifiers(sourceFileAt(project, `${project.root}/a.ts`)),
    ).toEqual(["./x.ts", "./t.ts", "./y.ts", "./z.cjs", "./d.ts"]);
    expect(() => sourceFileAt(project, `${project.root}/nope.ts`)).toThrow(
      "not in the program",
    );
  });
});

describe("loadProject", () => {
  it("builds one program per tsconfig per process", () => {
    const tsconfig = `${SRC}/../tsconfig.json`;
    const first = loadProject(tsconfig);
    expect(loadProject(tsconfig)).toBe(first);
    const files = sourceFiles(first).map((file) => file.fileName);
    expect(files).toContain(`${SRC}/references.ts`);
    expect(files.some((file) => file.endsWith(".test.ts"))).toBe(false);
  });
});

describe("repo-only programs", () => {
  const external = (project: Project) =>
    project.program
      .getSourceFiles()
      .filter(
        (file) =>
          file.fileName.includes("/node_modules/") &&
          !project.program.isSourceFileDefaultLibrary(file),
      ).length;

  it("load the roots and TypeScript's libs, and nothing from node_modules", () => {
    const tsconfig = `${SRC}/../tsconfig.json`;
    const light = loadProject(tsconfig, { repoOnly: true });
    expect(light).not.toBe(loadProject(tsconfig));
    expect(external(light)).toBeLessThanOrEqual(1);
    expect(external(loadProject(tsconfig))).toBeGreaterThan(1);
    expect(sourceFiles(light).map((file) => file.fileName)).toContain(
      `${SRC}/references.ts`,
    );
  });

  it("still resolve across real roots, by identity", () => {
    const project = fixtureProject({
      root: `${SRC}/__fixture__`,
      files: {
        "use.ts": `import { unwrapExpression as u } from "../values.ts"; export const go = (e: never) => u(e);`,
      },
      options: { ...FIXTURE_OPTIONS, noResolve: true },
      extraRoots: [SRC],
    });
    expect(external(project)).toBeLessThanOrEqual(1);
    const { calls } = findCalls(
      project,
      [{ module: `${SRC}/values.ts`, name: "unwrapExpression" }],
      { rule: "r" },
    );
    expect(calls.map((site) => enclosingName(site.call))).toEqual(["go"]);
  });

  it("resolve a workspace package to its source, whether or not it is installed", () => {
    // packages/analysis depends on no workspace package, so no install ever
    // puts `@cellar-assistant/contracts` in its node_modules: this import
    // resolves by `workspacePaths` or not at all. Before it, the same import
    // from services/client/src resolved only where services/client was
    // installed — which CI's api leg is not.
    const contracts = normalizePath(`${SRC}/../../contracts/src`);
    expect(workspacePaths()["@cellar-assistant/contracts/barcodes"]).toEqual([
      `${contracts}/barcodes.ts`,
    ]);
    const project = fixtureProject({
      root: `${SRC}/__fixture__`,
      files: {
        "use.ts": `import { canonicalBarcodeCode as c } from "@cellar-assistant/contracts/barcodes"; export const go = () => c("1");`,
      },
      options: { ...FIXTURE_OPTIONS, noResolve: true },
      extraRoots: [contracts],
    });
    expect(external(project)).toBeLessThanOrEqual(1);
    const { calls } = findCalls(
      project,
      [{ module: `${contracts}/barcodes.ts`, name: "canonicalBarcodeCode" }],
      { rule: "r" },
    );
    expect(calls.map((site) => enclosingName(site.call))).toEqual(["go"]);
  });
});

describe("findings", () => {
  const project = fixtureProject({
    files: { "dir/a.ts": `export const a = 1;\nexport const b = 2;\n` },
  });
  const node = initializerOf(project, "dir/a.ts", "b");

  it("reports file relative to the root, and a 1-based line", () => {
    expect(findingAt(project, node, "r/x", "msg")).toEqual({
      file: "dir/a.ts",
      line: 2,
      rule: "r/x",
      message: "msg",
    });
  });

  it("asserts none, failing with the list itself", () => {
    expect(() => assertNoFindings([])).not.toThrow();
    const findings: Finding[] = [
      { file: "b.ts", line: 3, rule: "r", message: "second" },
      { file: "a.ts", line: 9, rule: "r", message: "first" },
    ];
    expect(formatFindings(findings)).toBe(
      "  a.ts:9 [r] first\n  b.ts:3 [r] second",
    );
    expect(() => assertNoFindings(findings, "Fix it so.")).toThrow(
      "2 findings:\n  a.ts:9 [r] first\n  b.ts:3 [r] second\n\nFix it so.",
    );
  });
});

/* -------------------------------------------------------------------------- */

const LIB = `
export const send = (to: string, body: string): number => to.length + body.length;
export class Box { constructor(readonly v: number) {} }
export const sql = (parts: TemplateStringsArray, ..._v: unknown[]) => parts.join("");
`;

/** A tree with `lib/send.ts` plus `files`, scanned for `send`, `Box`, `sql`. */
const scan = (
  files: Record<string, string>,
  options: { allowReexports?: boolean } = {},
) => {
  const project = fixtureProject({ files: { "lib/send.ts": LIB, ...files } });
  const module = `${project.root}/lib/send.ts`;
  const result = findCalls(
    project,
    [
      { module, name: "send" },
      { module, name: "Box" },
      { module, name: "sql" },
    ],
    { rule: "test/send", ...options },
  );
  return {
    ...result,
    sites: result.calls
      .filter((site) => !site.call.getSourceFile().fileName.endsWith("send.ts"))
      .map((site) => ({
        target: site.target,
        in: enclosingName(site.call),
        args: site.args.map((arg) => arg.getText()),
      })),
  };
};

describe("findCalls — by identity", () => {
  it("finds a direct call, a renamed import and a namespace member", () => {
    const result = scan({
      "a.ts": `
        import { send } from "./lib/send.ts";
        import { send as post } from "./lib/send.ts";
        import * as lib from "./lib/send.ts";
        export function direct() { return send("a", "1"); }
        export const renamed = () => post("b", "2");
        export class K { m() { return lib.send("c", "3"); } }
      `,
    });
    expect(result.refusals).toEqual([]);
    expect(result.sites).toEqual([
      { target: "send", in: "direct", args: ['"a"', '"1"'] },
      { target: "send", in: "renamed", args: ['"b"', '"2"'] },
      { target: "send", in: "K.m", args: ['"c"', '"3"'] },
    ]);
  });

  it("follows a re-export through a barrel, and refuses the barrel unless told", () => {
    const files = {
      "barrel.ts": `export { send as deliver } from "./lib/send.ts";`,
      "a.ts": `
        import { deliver } from "./barrel.ts";
        export const go = () => deliver("x", "y");
      `,
    };
    const strict = scan(files);
    expect(strict.sites).toEqual([
      { target: "send", in: "go", args: ['"x"', '"y"'] },
    ]);
    expect(strict.refusals).toEqual([
      expect.objectContaining({
        file: "barrel.ts",
        rule: "test/send",
        message: expect.stringContaining("re-exports `send`"),
      }),
    ]);
    expect(scan(files, { allowReexports: true }).refusals).toEqual([]);
  });

  it("follows `export *` too", () => {
    const result = scan(
      {
        "barrel.ts": `export * from "./lib/send.ts";`,
        "a.ts": `import { send } from "./barrel.ts"; export const go = () => send("x", "y");`,
      },
      { allowReexports: true },
    );
    expect(result.sites).toHaveLength(1);
    expect(result.refusals).toEqual([]);
  });

  it("does not count a different function that shares the name", () => {
    const result = scan({
      "a.ts": `
        const send = (a: string, b: string) => a + b;
        export const go = () => send("x", "y");
        export const obj = { send: (a: string) => a };
        export const other = () => obj.send("z");
      `,
    });
    expect(result.sites).toEqual([]);
    expect(result.refusals).toEqual([]);
  });

  it("reads `new` and a tagged template as calls", () => {
    const result = scan({
      "a.ts": `
        import { Box, sql } from "./lib/send.ts";
        export const b = new Box(1);
        export const q = sql\`select 1\`;
      `,
    });
    expect(result.sites).toEqual([
      { target: "Box", in: "<module>", args: ["1"] },
      { target: "sql", in: "<module>", args: [] },
    ]);
  });

  it("ignores imports, type positions, and names that merely match", () => {
    const result = scan({
      "a.ts": `
        import { send } from "./lib/send.ts";
        import type * as T from "./lib/send.ts";
        type S = typeof send;
        type U = typeof T.send;
        export const keys = { send: 1 };
        export class C { send = 0; }
        export const f = (g: S, h: U) => [g, h, keys.send];
      `,
    });
    expect(result.sites).toEqual([]);
    expect(result.refusals).toEqual([]);
  });
});

describe("findCalls — refuses what it cannot read (negative controls)", () => {
  it.each([
    [
      ".call",
      `import { send } from "./lib/send.ts"; export const go = () => send.call(null, "a", "b");`,
      "`.call` hides its arguments",
    ],
    [
      "an aliased .apply",
      `import { send as s } from "./lib/send.ts"; export const go = (a: [string, string]) => s.apply(null, a);`,
      "`.apply` hides its arguments",
    ],
    [
      ".bind",
      `import { send } from "./lib/send.ts"; export const go = send.bind(null, "a");`,
      "`.bind` hides",
    ],
    [
      "a callback",
      `import { send } from "./lib/send.ts"; export const go = (run: (f: unknown) => void) => run(send);`,
      "referenced without being called",
    ],
    [
      "a stored reference",
      `import { send } from "./lib/send.ts"; const s = send; export const go = () => s("a", "b");`,
      "referenced without being called",
    ],
    [
      "a shorthand property",
      `import { send } from "./lib/send.ts"; export const api = { send };`,
      "referenced without being called",
    ],
    [
      "a destructured namespace member",
      `import * as lib from "./lib/send.ts"; const { send: s } = lib; export const go = () => s("a", "b");`,
      "destructured",
    ],
    [
      "a computed member",
      `import * as lib from "./lib/send.ts"; export const go = () => lib["send"]("a", "b");`,
      "by computed name",
    ],
    [
      "the namespace as a value",
      `import * as lib from "./lib/send.ts"; export const go = (k: "send") => lib[k];`,
      "namespace, used as a value",
    ],
    [
      "a named re-export",
      `export { send as s } from "./lib/send.ts";`,
      "re-exports `send`",
    ],
    [
      "a wholesale re-export",
      `export * from "./lib/send.ts";`,
      "re-exports lib/send.ts wholesale",
    ],
    [
      "a namespace re-export",
      `export * as lib from "./lib/send.ts";`,
      "re-exports lib/send.ts wholesale",
    ],
    [
      "a dynamic import",
      `export const go = async () => (await import("./lib/send.ts")).send;`,
      "dynamic import",
    ],
  ])("refuses %s", (_label, source, message) => {
    const result = scan({ "a.ts": source });
    expect(result.refusals.length).toBeGreaterThan(0);
    expect(result.refusals.map((f) => f.message).join("\n")).toContain(message);
    expect(result.refusals.every((f) => f.file === "a.ts")).toBe(true);
  });
});

describe("targets outside the program", () => {
  it("find nothing when unloaded, and throw when they do not exist", () => {
    const project = fixtureProject({
      files: { "a.ts": "export const a = 1;" },
    });
    const unloaded = { module: `${SRC}/values.ts`, name: "unwrapExpression" };
    expect(findCalls(project, [unloaded], { rule: "r" })).toEqual({
      calls: [],
      refusals: [],
    });
    expect(findReferences(project, [unloaded])).toEqual([]);
    expect(() =>
      findReferences(project, [{ module: `${SRC}/nope.ts`, name: "x" }]),
    ).toThrow("does not exist");
  });
});

describe("findReferences", () => {
  it("finds every naming of the target, in any position, by identity", () => {
    const project = fixtureProject({
      files: {
        "lib/send.ts": LIB,
        "a.ts": `import { send as s } from "./lib/send.ts"; export type T = typeof s;`,
        "b.ts": `import * as lib from "./lib/send.ts"; export const f = () => lib.send("a", "b");`,
        "c.ts": `export { send } from "./lib/send.ts";`,
        "d.ts": `const send = 1; export const g = send;`,
      },
    });
    const refs = findReferences(project, [
      { module: `${project.root}/lib/send.ts`, name: "send" },
    ]);
    const files = [
      ...new Set(
        refs.map((ref) =>
          ref.node.getSourceFile().fileName.slice(project.root.length + 1),
        ),
      ),
    ];
    expect(files).toEqual(["a.ts", "b.ts", "c.ts", "lib/send.ts"]);
  });
});

describe("fixtures overlaid on a real tree", () => {
  it("resolve imports of the real modules, and are judged by identity", () => {
    const project = fixtureProject({
      root: `${SRC}/__fixture__`,
      files: {
        "use.ts": `
          import { unwrapExpression as unwrap } from "../values.ts";
          import type ts from "typescript";
          export const go = (e: ts.Expression) => unwrap(e);
        `,
      },
    });
    const result = findCalls(
      project,
      [{ module: `${SRC}/values.ts`, name: "unwrapExpression" }],
      { rule: "r", files: sourceFiles(project) },
    );
    expect(result.refusals).toEqual([]);
    expect(result.calls.map((site) => enclosingName(site.call))).toEqual([
      "go",
    ]);
  });
});

/* -------------------------------------------------------------------------- */

describe("values", () => {
  const project = fixtureProject({
    files: {
      "consts.ts": `
        export const A = "alpha";
        export const OBJ = { k: "kay", n: 3 };
        export const FROZEN = { k: "frozen" } as const;
        export let mutable = "m";
      `,
      "other.ts": `export const A = "not-this-one";`,
      "use.ts": `
        import { A as renamed, OBJ, FROZEN, mutable } from "./consts.ts";
        declare const either: "x" | "y";
        declare const wide: string;
        declare const flag: true;
        type H = { key: "A.m" } | { key: "B.n" };
        declare const handle: H;
        declare const loose: { key: string };
        export const v1 = renamed;
        export const v2 = OBJ.k;
        export const v3 = FROZEN.k;
        export const v4 = either;
        export const v5 = wide;
        export const v6 = mutable;
        export const v7 = (renamed as string);
        export const v8 = flag;
        export const v9 = OBJ.n;
        export const h1 = handle;
        export const h2 = loose;
      `,
    },
  });
  const value = (name: string) =>
    literalValues(project.checker, initializerOf(project, "use.ts", name));

  it("resolves a constant through its binding, not its name", () => {
    expect(value("v1")).toEqual(["alpha"]);
    expect(value("v7")).toEqual(["alpha"]);
  });

  it("resolves a property of a const object, `as const` or not", () => {
    expect(value("v2")).toEqual(["kay"]);
    expect(value("v3")).toEqual(["frozen"]);
    expect(value("v9")).toEqual([3]);
  });

  it("reads a union of literals, and a boolean literal", () => {
    expect(value("v4")).toEqual(["x", "y"]);
    expect(value("v8")).toEqual([true]);
    expect(
      literalValue(project.checker, initializerOf(project, "use.ts", "v4")),
    ).toBeUndefined();
  });

  it("refuses a value it cannot pin (negative control)", () => {
    expect(value("v5")).toBeNull();
    expect(value("v6")).toBeNull();
  });

  it("reads a property's literals across a union type", () => {
    const typeOf = (name: string) =>
      project.checker.getTypeAtLocation(initializerOf(project, "use.ts", name));
    expect(propertyLiterals(project.checker, typeOf("h1"), "key")).toEqual([
      "A.m",
      "B.n",
    ]);
    expect(propertyLiterals(project.checker, typeOf("h2"), "key")).toBeNull();
    expect(propertyLiterals(project.checker, typeOf("h1"), "nope")).toBeNull();
  });
});

describe("enclosingName", () => {
  const project = fixtureProject({
    files: {
      "a.ts": `
        export class K {
          m() { return [1].map(() => mark(1)); }
          p = () => mark(2);
          constructor() { mark(3); }
        }
        export function f() { return mark(4); }
        export const g = () => mark(5);
        export const o = { h: () => mark(6) };
        mark(7);
        function mark(n: number) { return n; }
      `,
    },
  });

  it("names the nearest named function, walking through callbacks", () => {
    const names: string[] = [];
    const file = project.program.getSourceFile(`${project.root}/a.ts`);
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "mark"
      ) {
        names.push(enclosingName(node));
      }
      ts.forEachChild(node, visit);
    };
    if (file !== undefined) visit(file);
    expect(names).toEqual([
      "K.m",
      "K.p",
      "K.constructor",
      "f",
      "g",
      "h",
      "<module>",
    ]);
  });
});
