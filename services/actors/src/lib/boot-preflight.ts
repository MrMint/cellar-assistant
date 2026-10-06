/**
 * What the actor host checks before it serves anything, and refuses to start
 * over. `bootPreflight` is the one call `index.ts` makes; each check is
 * exported on its own so `boot-preflight.test.ts` can drive it.
 *
 * ## The schema ledger
 *
 * `db:migrate` (`packages/db/src/migrate/cli.ts`) is the only thing that
 * applies a migration, and it records each one in
 * `cellar_meta.schema_migrations` with the sha256 of the file it applied. A
 * deploy that skipped it used to boot fine and fail at *query* time — on the
 * first turn that touched a column the build expects and the database lacks,
 * as a `42703` inside some actor, possibly hours later and far from the cause.
 * So the host compares the ledger with the migrations this build ships (they
 * are in the image: `services/actors/Dockerfile` copies `packages/db` whole)
 * and refuses to start, naming every one that is missing or was applied from
 * a different file. A migration the database has and this build does not is
 * fine: that is an older build running against a newer schema, which is what
 * a rollback looks like.
 *
 * ## The published development secrets
 *
 * `infra/docker-compose.yml` defaults `DAPR_API_TOKEN`, `APP_API_TOKEN` and
 * `MINIO_ROOT_PASSWORD` to fixed development values, so those values are
 * public. Under `NODE_ENV=production` (the image sets it) the host refuses any
 * of them, the way `src/auth/config.ts` refuses the committed
 * `BETTER_AUTH_SECRET`: by sha256, so the tree does not carry the strings a
 * second time, and without ever printing a value. `check-prod-config.mjs`
 * refuses them before compose starts; this is the same rule where they are
 * spent, so a deployment that skipped that script still cannot run on them.
 */
import { createHash } from "node:crypto";
import {
  LEDGER_TABLE,
  loadMigrations,
  type Migration,
} from "@cellar-assistant/db/migrate";
import { sql } from "@cellar-assistant/db/orm";
import type { DbOrTx } from "./db.ts";

/* -------------------------------------------------------------------------- */
/* Schema ledger                                                               */
/* -------------------------------------------------------------------------- */

export type LedgerGap = {
  /** `false` when `cellar_meta.schema_migrations` does not exist at all. */
  readonly ledger: boolean;
  /** Shipped with this build, not recorded in the database. */
  readonly missing: readonly string[];
  /** Recorded, but from a file whose sha256 is not the one this build ships. */
  readonly changed: readonly string[];
};

/** How far the database's ledger is from the migrations this build ships. */
export const ledgerGap = async (
  db: DbOrTx,
  shipped: readonly Migration[] = loadMigrations(),
): Promise<LedgerGap> => {
  const { rows: exists } = await db.execute<{ t: string | null }>(
    sql`select to_regclass(${LEDGER_TABLE})::text as t`,
  );
  if (exists[0]?.t == null) {
    return { ledger: false, missing: shipped.map((m) => m.name), changed: [] };
  }
  const { rows } = await db.execute<{ name: string; sha256: string }>(
    sql`select name, sha256 from ${sql.raw(LEDGER_TABLE)}`,
  );
  const recorded = new Map(rows.map((row) => [row.name, row.sha256]));
  return {
    ledger: true,
    missing: shipped.filter((m) => !recorded.has(m.name)).map((m) => m.name),
    changed: shipped
      .filter((m) => {
        const sha = recorded.get(m.name);
        return sha !== undefined && sha !== m.sha256;
      })
      .map((m) => m.name),
  };
};

/**
 * Refuse to start on a database this build's migrations have not all
 * reached. The message names each migration and says what to run.
 */
export const assertSchemaMigrated = async (
  db: DbOrTx,
  shipped: readonly Migration[] = loadMigrations(),
): Promise<void> => {
  let gap: LedgerGap;
  try {
    gap = await ledgerGap(db, shipped);
  } catch (error) {
    throw new Error(
      "[boot] could not read the schema ledger (cellar_meta.schema_migrations): " +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (gap.missing.length === 0 && gap.changed.length === 0) return;
  const lines = [
    gap.ledger
      ? "[boot] this database is missing migrations this build needs; refusing to start."
      : "[boot] this database has no schema ledger (cellar_meta.schema_migrations): " +
        "db:migrate has never run against it. Refusing to start.",
    ...gap.missing.map((name) => `  missing: ${name}`),
    ...gap.changed.map(
      (name) =>
        `  changed: ${name} (applied from a different migration.sql than this build ships)`,
    ),
    "Run db:migrate against this database first " +
      "(`node packages/db/src/migrate/cli.ts --url …`; in a deploy, the migrate step), " +
      "then start this build again.",
  ];
  throw new Error(lines.join("\n"));
};

/* -------------------------------------------------------------------------- */
/* Published development secrets                                               */
/* -------------------------------------------------------------------------- */

/**
 * sha256 of each development default `infra/docker-compose.yml` publishes —
 * the `DAPR_API_TOKEN`, `APP_API_TOKEN` and `MINIO_ROOT_PASSWORD` fallbacks —
 * as digests so the tree does not carry the values a second time.
 */
export const PUBLISHED_DEV_SECRET_SHA256: readonly string[] = [
  "346d87198ad327e6f4412e6d534fb8ab1b2ca3e108722ed48539f27ea1cd08df",
  "7f32f0f46fd07ede99b3c6f69b74ef88822c3e79ef94a0909450cc17f3113a6c",
  "82d12f21cb56ce54b1165d4c16ae1f17afbed187bfd885c8caa081c405d955e5",
];

/** The variables that must not hold a published value in production. */
export const PRODUCTION_SECRETS = [
  "DAPR_API_TOKEN",
  "APP_API_TOKEN",
  "MINIO_ROOT_PASSWORD",
] as const;

/**
 * Under `NODE_ENV=production`, refuse any {@link PRODUCTION_SECRETS} holding
 * a published development value — checked against every published digest,
 * so a value moved to another variable is caught too. Names the variables,
 * never a value. Outside production the defaults are the point, and pass.
 */
export const assertNoPublishedDevSecrets = (
  environment: NodeJS.ProcessEnv,
  digests: readonly string[] = PUBLISHED_DEV_SECRET_SHA256,
): void => {
  if (environment.NODE_ENV !== "production") return;
  const published = PRODUCTION_SECRETS.filter((name) => {
    const value = environment[name];
    if (value === undefined || value === "") return false;
    const digest = createHash("sha256").update(value, "utf8").digest("hex");
    return digests.includes(digest);
  });
  if (published.length === 0) return;
  throw new Error(
    `[boot] ${published.join(", ")} ${published.length === 1 ? "is" : "are"} ` +
      "the development default published in infra/docker-compose.yml, in " +
      "production. Anyone with this repository knows it: the sidecar tokens " +
      "would let any process on the network call this host's actors as the " +
      "sidecar, and the MinIO password signs requests against the public " +
      "bucket. Set real values (openssl rand -base64 32) in the production env.",
  );
};

/* -------------------------------------------------------------------------- */

/**
 * Everything the host checks before it serves: the secrets first (no I/O),
 * then the ledger. A refusal is printed to stderr and rethrown. Printed,
 * because the throw ends at the process guard, whose `process.fatal` event
 * carries only the error's class by design (`./telemetry.ts`), and "which
 * migration is missing" is the whole point of refusing.
 */
export const bootPreflight = async (
  db: DbOrTx,
  environment: NodeJS.ProcessEnv,
  report: (message: string) => void = console.error,
): Promise<void> => {
  try {
    assertNoPublishedDevSecrets(environment);
    await assertSchemaMigrated(db);
  } catch (error) {
    report(error instanceof Error ? error.message : String(error));
    throw error;
  }
};
