/**
 * `db:migrate` — bring a database's schema up to this tree's migrations, and
 * record what it did in `cellar_meta.schema_migrations`. See `ledger.ts` for the
 * design; this file is the part that talks to Postgres.
 *
 *   node packages/db/src/migrate/cli.ts --url postgres://…            apply
 *   node packages/db/src/migrate/cli.ts --url postgres://… --status   report only
 *   MIGRATE_DATABASE_URL=postgres://… node packages/db/src/migrate/cli.ts
 *
 * THERE IS NO DEFAULT DATABASE, and `DATABASE_URL` is deliberately not read.
 * bun auto-loads `.env` from the working directory, so a `DATABASE_URL` can be
 * live configuration nobody set on purpose, and "migrate whatever that points
 * at" is the wrong default for the one command that runs DDL.
 *
 * Exit status: 0 up to date (after applying, or `--status` with nothing to do);
 * 3 `--status` found pending migrations; 1 refused or failed; 2 usage.
 *
 * Runs under Node 24's own type stripping (`.nvmrc`), like the other scripts
 * that hand a `.ts` file to `node`.
 *
 * {@link migrate} is exported so `cli.test.ts` can drive it against a
 * throwaway database with migrations of its own; it runs as a command only
 * when this file is the process's entry point. Everything stays in this one
 * file on purpose: `transform/test-db.sh` fingerprints `ledger.ts` and
 * `cli.ts` to decide when the test template is stale.
 */
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pg from "pg";
import {
  ADOPTION,
  type Adoption,
  type Check,
  LEDGER_SCHEMA,
  LEDGER_TABLE,
  loadMigrations,
  type Migration,
  plan,
  redact,
  TRANSFORM_HORIZON,
  TRANSFORMED_DATABASE,
} from "./ledger.ts";

/**
 * Held for the whole run, per database: two `db:migrate`s against one database
 * (two worktrees bootstrapping off `cellar-stack`, say) serialise here instead
 * of both deciding the same migration is pending. Advisory locks are
 * per-database, so this never contends with `test-db.sh`'s lock on `postgres`.
 */
export const LOCK_KEY = "cellar_schema_migrations";

const LOCK_WAIT_SECONDS = Number(process.env.MIGRATE_LOCK_WAIT ?? "60");
/**
 * How long one DDL statement may queue for a table lock before the migration
 * fails (and rolls back) rather than stalling every query queued behind it.
 * Irrelevant during a freeze; the thing that matters on a live database.
 */
const LOCK_TIMEOUT = process.env.MIGRATE_LOCK_TIMEOUT ?? "10s";

const LEDGER_DDL = `
CREATE SCHEMA IF NOT EXISTS ${LEDGER_SCHEMA};
CREATE TABLE IF NOT EXISTS ${LEDGER_TABLE} (
  name       text        PRIMARY KEY CHECK (name ~ '^[0-9]{14}_[A-Za-z0-9_-]+$'),
  sha256     text        NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  method     text        NOT NULL CHECK (method IN ('baseline', 'adopted', 'applied')),
  applied_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE ${LEDGER_TABLE} IS
  'Written only by packages/db/src/migrate/cli.ts (db:migrate). One row per packages/db/migrations directory this database has; sha256 is of the migration.sql that was applied or adopted.';
`;

type Args = { url: string; status: boolean };

const usage = (why: string): never => {
  console.error(`db:migrate: ${why}`);
  console.error(
    "usage: node packages/db/src/migrate/cli.ts [--status] [--url postgres://…]  (or MIGRATE_DATABASE_URL)",
  );
  process.exit(2);
};

const parseArgs = (argv: readonly string[]): Args => {
  let url = process.env.MIGRATE_DATABASE_URL ?? "";
  let status = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--status") status = true;
    else if (arg === "--url") url = argv[++i] ?? usage("--url needs a value");
    else usage(`unexpected argument ${arg}`);
  }
  if (url === "") {
    usage(
      "no database named. Pass --url or set MIGRATE_DATABASE_URL — there is no default, and DATABASE_URL is not read.",
    );
  }
  return { url, status };
};

const say = (line: string): void => console.log(`==> ${line}`);
const note = (line: string): void => console.log(`    ${line}`);

const ask = async (client: pg.Client, check: Check): Promise<boolean> => {
  const { rows } = await client.query<{ answer: boolean }>(
    `SELECT (${check.sql}) AS answer`,
  );
  return rows[0]?.answer === true;
};

const probe = async (
  client: pg.Client,
  checks: readonly Check[],
): Promise<{ present: string[]; missing: string[] }> => {
  const present: string[] = [];
  const missing: string[] = [];
  for (const check of checks) {
    ((await ask(client, check)) ? present : missing).push(check.what);
  }
  return { present, missing };
};

const readLedger = async (client: pg.Client) => {
  const { rows: exists } = await client.query<{ t: string | null }>(
    `SELECT to_regclass('${LEDGER_TABLE}')::text AS t`,
  );
  if (exists[0]?.t == null) return { exists: false, rows: [] };
  const { rows } = await client.query<{ name: string; sha256: string }>(
    `SELECT name, sha256 FROM ${LEDGER_TABLE} ORDER BY name`,
  );
  return { exists: true, rows };
};

const record = (
  client: pg.Client,
  migration: Migration,
  method: "baseline" | "adopted" | "applied",
) =>
  client.query(
    `INSERT INTO ${LEDGER_TABLE} (name, sha256, method) VALUES ($1, $2, $3)`,
    [migration.name, migration.sha256, method],
  );

/** What adopting one migration will do, decided by probing (read-only). */
type Resolution =
  | {
      readonly verdict: "record";
      readonly method: "baseline" | "adopted";
      readonly detail: string;
    }
  | {
      readonly verdict: "apply";
      readonly detail: string;
      readonly checks?: readonly Check[];
    }
  | { readonly verdict: "refuse"; readonly detail: string };

const resolveAdoption = async (
  client: pg.Client,
  adoption: Adoption,
): Promise<Resolution> => {
  switch (adoption.kind) {
    case "baseline":
      return { verdict: "record", method: "baseline", detail: adoption.why };
    case "reapply":
      return { verdict: "apply", detail: `idempotent: ${adoption.why}` };
    case "probe": {
      const { present, missing } = await probe(client, adoption.checks);
      if (missing.length === 0) {
        return {
          verdict: "record",
          method: "adopted",
          detail: `already present (${adoption.producedBy}): ${present.join(", ")}`,
        };
      }
      if (present.length === 0) {
        return {
          verdict: "apply",
          detail: `absent, so applied: ${missing.join(", ")}`,
          checks: adoption.checks,
        };
      }
      return {
        verdict: "refuse",
        detail:
          `half present — has ${present.join(", ")}; lacks ${missing.join(", ")}. ` +
          "Neither recording it nor re-running it is safe; finish or undo it by hand, then re-run.",
      };
    }
  }
};

/**
 * What one run is told. Only `url` and `status` come from the command line;
 * the rest default to this tree and this environment, and exist so a test can
 * run the real statement sequence against migrations it wrote.
 */
export type MigrateOptions = {
  readonly url: string;
  readonly status: boolean;
  readonly lockWaitSeconds?: number;
  readonly migrations?: readonly Migration[];
  readonly horizon?: string;
  readonly adoption?: Readonly<Record<string, Adoption>>;
  /** The "is this transform-built?" checks asked before any adoption. */
  readonly transformed?: readonly Check[];
};

/** One `db:migrate` run. Returns the exit status (header); throws on failure. */
export const migrate = async (options: MigrateOptions): Promise<number> => {
  const args = options;
  const lockWaitSeconds = options.lockWaitSeconds ?? LOCK_WAIT_SECONDS;
  const horizon = options.horizon ?? TRANSFORM_HORIZON;
  const adoptionTable = options.adoption ?? ADOPTION;
  const transformed = options.transformed ?? TRANSFORMED_DATABASE;
  const migrations = options.migrations ?? loadMigrations();
  const decide = (rows: Parameters<typeof plan>[1]) =>
    plan(migrations, rows, horizon, adoptionTable);
  const client = new pg.Client({
    connectionString: args.url,
    connectionTimeoutMillis: 10_000,
    application_name: "cellar-db-migrate",
  });
  // A migration that changes data says what it did with `RAISE NOTICE` —
  // `20260928185314_canonical_barcode_codes` reports how many barcodes it
  // rewrote, merged and kept opaque — and node-postgres drops notices unless
  // someone listens. The operator running the cutover is who should read it.
  client.on("notice", (notice) => {
    note(`${notice.severity ?? "NOTICE"}: ${notice.message ?? ""}`);
  });
  await client.connect();
  try {
    const { rows: who } = await client.query<{ db: string }>(
      "SELECT current_database() AS db",
    );
    say(
      `db:migrate${args.status ? " --status" : ""}: ${redact(args.url)} (database ${who[0]?.db})`,
    );

    if (!args.status) {
      await client.query(`SET lock_timeout = '${LOCK_TIMEOUT}'`);
      let waited = 0;
      for (;;) {
        const { rows } = await client.query<{ ok: boolean }>(
          "SELECT pg_try_advisory_lock(hashtext($1)) AS ok",
          [LOCK_KEY],
        );
        if (rows[0]?.ok === true) break;
        if (waited === 2)
          note("waiting for another db:migrate on this database");
        if (waited >= lockWaitSeconds) {
          console.error(
            `db:migrate: another db:migrate has held this database's migration lock for ${lockWaitSeconds}s. Refusing to wait longer (MIGRATE_LOCK_WAIT).`,
          );
          return 1;
        }
        await new Promise((r) => setTimeout(r, 1000));
        waited++;
      }
    } else {
      await client.query("SET default_transaction_read_only = on");
    }

    const ledger = await readLedger(client);
    const decided = decide(ledger.rows);
    for (const name of decided.unknown) {
      note(
        `WARNING: ${name} is recorded here but is not in this tree — a newer tree migrated this database`,
      );
    }
    if (decided.refusals.length > 0) {
      for (const why of decided.refusals)
        console.error(`db:migrate: REFUSED: ${why}`);
      return 1;
    }

    const adoptions = decided.steps.filter((s) => s.action === "adopt");
    const applies = decided.steps.filter((s) => s.action === "apply");

    // Adoption needs a transform-built database underneath it. Asked even in
    // --status, so the doctor can say "this is not the database you think".
    const resolutions = new Map<string, Resolution>();
    if (adoptions.length > 0) {
      const { missing } = await probe(client, transformed);
      if (missing.length > 0) {
        console.error(
          `db:migrate: REFUSED: ${adoptions.length} migration(s) at or before the transform horizon are unrecorded, ` +
            `so this database has to be adopted — and it does not look transform-built (not true: ${missing.join("; ")}). ` +
            "Build it with packages/db/transform/run.sh (or the cutover's transform phases) first.",
        );
        return 1;
      }
      for (const step of adoptions) {
        resolutions.set(
          step.migration.name,
          await resolveAdoption(client, step.adoption),
        );
      }
      const refused = [...resolutions].filter(
        ([, r]) => r.verdict === "refuse",
      );
      if (refused.length > 0) {
        for (const [name, r] of refused) {
          console.error(`db:migrate: REFUSED: ${name}: ${r.detail}`);
        }
        return 1;
      }
    }

    if (args.status) {
      note(
        `ledger: ${ledger.exists ? `${decided.recorded} recorded` : "absent (never migrated by db:migrate)"}`,
      );
      for (const [name, r] of resolutions) {
        note(
          `adopt  ${name}: ${r.verdict === "record" ? r.method : "apply"} — ${r.detail}`,
        );
      }
      for (const step of applies) note(`apply  ${step.migration.name}`);
      const pending = decided.steps.length;
      say(
        pending === 0
          ? `db:migrate: up to date (${decided.recorded} recorded)`
          : `db:migrate: ${pending} pending (${adoptions.length} to adopt, ${applies.length} to apply)`,
      );
      return pending === 0 ? 0 : 3;
    }

    let adopted = 0;
    let applied = 0;
    // ONE transaction for the whole adoption: a database is either adopted up
    // to the horizon or not at all, so "the ledger exists" always means "the
    // ledger is complete up to the horizon".
    if (adoptions.length > 0) {
      await client.query("BEGIN");
      try {
        await client.query(LEDGER_DDL);
        for (const step of adoptions) {
          const r = resolutions.get(step.migration.name);
          if (r === undefined || r.verdict === "refuse")
            throw new Error("unreachable");
          if (r.verdict === "record") {
            await record(client, step.migration, r.method);
            note(`${r.method.padEnd(8)} ${step.migration.name} — ${r.detail}`);
            adopted++;
            continue;
          }
          const started = Date.now();
          await client.query(step.migration.sql);
          // A probe that cannot see its own migration's objects would record
          // "absent" forever and re-run a non-idempotent migration on the next
          // database. Re-asking after the apply makes that impossible to miss.
          if (r.checks !== undefined) {
            const after = await probe(client, r.checks);
            if (after.missing.length > 0) {
              throw new Error(
                `${step.migration.name} applied, but its probe still reports missing: ${after.missing.join(", ")}. The ADOPTION probe is wrong.`,
              );
            }
          }
          await record(client, step.migration, "applied");
          note(
            `applied  ${step.migration.name} (${Date.now() - started} ms) — ${r.detail}`,
          );
          applied++;
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    for (const step of applies) {
      const started = Date.now();
      await client.query("BEGIN");
      try {
        await client.query(LEDGER_DDL);
        await client.query(step.migration.sql);
        await record(client, step.migration, "applied");
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(
          `${step.migration.name} failed and was rolled back: ${(error as Error).message}`,
        );
      }
      note(`applied  ${step.migration.name} (${Date.now() - started} ms)`);
      applied++;
    }

    // Read back rather than trust the counters: every migration on disk must
    // now be on the ledger with the checksum of the file on disk.
    const after = decide((await readLedger(client)).rows);
    if (after.refusals.length > 0 || after.steps.length > 0) {
      console.error(
        `db:migrate: the ledger does not match the tree after migrating: ${[...after.refusals, ...after.steps.map((s) => `${s.migration.name} still pending`)].join("; ")}`,
      );
      return 1;
    }
    say(
      `db:migrate: up to date — ${applied} applied, ${adopted} adopted, ${after.recorded} recorded`,
    );
    return 0;
  } finally {
    await client.end();
  }
};

const main = (): Promise<number> => migrate(parseArgs(process.argv.slice(2)));

/** Is this module the process's entry point (`node …/cli.ts`), not an import? */
const isEntryPoint = (): boolean => {
  const script = process.argv[1];
  if (script === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(script)).href;
  } catch {
    return false;
  }
};

if (isEntryPoint()) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      const e = error as { message?: string; code?: string };
      console.error(
        `db:migrate: FAILED: ${e.code ? `${e.code}: ` : ""}${e.message ?? String(error)}`,
      );
      process.exit(1);
    },
  );
}
