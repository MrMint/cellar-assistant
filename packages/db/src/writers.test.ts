/**
 * The single-writer test (migration-plan §1.2).
 *
 * Two halves, and both have to hold:
 *
 *   1. **coverage** — every table in the Drizzle schema appears exactly once in
 *      `TABLE_WRITERS`;
 *   2. **containment** — the only module under `services/actors/src` that writes a
 *      table is that table's named actor.
 *
 * Half 1 also fails at typecheck (`satisfies Record<TableName, Writer>`), which
 * is the faster signal. The runtime assertion stays because the `satisfies` can
 * be loosened by one careless edit, and because it is what prints the list.
 */
import {
  FIXTURE_OPTIONS,
  fixtureProject,
  PROGRAM_TIMEOUT_MS,
} from "@cellar-assistant/analysis";
import { beforeAll, describe, expect, it } from "vitest";
import { tables } from "./schema/index.ts";
import {
  ACTOR_WRITERS,
  BETTER_AUTH_WRITER_MODULES,
  isActorWriter,
  isBetterAuthWriterModule,
  TABLE_WRITERS,
  tablesWithoutWriter,
  writerFor,
  writerModule,
} from "./writers.ts";
import {
  ACTORS_SRC,
  EXPORT_TO_TABLE,
  hostWrites,
  scanWrites,
  type UnresolvedWrite,
  type WriteScan,
  type WriteSite,
} from "./writers-scan.ts";

const SCHEMA_TABLES = Object.keys(tables).sort();

/**
 * The host's scan, once: the full program and the checker's pass over it,
 * under a timeout sized for CPU rather than inside whichever test reaches it
 * first (PROGRAM_TIMEOUT_MS says why).
 */
let host: WriteScan = { sites: [], unresolved: [] };
beforeAll(() => {
  host = hostWrites();
}, PROGRAM_TIMEOUT_MS);

describe("single writer — coverage (§1.2)", () => {
  it("assigns exactly one writer to every table in the schema", () => {
    const missing = tablesWithoutWriter(SCHEMA_TABLES);
    expect(
      missing,
      missing.length === 0
        ? ""
        : [
            "",
            `${missing.length} table(s) in the Drizzle schema have no writer:`,
            "",
            ...missing.map((t) => `  ${t}`),
            "",
            "Migration plan §1.2: every application table has exactly one",
            "writing actor class. Add each table to TABLE_WRITERS in",
            "packages/db/src/writers.ts, pointing at the actor that owns the",
            "aggregate (§3 has the map). If nothing owns it because it is",
            "infrastructure, say so explicitly with `infrastructure:outbox`,",
            "`infrastructure:migrations` or `infrastructure:better-auth` — an",
            "unassigned table is not a shared table, it is an unanswered",
            "question.",
            "",
          ].join("\n"),
    ).toEqual([]);
  });

  it("names no table the schema does not declare", () => {
    const schemaTables = new Set(SCHEMA_TABLES);
    const stale = Object.keys(TABLE_WRITERS).filter(
      (t) => !schemaTables.has(t),
    );
    expect(stale).toEqual([]);
  });

  it("never assigns two writers to one table", () => {
    const entries = Object.entries(TABLE_WRITERS);
    expect(new Set(entries.map(([table]) => table)).size).toBe(entries.length);
  });

  it("resolves the §3 map", () => {
    expect(writerFor("cellars")).toBe("CellarActor");
    expect(writerFor("check_ins")).toBe("CellarActor");
    expect(writerFor("friends")).toBe("UserActor");
    expect(writerFor("outbox")).toBe("infrastructure:outbox");
    expect(writerFor("country")).toBe("infrastructure:migrations");
    expect(writerFor("user")).toBe("infrastructure:better-auth");
    expect(writerFor("account")).toBe("infrastructure:better-auth");
    expect(writerFor("not_a_table")).toBeUndefined();
  });

  it("derives a module path from each actor's name", () => {
    expect(writerModule("CellarActor")).toBe("actors/cellar-actor");
    expect(writerModule("ItemOnboardingActor")).toBe(
      "actors/item-onboarding-actor",
    );
    expect(new Set(ACTOR_WRITERS.map(writerModule)).size).toBe(
      ACTOR_WRITERS.length,
    );
  });
});

/* -------------------------------------------------------------------------- */

/** Is `file` inside the module that owns `writer`'s writes? */
const ownedBy = (file: string, module: string): boolean =>
  file === `${module}.ts` || file.startsWith(`${module}/`);

type Violation = { site: WriteSite; reason: string };

const violationsIn = (sites: readonly WriteSite[]): Violation[] =>
  sites.flatMap((site) => {
    const writer = writerFor(site.table);
    if (writer === undefined) {
      return [
        {
          site,
          reason:
            `\`${site.table}\` has no entry in TABLE_WRITERS. It is either a ` +
            "table the schema does not declare, or one nothing owns yet.",
        },
      ];
    }
    if (writer === "infrastructure:outbox") return [];
    if (writer === "infrastructure:better-auth") {
      if (isBetterAuthWriterModule(site.file)) return [];
      return [
        {
          site,
          reason:
            `\`${site.table}\` is better-auth's (§3). Its own Drizzle adapter ` +
            "writes it; no actor may. The only modules allowed to are " +
            `${BETTER_AUTH_WRITER_MODULES.join(", ")}.`,
        },
      ];
    }
    if (writer === "infrastructure:migrations") {
      return [
        {
          site,
          reason:
            `\`${site.table}\` is reference data (§4). It changes by ` +
            "migration only; `ReferenceDataActor` reads it and no actor " +
            "writes it.",
        },
      ];
    }
    if (!isActorWriter(writer)) return [];
    const module = writerModule(writer);
    if (ownedBy(site.file, module)) return [];
    return [
      {
        site,
        reason:
          `\`${site.table}\` is owned by ${writer}, whose writes live in ` +
          `${module}.ts (or ${module}/). This file is not it.`,
      },
    ];
  });

describe("single writer — containment (§1.2)", () => {
  it("can see the actor sources and resolve schema exports", () => {
    expect(EXPORT_TO_TABLE.get("cellarOwners")).toBe("cellar_owners");
    // Equality, not `greaterThan`. It used to be `greaterThan` because
    // `tables.ts` also declared the `auth.*` and `storage.*` tables that
    // `tables` deliberately left out. X2's `public`-only baseline has no such
    // tables left, so every `pgTable` in the generated file is now expected to
    // appear in the map — and a re-pull that adds one without a writer fails
    // here as well as in the coverage half.
    expect(EXPORT_TO_TABLE.size).toBe(SCHEMA_TABLES.length);
    expect(ACTORS_SRC).toMatch(/services\/actors\/src$/);
    // A scan that silently found nothing to read would pass forever.
    expect(host.sites.length).toBeGreaterThan(0);
  });

  it("lets only a table's named actor write it", () => {
    const violations = violationsIn(host.sites);
    const detail = violations
      .map(
        (v) =>
          `  ${v.site.file}:${v.site.line}  ${v.site.how}(${v.site.table})\n` +
          `      ${v.site.text}\n` +
          `      ${v.reason}`,
      )
      .join("\n\n");

    expect(
      violations.map((v) => `${v.site.file}:${v.site.line} ${v.site.table}`),
      violations.length === 0
        ? ""
        : [
            "",
            `${violations.length} write(s) outside the owning actor:`,
            "",
            detail,
            "",
            "Migration plan §1.2: no actor writes another aggregate's rows,",
            "even inside a transaction. A cross-aggregate operation is a",
            "sequence of idempotent calls to the owning actors, with the",
            "outbox as the retry mechanism (§1.4): commit your own write and",
            "an `outbox` row in one transaction, and let the outbox deliver",
            "the call to the actor that owns the other rows.",
            "",
            "If the table genuinely belongs to this actor, move it in",
            "packages/db/src/writers.ts — and check §3 first, because the map",
            "there is the plan's own answer.",
            "",
          ].join("\n"),
    ).toEqual([]);
  });

  it("detects a write from the wrong module", () => {
    // The mechanism itself, against a synthetic site — so this test does not
    // depend on a real violation existing, and cannot rot into a no-op.
    const foreign: WriteSite = {
      file: "actors/item-actor.ts",
      line: 42,
      table: "cellars",
      how: "insert",
      text: "tx.insert(cellars)",
    };
    const owned: WriteSite = { ...foreign, file: "actors/cellar-actor.ts" };
    const nested: WriteSite = {
      ...foreign,
      file: "actors/cellar-actor/check-ins.ts",
    };
    const outbox: WriteSite = { ...foreign, table: "outbox" };
    const reference: WriteSite = { ...foreign, table: "country" };
    // better-auth's tables: allowed from its own island and from B4's declared
    // profile seam, a violation from anywhere else (§1.2, X2).
    const authIsland: WriteSite = {
      ...foreign,
      file: "auth/auth.ts",
      table: "account",
    };
    const profileSeam: WriteSite = {
      ...foreign,
      file: "lib/profile-store.ts",
      table: "user",
    };
    const authElsewhere: WriteSite = { ...foreign, table: "user" };

    expect(violationsIn([owned, nested, outbox])).toEqual([]);
    expect(violationsIn([authIsland, profileSeam])).toEqual([]);
    expect(violationsIn([foreign])).toHaveLength(1);
    expect(violationsIn([foreign])[0]?.reason).toContain(
      "owned by CellarActor",
    );
    expect(violationsIn([reference])[0]?.reason).toContain("reference data");
    expect(violationsIn([authElsewhere])[0]?.reason).toContain("better-auth's");
  });
});

/* -------------------------------------------------------------------------- */

/**
 * Write-shaped methods *this repo* declares, each reviewed and found not to
 * write Postgres. Keyed by the declaring `Type.method` the checker resolves the
 * call to — not by file or receiver text — so every call of a reviewed seam is
 * covered, and nothing else is.
 *
 * Library methods (`Hash.update`, `Sign.update`, `Set.delete`, …) need no entry:
 * the checker says they are not Drizzle's, and a library cannot be wrapping a
 * write to our tables. A seam in this repo can, which is why each is named here
 * with what it actually does. Everything else the scan cannot resolve FAILS the
 * test below: `tx.insert(someTable as PgTable)` or a write on an `any`
 * receiver is a write the containment half cannot attribute.
 */
const NOT_DRIZZLE_SEAMS: readonly { seam: string; why: string }[] = [
  {
    seam: "FilesBinding.delete",
    why: "the object store's DeleteObject, not Postgres",
  },
  {
    seam: "ProfileStore.update",
    why: "the declared better-auth profile seam; its own writes are scanned in lib/profile-store.ts",
  },
];

const isReviewed = (u: UnresolvedWrite): boolean =>
  NOT_DRIZZLE_SEAMS.some((entry) => entry.seam === u.seam);

describe("single writer — the scan fails closed", () => {
  it("resolves every write-shaped call to a table, or it is a reviewed seam", () => {
    const unreviewed = host.unresolved.filter((u) => !isReviewed(u));
    expect(
      unreviewed.map((u) => `${u.file}:${u.line} ${u.receiver}.${u.how}(…)`),
      unreviewed.length === 0
        ? ""
        : [
            "",
            `${unreviewed.length} write-shaped call(s) whose target the single-writer scan cannot resolve:`,
            "",
            ...unreviewed.map(
              (u) => `  ${u.file}:${u.line}  ${u.text}  [${u.seam ?? "?"}]`,
            ),
            "",
            "If this is a Drizzle write, pass the table itself — any expression",
            "whose type is a schema table, or a union of them. A table widened to",
            "`PgTable` or `any` is a write the containment half cannot attribute,",
            "so it is refused rather than skipped. If it is a method of this repo",
            "that does not write Postgres, add its `Type.method` to",
            "NOT_DRIZZLE_SEAMS with what it actually does.",
            "",
          ].join("\n"),
    ).toEqual([]);
  });

  it("carries no stale review entries", () => {
    // An entry whose seam no production call reaches any more would silently
    // pre-approve the next method that happens to take its name.
    const seams = new Set(host.unresolved.map((u) => u.seam));
    expect(NOT_DRIZZLE_SEAMS.filter((entry) => !seams.has(entry.seam))).toEqual(
      [],
    );
  });

  // The raw-SQL half had no negative control at all: disabling it, dropping
  // `delete from` from its pattern, or skipping template middles all passed,
  // because every raw write in the tree today is correctly owned. So: raw
  // writes from the wrong module, in every literal shape a query can take.
  it("finds a raw-SQL write in every literal shape, and flags the wrong module (negative control)", () => {
    /** A substitution in the fixture's own template literals. */
    const ID = "$" + "{id}";
    const project = fixtureProject({
      root: `${ACTORS_SRC}/__writers_fixture__`,
      files: {
        "actors/item-actor.ts": [
          "declare const sql: (s: TemplateStringsArray, ...v: unknown[]) => unknown;",
          "declare const id: string;",
          'export const a = "insert into cellars (id) values (1)";',
          "export const b = `update public.cellars set name = 'n'`;",
          `export const c = sql\`delete from "cellars" where id = ${ID}\`;`,
          `export const d = sql\`select ${ID}, 2; update tier_lists set x = ${ID} where y = 1\`;`,
          `export const e = sql\`select ${ID} from t; DELETE FROM menu_scans\`;`,
          'export const f = "select * from cellars; update_count";',
        ].join("\n"),
      },
      options: { ...FIXTURE_OPTIONS, types: ["node"] },
    });
    const raw = scanWrites(project, project.root).sites.filter(
      (s) => s.how === "raw sql",
    );
    expect(raw.map((s) => `${s.line} ${s.table}`)).toEqual([
      "3 cellars", // a string literal
      "4 cellars", // a template with no substitutions, schema-qualified
      "5 cellars", // a template head, quoted identifier
      "6 tier_lists", // a template MIDDLE
      "7 menu_scans", // a template tail, upper case
    ]);
    // Written from ItemActor's module, every one of them is someone else's.
    expect(violationsIn(raw)).toHaveLength(raw.length);
  });

  it("resolves a table by its type, and reports what it cannot (negative control)", () => {
    const project = fixtureProject({
      root: `${ACTORS_SRC}/__writers_fixture__`,
      files: {
        "synthetic.ts": [
          'import { beers, wines } from "@cellar-assistant/db";',
          'import * as schema from "@cellar-assistant/db";',
          'import type { PgTable } from "drizzle-orm/pg-core";',
          'import type { DbOrTx } from "../lib/db.ts";',
          "const ITEM_TABLE = { BEER: beers, WINE: wines } as const;",
          "class Store { update(_row: object) { return 0; } }",
          "export async function f(tx: DbOrTx, loose: any, table: PgTable, type: 'BEER' | 'WINE') {",
          "  await tx.insert(ITEM_TABLE[type]).values({} as never);",
          "  const t = wines;",
          "  await tx.update(t).set({});",
          "  await tx.delete(schema.cellars);",
          "  await tx.delete(table);",
          "  await loose.insert({});",
          "  new Store().update({});",
          '  new Set<string>().delete("x");',
          "}",
        ].join("\n"),
      },
      options: { ...FIXTURE_OPTIONS, types: ["node"] },
    });
    const scan = scanWrites(project, project.root);
    expect(scan.sites.map((s) => `${s.line} ${s.how}(${s.table})`)).toEqual([
      "8 insert(beers)",
      "8 insert(wines)",
      "10 update(wines)",
      "11 delete(cellars)",
    ]);
    expect(
      scan.unresolved.map((u) => `${u.line} ${u.receiver}.${u.how} ${u.seam}`),
    ).toEqual([
      "12 tx.delete null",
      "13 loose.insert null",
      "14 new Store().update Store.update",
    ]);
    // And none is pre-approved by the review list.
    expect(scan.unresolved.filter(isReviewed)).toEqual([]);
  });
});
