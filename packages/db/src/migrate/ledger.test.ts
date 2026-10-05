/**
 * The ledger's planner and manifest, against the real migrations directory and
 * against synthetic ones. No database: `cli.ts` is the part that talks to
 * Postgres, and its behaviour against real databases is recorded in the commit
 * that introduced it (adoption of a template clone, the missing-FK case, a
 * half-applied migration, checksum and ordering refusals, rollback).
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADOPTION,
  type Adoption,
  loadMigrations,
  MIGRATIONS_DIR,
  type Migration,
  plan,
  sha256,
  TRANSFORM_HORIZON,
  transactionHazards,
} from "./ledger.ts";

const REAL = loadMigrations();

const m = (name: string, sql = `-- ${name}`): Migration => ({
  name,
  sql,
  sha256: sha256(sql),
});

describe("the migrations directory", () => {
  it("is read, not silently empty", () => {
    expect(REAL.length).toBeGreaterThanOrEqual(11);
    expect(REAL.map((x) => x.name)).toContain(TRANSFORM_HORIZON);
  });

  it("gives every migration a migration.sql and a snapshot.json", () => {
    // drizzle-kit chains snapshots by prevIds; a migration without one breaks
    // the chain `drizzle-kit check` validates and the next `generate` diffs from.
    const missing = readdirSync(MIGRATIONS_DIR)
      .filter((d) => statSync(join(MIGRATIONS_DIR, d)).isDirectory())
      .flatMap((d) =>
        ["migration.sql", "snapshot.json"]
          .filter((f) => !existsSync(join(MIGRATIONS_DIR, d, f)))
          .map((f) => `${d}/${f}`),
      );
    expect(missing).toEqual([]);
  });

  it("names every migration <14-digit timestamp>_<name>, so name order is apply order", () => {
    expect(
      REAL.filter((x) => !/^[0-9]{14}_[A-Za-z0-9_-]+$/.test(x.name)),
    ).toEqual([]);
  });

  it("holds nothing that cannot run inside a transaction", () => {
    const hazards = REAL.flatMap((x) =>
      transactionHazards(x.sql).map((h) => `${x.name}: ${h}`),
    );
    expect(hazards).toEqual([]);
  });

  it("plans cleanly against an empty ledger: every migration, horizon ones adopted", () => {
    const p = plan(REAL, []);
    expect(p.refusals).toEqual([]);
    expect(p.steps.map((s) => s.migration.name)).toEqual(
      REAL.map((x) => x.name),
    );
    for (const step of p.steps) {
      expect(step.action).toBe(
        step.migration.name <= TRANSFORM_HORIZON ? "adopt" : "apply",
      );
    }
  });
});

describe("the adoption manifest (frozen at the horizon)", () => {
  const atOrBefore = REAL.filter((x) => x.name <= TRANSFORM_HORIZON);

  it("covers exactly the migrations at or before the horizon", () => {
    expect(Object.keys(ADOPTION).sort()).toEqual(atOrBefore.map((x) => x.name));
  });

  it("starts with the one baseline, and it is the introspected, commented-out one", () => {
    const baselines = Object.entries(ADOPTION).filter(
      ([, a]) => a.kind === "baseline",
    );
    expect(baselines.map(([n]) => n)).toEqual([REAL[0]?.name]);
    expect(REAL[0]?.sql).toMatch(
      /^-- Current sql file was generated after introspecting/,
    );
  });

  it("re-applies exactly the migrations that carried the hand-written lane marker", () => {
    // The marker was the old selection rule: those files were re-applied on
    // every build, so they are the ones known to be idempotent.
    const LANE_MARKER = "Hand-written SQL lane";
    const reapply = Object.entries(ADOPTION)
      .filter(([, a]) => a.kind === "reapply")
      .map(([n]) => n);
    const marked = atOrBefore
      .filter((x) => x.sql.includes(LANE_MARKER))
      .map((x) => x.name);
    expect(reapply.sort()).toEqual(marked);
  });

  it("probes every other one, with at least one check", () => {
    const probed = Object.entries(ADOPTION).filter(
      (e): e is [string, Extract<Adoption, { kind: "probe" }>] =>
        e[1].kind === "probe",
    );
    expect(probed.length).toBe(atOrBefore.length - 1 - 5);
    for (const [, a] of probed) expect(a.checks.length).toBeGreaterThan(0);
  });
});

describe("plan", () => {
  const A = m("20260101000000_a");
  const B = m("20260102000000_b");
  const C = m("20260103000000_c");
  const adoption: Record<string, Adoption> = {
    [A.name]: { kind: "baseline", why: "test" },
  };
  const go = (disk: Migration[], ledger: { name: string; sha256: string }[]) =>
    plan(disk, ledger, A.name, adoption);

  it("applies only what is unrecorded, in name order", () => {
    const p = go([A, B, C], [{ name: A.name, sha256: A.sha256 }]);
    expect(p.refusals).toEqual([]);
    expect(p.steps.map((s) => `${s.action} ${s.migration.name}`)).toEqual([
      `apply ${B.name}`,
      `apply ${C.name}`,
    ]);
  });

  it("does nothing when everything is recorded", () => {
    const p = go(
      [A, B],
      [A, B].map(({ name, sha256 }) => ({ name, sha256 })),
    );
    expect(p.steps).toEqual([]);
    expect(p.refusals).toEqual([]);
  });

  it("refuses a migration whose file changed after it was applied (negative control)", () => {
    const p = go(
      [A, m(B.name, "-- edited")],
      [A, B].map(({ name, sha256 }) => ({ name, sha256 })),
    );
    expect(p.refusals.join()).toMatch(
      /20260102000000_b was applied from a file with sha256/,
    );
  });

  it("refuses to apply a migration older than one already recorded (negative control)", () => {
    const p = go(
      [A, B, C],
      [A, C].map(({ name, sha256 }) => ({ name, sha256 })),
    );
    expect(p.refusals.join()).toMatch(
      /out of order: 20260102000000_b sorts before 20260103000000_c/,
    );
  });

  it("also refuses out-of-order against a newer tree's migration it does not know", () => {
    const future = { name: "20260109000000_newer", sha256: "0".repeat(64) };
    const p = go([A, B], [{ name: A.name, sha256: A.sha256 }, future]);
    expect(p.unknown).toEqual([future.name]);
    expect(p.refusals.join()).toMatch(/out of order/);
  });

  it("reports, but does not refuse, a newer tree's migration when nothing is pending", () => {
    const future = { name: "20260109000000_newer", sha256: "0".repeat(64) };
    const p = go([A], [{ name: A.name, sha256: A.sha256 }, future]);
    expect(p.unknown).toEqual([future.name]);
    expect(p.refusals).toEqual([]);
    expect(p.steps).toEqual([]);
  });

  it("refuses a horizon migration with no adoption entry (negative control)", () => {
    const p = plan([A, B], [], B.name, adoption);
    expect(p.refusals.join()).toMatch(
      /20260102000000_b is at or before the transform horizon/,
    );
  });

  it("refuses a horizon that is not on disk", () => {
    const p = plan([A], [], "20260199000000_gone", adoption);
    expect(p.refusals.join()).toMatch(
      /horizon 20260199000000_gone is not a migration on disk/,
    );
  });

  it("refuses a pending migration that cannot run in a transaction", () => {
    const bad = m(
      "20260104000000_idx",
      "CREATE INDEX CONCURRENTLY x ON t (c);",
    );
    const p = go([A, bad], [{ name: A.name, sha256: A.sha256 }]);
    expect(p.refusals.join()).toMatch(
      /cannot be applied in a transaction: CONCURRENTLY/,
    );
  });
});

describe("transactionHazards", () => {
  it("does not mistake a PL/pgSQL body for transaction control", () => {
    const body = [
      "DO $$",
      "BEGIN",
      "  IF true THEN PERFORM 1; END IF;",
      "END $$;",
      "CREATE FUNCTION f() RETURNS int LANGUAGE plpgsql AS $f$",
      "BEGIN",
      "  RETURN 1;",
      "END;",
      "$f$;",
      "-- CREATE INDEX CONCURRENTLY in a comment is fine",
    ].join("\n");
    expect(transactionHazards(body)).toEqual([]);
  });

  it("catches top-level BEGIN; / COMMIT; (negative control)", () => {
    expect(
      transactionHazards("BEGIN;\nALTER TABLE t ADD c int;\nCOMMIT;"),
    ).toEqual(["top-level transaction control"]);
  });
});
