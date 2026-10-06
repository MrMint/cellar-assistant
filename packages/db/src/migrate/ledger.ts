/**
 * The schema-migration ledger: which migrations a database has, and the one
 * rule for bringing it up to date.
 *
 * `cli.ts` (`bun run db:migrate`) is the only thing that applies a migration
 * under `packages/db/migrations`, everywhere: `transform/run.sh` (and through it
 * `test-db.sh`), `scripts/cutover/cutover.sh`'s `migrate` phase, and the dev
 * lane's `bootstrap` / `migrate`. This file is the part of it that needs no
 * database — the manifest, the loader and the planner — so it can be tested
 * without one.
 *
 * ## Why a ledger
 *
 * Before it, a migration reached a database one of two ways. A migration
 * carrying the "Hand-written SQL lane" marker was re-applied by `run.sh` and
 * `cutover.sh` on every build (they were written to be idempotent). Every other
 * one reached a *fresh* build only because a numbered transform file mirrored it
 * by hand — and reached a *long-lived* database (`cellar-stack`, a worktree
 * cloned from it) only if somebody applied it by hand. That is how one database
 * came to lack `teas_country_country_value_fkey` while every build had it. There
 * was no record anywhere of what a database held, so nothing could say.
 *
 * `cellar_meta.schema_migrations` is that record: one row per migration, with
 * the sha256 of the exact file that was applied. A recorded migration is never
 * applied again, a changed file is refused rather than silently re-run, and an
 * unrecorded one is applied, in name order, in its own transaction.
 *
 * ## The horizon, and adoption
 *
 * Databases already exist that were built without a ledger — every
 * transform-built one, `cellar-stack`, and the production database E4 is about
 * to build. Their state up to now is known only by construction, so the
 * migrations up to `TRANSFORM_HORIZON` are *adopted* rather than blindly run:
 *
 *   - the introspected baseline is recorded and never executed (it cannot be:
 *     its SQL is commented out — `packages/db/README.md`);
 *   - an idempotent migration (the old hand-written lane) is re-applied, which
 *     is what every build did anyway;
 *   - every other one is **probed**: all of its objects present → recorded as
 *     `adopted`; none present → applied and then re-probed, so a probe that
 *     does not actually detect its own migration fails loudly instead of
 *     recording a lie; some present → refused, naming what is missing, because
 *     a half-applied migration is a question for a human.
 *
 * After the horizon there is no adoption and no probe. **The transform is frozen
 * at the horizon** (`transform-freeze.test.ts` pins its files): a new schema
 * change is a new migration, applied to every database — fresh, long-lived and
 * production alike — by this one path, and it is never mirrored into
 * `transform/`. The mirroring rule, and the lane marker, are history.
 *
 * `ADOPTION` is therefore frozen with the horizon, and so are its probes: they
 * describe migrations that will never change (their checksums are recorded).
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../migrations", import.meta.url),
);

export const LEDGER_SCHEMA = "cellar_meta";
export const LEDGER_TABLE = `${LEDGER_SCHEMA}.schema_migrations`;

/**
 * The last migration the frozen transform already produces. Every migration
 * named after this one is applied by `db:migrate` alone, on every database.
 */
export const TRANSFORM_HORIZON =
  "20260927215215_budget_attribution_and_reservation_index";

/** One catalog question, answered by a single boolean. */
export type Check = { readonly what: string; readonly sql: string };

export type Adoption =
  | { readonly kind: "baseline"; readonly why: string }
  | { readonly kind: "reapply"; readonly why: string }
  | {
      readonly kind: "probe";
      /** Which transform file(s) produce this migration's objects. */
      readonly producedBy: string;
      readonly checks: readonly Check[];
    };

/** A SQL string literal's contents: every `'` doubled. */
const lit = (s: string): string => s.replaceAll("'", "''");

const column = (table: string, name: string): Check => ({
  what: `column public.${table}.${name}`,
  sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = '${lit(table)}' AND column_name = '${lit(name)}')`,
});

const index = (name: string, defLike = "%"): Check => ({
  what: `index public.${name}${defLike === "%" ? "" : ` (definition like ${defLike})`}`,
  sql: `SELECT EXISTS (SELECT 1 FROM pg_indexes
          WHERE schemaname = 'public' AND indexname = '${lit(name)}' AND indexdef LIKE '${lit(defLike)}')`,
});

const constraint = (table: string, name: string, defLike = "%"): Check => ({
  what: `constraint ${name} on public.${table}${defLike === "%" ? "" : ` (definition like ${defLike})`}`,
  sql: `SELECT EXISTS (SELECT 1 FROM pg_constraint
          WHERE conrelid = to_regclass('public.${lit(table)}') AND conname = '${lit(name)}'
            AND pg_get_constraintdef(oid) LIKE '${lit(defLike)}')`,
});

/**
 * Every migration up to and including `TRANSFORM_HORIZON`, and how an
 * unrecorded one is brought onto the ledger. Frozen: `ledger.test.ts` fails if
 * a migration at or before the horizon is missing here, or if this names one
 * that does not exist.
 */
export const ADOPTION: Readonly<Record<string, Adoption>> = {
  "20260910003220_opposite_havok": {
    kind: "baseline",
    why: "the introspected baseline: the transform (transform/01-18) is what builds it, and its own SQL is commented out and cannot be replayed",
  },
  "20260910003742_restore_expression_index_opclass": {
    kind: "probe",
    producedBy: "transform/17_target_indexes.sql",
    checks: [index("idx_places_name_compact_trgm", "%gin_trgm_ops%")],
  },
  "20260910003754_hand_written_sql_lane": {
    kind: "reapply",
    why: "CREATE OR REPLACE of the four search functions transform/02 drops",
  },
  "20260910003755_pgvector_distance_helpers": {
    kind: "reapply",
    why: "CREATE OR REPLACE of the five distance helpers",
  },
  "20260910003756_search_function_column_grants": {
    kind: "reapply",
    why: "a recorded no-op (no statements)",
  },
  "20260910040517_b8b_widen_menu_item_type": {
    kind: "probe",
    producedBy: "transform/16_widen_menu_item_detected_type.sql",
    checks: [
      constraint(
        "place_menu_items",
        "place_menu_items_detected_item_type_check",
        "%'cocktail'%",
      ),
    ],
  },
  "20260919192020_outbox_claim_token_and_live_indexes": {
    kind: "probe",
    producedBy:
      "transform/06_new_tables.sql (column), transform/17_target_indexes.sql (indexes)",
    checks: [
      column("outbox", "claim_token"),
      index("outbox_delivering_idx"),
      index("outbox_live_target_idx"),
    ],
  },
  "20260920005733_teas_country_fk": {
    kind: "probe",
    producedBy: "transform/18_teas_country_fk.sql",
    checks: [constraint("teas", "teas_country_country_value_fkey")],
  },
  "20260920164500_outbox_dead_letter_acks": {
    kind: "reapply",
    why: "CREATE TABLE / CREATE INDEX IF NOT EXISTS",
  },
  "20260926150000_outbox_dead_letter_acks_fkey_align": {
    kind: "reapply",
    why: "renames the constraint only if the unaligned name is still there",
  },
  "20260927215215_budget_attribution_and_reservation_index": {
    kind: "probe",
    producedBy:
      "transform/06_new_tables.sql (column), transform/17_target_indexes.sql (index)",
    checks: [
      column("outbox", "attributed_to"),
      index("idx_api_usage_log_reservation_id"),
    ],
  },
};

/**
 * "Is this a transform-built database?" — asked before adopting anything. The
 * three tables the transform creates, and neither of the two schemas it drops.
 * An empty database, the Nhost source, and a cutover target on which
 * `transform-c` has not run yet all answer no.
 */
export const TRANSFORMED_DATABASE: readonly Check[] = [
  {
    what: 'public.outbox, public.files and public."user" exist',
    sql: `SELECT to_regclass('public.outbox') IS NOT NULL
             AND to_regclass('public.files') IS NOT NULL
             AND to_regclass('public."user"') IS NOT NULL`,
  },
  {
    what: "neither the auth nor the hdb_catalog schema exists",
    sql: `SELECT NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname IN ('auth', 'hdb_catalog'))`,
  },
];

export type Migration = {
  readonly name: string;
  readonly sha256: string;
  readonly sql: string;
};

export type LedgerRow = { readonly name: string; readonly sha256: string };

export const sha256 = (bytes: Buffer | string): string =>
  createHash("sha256").update(bytes).digest("hex");

/**
 * Statements that cannot run inside the transaction each migration is applied
 * in, or that would end it early. Matched at the start of a line with the
 * semicolon attached, so the `BEGIN` that opens a PL/pgSQL body (no semicolon)
 * is not one — and `END` is deliberately absent, because `END;` is how every
 * such body closes, while as a transaction statement it is only a synonym.
 */
const TRANSACTION_HOSTILE: readonly [RegExp, string][] = [
  [
    /^\s*(BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION)\s*;/im,
    "top-level transaction control",
  ],
  [/\bCONCURRENTLY\b/i, "CONCURRENTLY, which cannot run in a transaction"],
];

/** What in this migration cannot run inside a transaction, if anything. */
export const transactionHazards = (sql: string): string[] => {
  const withoutComments = sql.replace(/--[^\n]*/g, "");
  return TRANSACTION_HOSTILE.filter(([pattern]) =>
    pattern.test(withoutComments),
  ).map(([, why]) => why);
};

/** Every migration directory, in name order, with the sha256 of its SQL. */
export const loadMigrations = (dir: string = MIGRATIONS_DIR): Migration[] => {
  const out: Migration[] = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (!statSync(path).isDirectory()) continue;
    const file = join(path, "migration.sql");
    if (!existsSync(file)) {
      throw new Error(`${name} has no migration.sql`);
    }
    const bytes = readFileSync(file);
    out.push({ name, sha256: sha256(bytes), sql: bytes.toString("utf8") });
  }
  return out;
};

export type Step =
  | {
      readonly action: "adopt";
      readonly migration: Migration;
      readonly adoption: Adoption;
    }
  | { readonly action: "apply"; readonly migration: Migration };

export type Plan = {
  /** Why this database must not be migrated from this tree. Empty = go. */
  readonly refusals: string[];
  /** Recorded migrations this tree does not have: a newer tree migrated it. */
  readonly unknown: string[];
  readonly recorded: number;
  /** In order: every adoption step (all at or before the horizon) first. */
  readonly steps: Step[];
};

/**
 * Decide what `db:migrate` would do, from the migrations on disk and the
 * ledger's rows alone. Probes are the runner's job; this only says which
 * migrations need adopting.
 */
export const plan = (
  migrations: readonly Migration[],
  ledger: readonly LedgerRow[],
  horizon: string = TRANSFORM_HORIZON,
  adoption: Readonly<Record<string, Adoption>> = ADOPTION,
): Plan => {
  const refusals: string[] = [];
  const onDisk = new Map(migrations.map((m) => [m.name, m]));
  const recorded = new Map(ledger.map((r) => [r.name, r.sha256]));

  if (!onDisk.has(horizon)) {
    refusals.push(
      `the transform horizon ${horizon} is not a migration on disk`,
    );
  }

  for (const [name, recordedSha] of recorded) {
    const migration = onDisk.get(name);
    if (migration !== undefined && migration.sha256 !== recordedSha) {
      refusals.push(
        `${name} was applied from a file with sha256 ${recordedSha}, but ` +
          `packages/db/migrations/${name}/migration.sql now hashes to ${migration.sha256}. ` +
          "A migration is immutable once any database has applied it: revert the edit " +
          "and write a new migration. (If this database was migrated from another " +
          "branch, migrate it from that branch.)",
      );
    }
  }
  const unknown = [...recorded.keys()].filter((n) => !onDisk.has(n)).sort();

  const pending = migrations.filter((m) => !recorded.has(m.name));
  const newestRecorded = [...recorded.keys()].sort().at(-1);
  if (newestRecorded !== undefined) {
    const early = pending.filter((m) => m.name < newestRecorded);
    if (early.length > 0) {
      refusals.push(
        `out of order: ${early.map((m) => m.name).join(", ")} ` +
          `${early.length === 1 ? "sorts" : "sort"} before ${newestRecorded}, which this ` +
          "database already has. Applying it now would run migrations in a different " +
          "order here than everywhere else. Regenerate it with a new timestamp " +
          "(drizzle-kit generate chains snapshots, so rebase first).",
      );
    }
  }

  const steps: Step[] = [];
  for (const migration of pending) {
    const hazards = transactionHazards(migration.sql);
    if (hazards.length > 0) {
      refusals.push(
        `${migration.name} cannot be applied in a transaction: ${hazards.join("; ")}`,
      );
    }
    if (migration.name <= horizon) {
      const entry = adoption[migration.name];
      if (entry === undefined) {
        refusals.push(
          `${migration.name} is at or before the transform horizon (${horizon}) but has ` +
            "no ADOPTION entry, so there is no way to tell whether a database already has it",
        );
        continue;
      }
      steps.push({ action: "adopt", migration, adoption: entry });
    } else {
      steps.push({ action: "apply", migration });
    }
  }

  return { refusals, unknown, recorded: recorded.size, steps };
};

/** `postgres://user:secret@host/db` → `postgres://***@host/db`, for logs. */
export const redact = (url: string): string =>
  url.replace(/\/\/[^@/]*@/, "//***@");
