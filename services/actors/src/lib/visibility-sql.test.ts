/**
 * `./visibility-sql.ts` without a database: the friend-id derivation, the two
 * short-circuits, and a scan that keeps the SQL rule written once.
 *
 * The clause's *meaning* is proved against `packages/policy`'s `canSee` by the
 * parity tests in `cellars-collection-actor.test.ts`,
 * `check-ins-collection-actor.test.ts` and `tier-lists-collection-actor.test.ts`,
 * which run it against real rows.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "@cellar-assistant/db/orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { canSeeSql, friendIdsOf, type VisibleRow } from "./visibility-sql.ts";

const ME = "00000000-0000-4000-8000-000000000001";
const ANN = "00000000-0000-4000-8000-000000000002";
const BOB = "00000000-0000-4000-8000-000000000003";

const ROW: VisibleRow = {
  createdBy: sql.raw("t.created_by_id"),
  privacy: sql.raw("t.privacy"),
};

const render = (fragment: ReturnType<typeof canSeeSql>) =>
  new PgDialect().sqlToQuery(fragment);

describe("friendIdsOf", () => {
  it("takes the other side of each row, once, in either direction, never me", () => {
    expect(
      friendIdsOf(ME, [
        { userId: ME, friendId: ANN },
        { userId: ANN, friendId: ME },
        { userId: BOB, friendId: ME },
        { userId: ME, friendId: ME },
      ]),
    ).toEqual([ANN, BOB]);
  });
});

describe("canSeeSql", () => {
  it("is `true` for a privileged caller and `false` for an anonymous one", () => {
    expect(render(canSeeSql({ kind: "everything" }, ROW)).sql).toBe("true");
    expect(render(canSeeSql({ kind: "nothing" }, ROW)).sql).toBe("false");
  });

  it("binds the viewer and inlines only validated friend ids", () => {
    const { sql: text, params } = render(
      canSeeSql({ kind: "viewer", viewer: ME, friendIds: [ANN] }, ROW),
    );
    expect(params).toEqual([ME]);
    expect(text).toContain(`'{${ANN}}'::uuid[]`);
    expect(text).not.toContain("cellar_owners");
  });

  it("adds the co-owner branch only for a row that has one", () => {
    const { sql: text, params } = render(
      canSeeSql(
        { kind: "viewer", viewer: ME, friendIds: [] },
        { ...ROW, coOwnedCellarId: sql.raw("c.id") },
      ),
    );
    expect(text).toContain("public.cellar_owners");
    expect(params).toEqual([ME, ME]);
  });
});

/* -------------------------------------------------------------------------- */
/* Written once                                                                */
/* -------------------------------------------------------------------------- */

const SRC = fileURLToPath(new URL("..", import.meta.url));
const HOME = fileURLToPath(new URL("./visibility-sql.ts", import.meta.url));

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
  });

describe("the SQL visibility rule is written once", () => {
  // The FRIENDS branch is the one every hand copy had to spell out; a query
  // that needs it calls `visibleWhere` / `canSeeSql` instead.
  it("no module but visibility-sql.ts compares a privacy column to 'FRIENDS'", () => {
    const hits = sourceFiles(SRC)
      .filter((file) => file !== HOME)
      .filter((file) =>
        /privacy\s*=\s*'FRIENDS'/.test(readFileSync(file, "utf8")),
      )
      .map((file) => file.slice(SRC.length));
    expect(hits).toEqual([]);
  });
});
