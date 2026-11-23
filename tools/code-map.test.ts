import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  exportedNames,
  exportsOf,
  importersOf,
  importGraph,
  loadPackages,
  loadSources,
  loadTypescript,
  type Package,
  parsePackage,
  renderMap,
  resolvePackage,
  resolveSpecifier,
  specifiersOf,
} from "./code-map.ts";

let root = "";
let sources: Map<string, string>;
let packages: Package[];

const files: Record<string, string> = {
  "packages/contracts/package.json": JSON.stringify({
    name: "@cellar-assistant/contracts",
    exports: { ".": "./src/index.ts", "./items": "./src/items.ts" },
  }),
  "packages/contracts/src/items.ts":
    "export interface Item {\n  id: string;\n}\nexport function itemName(i: Item): string {\n  return i.id;\n}\n",
  "packages/contracts/src/other.ts": "export const other = 1;\n",
  "packages/contracts/src/index.ts":
    'export * from "./items.ts";\nexport { other } from "./other";\n',
  "packages/contracts/src/items.test.ts":
    'import { itemName } from "./items.ts";\n',
  "packages/db/package.json": JSON.stringify({
    name: "@cellar-assistant/db",
    exports: {
      ".": { types: "./src/index.ts", default: "./dist/index.js" },
      "./orm": "./src/orm.ts",
    },
  }),
  "packages/db/src/index.ts":
    'import { itemName } from "@cellar-assistant/contracts";\nexport const x = itemName;\n',
  "packages/db/src/orm.ts":
    'export * from "drizzle-orm";\nexport const local = 1;\n',
  "services/api/src/q.ts":
    'import { eq } from "@cellar-assistant/db/orm";\nimport { Item } from "@cellar-assistant/contracts";\n',
  "services/client/package.json": JSON.stringify({
    name: "@cellar-assistant/client",
  }),
  "services/client/src/lib/show.ts":
    'import type { Item } from "@cellar-assistant/contracts/items";\nexport const show = (i: Item) => i;\n',
  "services/client/src/app/page.tsx":
    'import { show } from "@/lib/show";\nimport { other } from "@cellar-assistant/contracts";\nexport default function Page() {\n  return show;\n}\n',
  "services/client/node_modules/dep/index.ts":
    'import { itemName } from "@cellar-assistant/contracts";\n',
};

before(() => {
  root = mkdtempSync(join(tmpdir(), "code-map-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  sources = loadSources(root);
  packages = loadPackages(root);
});
after(() => rmSync(root, { recursive: true, force: true }));

describe("loading", () => {
  it("reads the workspace packages and skips node_modules", () => {
    assert.deepEqual(
      packages.map((p) => p.name),
      [
        "@cellar-assistant/contracts",
        "@cellar-assistant/db",
        "@cellar-assistant/client",
      ],
    );
    assert.equal(
      sources.has("services/client/node_modules/dep/index.ts"),
      false,
    );
    assert.equal(sources.has("packages/contracts/src/items.ts"), true);
  });
  it("says how to install when typescript is missing", () => {
    assert.throws(() => loadTypescript(root), /bun install --frozen-lockfile/);
  });
});

describe("parsePackage", () => {
  it("takes the types condition, a bare string, or main", () => {
    assert.deepEqual(
      parsePackage("packages/db", files["packages/db/package.json"])?.exports,
      { ".": "packages/db/src/index.ts", "./orm": "packages/db/src/orm.ts" },
    );
    assert.deepEqual(
      parsePackage("p/a", JSON.stringify({ name: "a", exports: "./x.ts" }))
        ?.exports,
      { ".": "p/a/x.ts" },
    );
    assert.deepEqual(
      parsePackage("p/a", JSON.stringify({ name: "a", main: "m.ts" }))?.exports,
      { ".": "p/a/m.ts" },
    );
    assert.equal(parsePackage("p", "{"), null);
  });
});

describe("resolveSpecifier", () => {
  const from = "services/client/src/app/page.tsx";
  it("resolves the alias, relative paths and workspace subpaths", () => {
    assert.equal(
      resolveSpecifier(from, "@/lib/show", sources, packages),
      "services/client/src/lib/show.ts",
    );
    assert.equal(
      resolveSpecifier(
        from,
        "@cellar-assistant/contracts/items",
        sources,
        packages,
      ),
      "packages/contracts/src/items.ts",
    );
    assert.equal(
      resolveSpecifier(
        "packages/contracts/src/index.ts",
        "./other",
        sources,
        packages,
      ),
      "packages/contracts/src/other.ts",
    );
    assert.equal(resolveSpecifier(from, "react", sources, packages), null);
    assert.equal(
      resolveSpecifier(
        from,
        "@cellar-assistant/contracts/nope",
        sources,
        packages,
      ),
      null,
    );
  });
});

describe("importersOf", () => {
  it("lists direct importers and those through a barrel, across packages", () => {
    const graph = importGraph(sources, packages);
    const target = "packages/contracts/src/items.ts";
    const names = exportsOf(target, sources.get(target) ?? "").map(
      (e) => e.name,
    );
    assert.deepEqual(names, ["Item", "itemName"]);
    assert.deepEqual(importersOf(target, names, graph), [
      { file: "packages/contracts/src/index.ts", barrel: true },
      { file: "packages/contracts/src/items.test.ts" },
      {
        file: "packages/db/src/index.ts",
        via: "packages/contracts/src/index.ts",
      },
      { file: "services/api/src/q.ts", via: "packages/contracts/src/index.ts" },
      { file: "services/client/src/lib/show.ts" },
    ]);
  });
  it("does not list a barrel user that takes only another file's names", () => {
    const graph = importGraph(sources, packages);
    const users = importersOf(
      "packages/contracts/src/items.ts",
      ["Item", "itemName"],
      graph,
    );
    assert.equal(
      users.some((u) => u.file === "services/client/src/app/page.tsx"),
      false,
    );
  });
});

describe("specifiersOf", () => {
  it("reads named, default, star, side-effect and dynamic imports", () => {
    const s = specifiersOf(
      'import a, { b as c } from "./x";\nimport * as n from "./n";\nimport "./side";\nconst m = import("./dyn");\n',
    );
    assert.deepEqual(
      s.map((x) => [x.spec, x.names]),
      [
        [
          "./x",
          [
            ["b", "c"],
            ["default", "a"],
          ],
        ],
        ["./n", "*"],
        ["./side", []],
        ["./dyn", "*"],
      ],
    );
  });
});

describe("renderMap", () => {
  it("names the owning package, exports and importers", () => {
    const out = renderMap(
      ["packages/contracts/src/items.ts"],
      sources,
      packages,
    );
    assert.match(
      out,
      /### `packages\/contracts\/src\/items\.ts` · 7 lines · @cellar-assistant\/contracts/,
    );
    assert.match(out, /- L4 function `function itemName\(i: Item\): string`/);
    assert.match(
      out,
      /\*\*Imported by \(3\):\*\* `packages\/db\/src\/index\.ts` \(via `packages\/contracts\/src\/index\.ts`\), `services\/api\/src\/q\.ts` \(via `packages\/contracts\/src\/index\.ts`\), `services\/client\/src\/lib\/show\.ts`/,
    );
    assert.match(
      out,
      /\*\*Re-exported by:\*\* `packages\/contracts\/src\/index\.ts`/,
    );
    assert.match(
      out,
      /\*\*Tests \(1\):\*\* `packages\/contracts\/src\/items\.test\.ts`/,
    );
  });
  it("expands a directory and refuses a path that names nothing", () => {
    const out = renderMap(["packages/contracts/src"], sources, packages);
    assert.equal(out.split("### ").length - 1, 3);
    assert.throws(
      () => renderMap(["nope"], sources, packages),
      /no file or directory/,
    );
  });
});

describe("star re-exports", () => {
  it("expands a resolvable star and marks an unresolvable one", () => {
    assert.deepEqual(
      [
        ...exportedNames("packages/contracts/src/index.ts", sources, packages),
      ].sort(),
      ["Item", "itemName", "other"],
    );
    assert.deepEqual(
      [...exportedNames("packages/db/src/orm.ts", sources, packages)].sort(),
      ["*", "local"],
    );
  });
  it("lists named importers of a barrel and of a third-party star", () => {
    const graph = importGraph(sources, packages);
    const users = (f: string) =>
      importersOf(f, [...exportedNames(f, sources, packages)], graph).map(
        (i) => i.file,
      );
    assert.deepEqual(users("packages/db/src/orm.ts"), [
      "services/api/src/q.ts",
    ]);
    assert.deepEqual(users("packages/contracts/src/index.ts"), [
      "packages/db/src/index.ts",
      "services/api/src/q.ts",
      "services/client/src/app/page.tsx",
    ]);
  });
});

describe("resolvePackage", () => {
  it("substitutes every * in an exports target, as Node does", () => {
    const pkg = {
      name: "@cellar-assistant/x",
      dir: "packages/x",
      exports: { "./*": "packages/x/src/*/*.ts" },
    };
    assert.equal(
      resolvePackage("@cellar-assistant/x/item", [pkg]),
      "packages/x/src/item/item.ts",
    );
  });
});
