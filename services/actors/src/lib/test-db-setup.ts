/**
 * Vitest `globalSetup` (X3): build the database this run owns, once, before any
 * test file is imported.
 *
 * The harness rolls every test back, which isolates the tests from each other
 * but not from another process's **committed** rows — and the development
 * database `cellar` always has one: an agent smoke-testing the frontend, the
 * actor host in `docker compose`, `bun run db:seed`. So the run gets its own
 * database instead, recreated from a template clone here so it starts from a
 * known state every time.
 *
 * All the work is in `packages/db/transform/test-db.sh`; this file only decides
 * *whether* to run it and what a failure means. Keeping the build in bash is
 * what lets CI invoke the identical thing.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { testDatabaseName, testDatabaseUrl } from "./testing.ts";

const SCRIPT = fileURLToPath(
  new URL("../../../../packages/db/transform/test-db.sh", import.meta.url),
);

/** The same URL with a different database name. */
const withDatabase = (url: string, database: string): string => {
  const next = new URL(url);
  next.pathname = `/${database}`;
  return next.toString();
};

/**
 * The tag that marks every database this run owns.
 *
 * The trailing field is seconds since the epoch in decimal, not base36, so
 * `test-db.sh` can reap abandoned ones with shell arithmetic, and the whole
 * shape is a contract that script matches on: `_run_<pid>_<epoch>`.
 */
const runSuffix = (): string =>
  `_run_${String(process.pid)}_${String(Math.floor(Date.now() / 1000))}`;

/**
 * `base` tagged with this run's suffix, inside Postgres' 63-byte identifier
 * limit. Truncated from the *left* of the prefix: the pid and the timestamp are
 * what make it unique, so they are the part that must survive.
 */
const runDatabaseName = (base: string, suffix: string): string =>
  `${base.slice(0, 63 - suffix.length)}${suffix}`;

/**
 * Drop this run's database, best effort.
 *
 * Returned from `setup` so vitest calls it after the last test file. It cannot
 * be the only mechanism: a run killed by a signal — which `turbo run test` does
 * to this task every time another package's tests fail first — never gets here,
 * and the database survives. `test-db.sh` reaps those on a later build.
 *
 * Deliberately a warning rather than a throw. This runs after the results have
 * been decided; turning a green suite red because a 24 MB scratch database
 * outlived it would be a worse trade than leaving it for the reaper.
 */
const dropRunDatabase = (runDb: string): void => {
  const result = spawnSync(SCRIPT, ["--drop"], {
    encoding: "utf8",
    env: { ...process.env, TEST_DB: runDb },
  });
  // Surfaced even on success: `--drop` exits 0 after a database it could not
  // drop, because one stuck scratch database must not fail a green suite. The
  // note still has to reach somebody, or the leak is invisible.
  const stderr = result.stderr?.trim() ?? "";
  if (stderr !== "") console.warn(`[harness] ${stderr}`);
  if (result.status === 0) return;
  console.warn(
    `[harness] could not drop ${runDb} (exit ${String(result.status)}); ` +
      "test-db.sh reaps abandoned run databases on a later build.",
  );
};

export const setup = (): (() => void) | undefined => {
  const url = testDatabaseUrl();
  const name = testDatabaseName(url);

  // The script refuses any name outside the `cellar_test` prefix — it issues
  // `DROP DATABASE`, and `cellar` must never be reachable from it. Honour the
  // same rule here so pointing ACTORS_TEST_DATABASE_URL at a
  // database somebody else built is a supported thing to do rather than an
  // error: that database is theirs, and this run just uses it.
  if (name === undefined || !name.startsWith("cellar_test")) {
    console.warn(
      `[harness] ${name ?? url} is not a cellar_test* database; leaving it ` +
        "alone. It must already hold the transformed schema.",
    );
    return;
  }

  // ONE DATABASE PER RUN, ONE TEMPLATE FOR EVERYBODY.
  //
  // `test-db.sh`'s advisory lock makes concurrent *builds* safe, and it cannot
  // make a shared run database safe: this run stops holding the lock the moment
  // setup returns, so the next `test-db.sh` — a second suite, or somebody
  // rebuilding by hand while debugging — drops `cellar_test WITH (FORCE)` out
  // from under a suite that is already running. Measured, with a deliberate
  // `--rebuild` landing three seconds into a run: 52 failures and
  // `database "cellar_test" does not exist`.
  //
  // So the fixed name is used for the *template*, which is shared on purpose
  // and is what makes the build affordable, while the run database gets a name
  // nobody else will drop. The env var is set before vitest forks its workers,
  // and `testDatabaseUrl()` is read per call inside them, so they pick it up.
  //
  // The database is dropped again by the teardown this returns, and by
  // `test-db.sh`'s reaper when a signal means the teardown never runs.
  const template = `${name}_template`;
  const suffix = runSuffix();
  const runDb = runDatabaseName(name, suffix);
  process.env.ACTORS_TEST_DATABASE_URL = withDatabase(url, runDb);
  // Published so the OTHER thing this suite creates by a fixed name — the
  // `auth_test_*` scratch databases in `src/auth/testing.ts` — can share this
  // run's suffix. Set before vitest forks its workers, so they all agree; one
  // suffix per run then makes `--drop` below a single pattern match rather than
  // a list of names to keep in step.
  process.env.ACTORS_TEST_RUN_SUFFIX = suffix;

  const result = spawnSync(SCRIPT, [], {
    encoding: "utf8",
    env: { ...process.env, TEST_DB: runDb, TEMPLATE_DB: template },
  });

  if (result.status === 0) {
    console.log(`[harness] ${result.stdout.trim().split("\n").at(-1) ?? ""}`);
    return () => {
      dropRunDatabase(runDb);
    };
  }

  const detail = [
    result.error?.message,
    result.stderr?.trim(),
    result.stdout?.trim(),
  ]
    .filter((part) => part !== undefined && part !== "")
    .join("\n");

  // A SIGNAL IS NOT A FAILURE, AND SAYING SO SAVED THIS INVESTIGATION TWICE.
  //
  // `spawnSync` reports a killed child as `status: null`, so the old message
  // read "test-db.sh failed (exit null)" and sent two sessions looking for a
  // race in the database build. There was none. `turbo run test` does not pass
  // `--continue`, so the first package whose tests go red aborts every task
  // still running -- and this task is always still running, because it is the
  // only one that builds a database. Measured: `@cellar-assistant/api#test`
  // failed at 727 ms on a schema snapshot, turbo's whole run ended at 1.045 s,
  // and this task's `test-db.sh` was three seconds into a build it never
  // finished.
  //
  // So the database is almost certainly fine, and the thing to read is the
  // FIRST failing task above, not this one.
  //
  // BOTH SHAPES HAVE TO BE RECOGNISED. `test-db.sh` traps INT/TERM/HUP so it
  // can release its advisory lock before dying, and a shell that handles a
  // signal exits `128 + signo` rather than dying *of* it -- so the same kill
  // arrives here as `status: 143, signal: null` when the trap won the race and
  // as `status: null, signal: "SIGTERM"` when it did not.
  const signal =
    result.signal ??
    (result.status !== null && result.status > 128
      ? `signal ${String(result.status - 128)}`
      : null);
  if (signal !== null) {
    throw new Error(
      `${SCRIPT} was killed by ${signal} -- it did not fail.\n` +
        "NOTHING HERE FAILED A TEST. A signal means something outside this " +
        "suite stopped it, and the usual cause is `turbo run test` aborting " +
        "its remaining tasks after ANOTHER package's tests failed first " +
        "(turbo does not pass --continue). Scroll UP to the first failing " +
        "task and fix that; this message is the collateral damage. Ctrl-C " +
        "looks identical.\n" +
        "To see this suite's own result regardless, run it on its own:\n" +
        "  bun run --filter @cellar-assistant/actors test\n" +
        detail,
    );
  }

  // Say the quiet part. Every symptom of a concurrent build reads as a real
  // defect -- `duplicate key ... pg_namespace_nspname_index`, a throw out of
  // `_initializeGlobalSetup`, `\unrestrict: wrong key` -- and the correct
  // response, re-run it, is the opposite of the instinct, which is to
  // investigate. test-db.sh now serialises its own builds on a Postgres
  // advisory lock, pins the dump it restores, and writes it atomically, so this
  // should be rare; when it is not, the first sentence saves the investigation.
  const message =
    `${SCRIPT} failed (exit ${String(result.status)}).\n` +
    "If another test run or `test-db.sh` was building the shared cellar_test " +
    "databases at the same moment, that is a known cause and RE-RUNNING IS " +
    "THE FIRST THING TO TRY -- it is not necessarily a code defect.\n" +
    detail;

  // Same contract as `resolveTestDatabase`: an unbuildable database is always
  // a failure, because a silently skipped suite is how a test stops being
  // evidence. This used to be skippable via `ACTORS_TEST_DB_OPTIONAL=1` for
  // CI legs that had no Postgres to build against; CI now builds a real one
  // (X4), so there is no longer a legitimate case for skipping here.
  throw new Error(message);
};
