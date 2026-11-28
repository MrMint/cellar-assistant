/**
 * The schema-migration ledger: which migrations a database has, and the one
 * rule for bringing it up to date.
 *
 * `cli.ts` (`bun run db:migrate`) is the only thing that applies a migration
 * under `packages/db/migrations`, everywhere: `baseline/build.sh` (and through
 * it `test-db.sh`), the production deploy, and the dev lane's `bootstrap` /
 * `migrate`. This file is the part of it that needs no database — the
 * manifest, the loader and the planner — so it can be tested without one.
 *
 * `cellar_meta.schema_migrations` is the record: one row per migration, with
 * the sha256 of the exact file that was applied. A recorded migration is never
 * applied again, a changed file is refused rather than silently re-run, and an
 * unrecorded one is applied, in name order, in its own transaction.
 *
 * ## The horizon, and adoption
 *
 * A fresh database starts from `baseline/schema.sql`, which already holds every
 * migration up to `BASELINE_HORIZON` but no ledger rows for them. Those
 * migrations are therefore *adopted* rather than blindly run:
 *
 *   - the introspected baseline migration is recorded and never executed (it
 *     cannot be: its SQL is commented out — `packages/db/README.md`);
 *   - an idempotent migration is re-applied;
 *   - every other one is **probed**: all of its objects present → recorded as
 *     `adopted`; none present → applied and then re-probed, so a probe that
 *     does not actually detect its own migration fails loudly instead of
 *     recording a lie; some present → refused, naming what is missing, because
 *     a half-applied migration is a question for a human.
 *
 * After the horizon there is no adoption and no probe. **The baseline is frozen
 * at the horizon** (`baseline-freeze.test.ts` pins it): a schema change is a
 * new migration, applied to every database — fresh, long-lived and production
 * alike — by this one path.
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
 * The last migration `baseline/schema.sql` already contains. Every migration
 * named after this one is applied by `db:migrate` alone, on every database.
 */
export const BASELINE_HORIZON =
  "20260927215215_budget_attribution_and_reservation_index";

/** One catalog question, answered by a single boolean. */
export type Check = { readonly what: string; readonly sql: string };

export type Adoption =
  | { readonly kind: "baseline"; readonly why: string }
  | { readonly kind: "reapply"; readonly why: string }
  | {
      readonly kind: "probe";
      /** Where this migration's objects already come from. */
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
 * Every migration up to and including `BASELINE_HORIZON`, and how an
 * unrecorded one is brought onto the ledger. Frozen: `ledger.test.ts` fails if
 * a migration at or before the horizon is missing here, or if this names one
 * that does not exist.
 */
export const ADOPTION: Readonly<Record<string, Adoption>> = {
  "20260910003220_opposite_havok": {
    kind: "baseline",
    why: "the introspected baseline: baseline/schema.sql holds it, and its own SQL is commented out and cannot be replayed",
  },
  "20260910003742_restore_expression_index_opclass": {
    kind: "probe",
    producedBy: "baseline/schema.sql",
    checks: [index("idx_places_name_compact_trgm", "%gin_trgm_ops%")],
  },
  "20260910003754_hand_written_sql_lane": {
    kind: "reapply",
    why: "CREATE OR REPLACE of the four search functions",
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
    producedBy: "baseline/schema.sql",
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
    producedBy: "baseline/schema.sql",
    checks: [
      column("outbox", "claim_token"),
      index("outbox_delivering_idx"),
      index("outbox_live_target_idx"),
    ],
  },
  "20260920005733_teas_country_fk": {
    kind: "probe",
    producedBy: "baseline/schema.sql",
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
    producedBy: "baseline/schema.sql",
    checks: [
      column("outbox", "attributed_to"),
      index("idx_api_usage_log_reservation_id"),
    ],
  },
};

/**
 * "Was this database built from the baseline?" — asked before adopting
 * anything. An empty database answers no.
 */
export const BASELINE_DATABASE: readonly Check[] = [
  {
    what: 'public.outbox, public.files and public."user" exist',
    sql: `SELECT to_regclass('public.outbox') IS NOT NULL
             AND to_regclass('public.files') IS NOT NULL
             AND to_regclass('public."user"') IS NOT NULL`,
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
  horizon: string = BASELINE_HORIZON,
  adoption: Readonly<Record<string, Adoption>> = ADOPTION,
): Plan => {
  const refusals: string[] = [];
  const onDisk = new Map(migrations.map((m) => [m.name, m]));
  const recorded = new Map(ledger.map((r) => [r.name, r.sha256]));

  if (!onDisk.has(horizon)) {
    refusals.push(`the baseline horizon ${horizon} is not a migration on disk`);
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
          `${migration.name} is at or before the baseline horizon (${horizon}) but has ` +
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
