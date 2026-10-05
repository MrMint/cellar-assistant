/**
 * The host's boot preflight (`./boot-preflight.ts`): the schema ledger against
 * the migrations this build ships, and the published development secrets
 * under `NODE_ENV=production`. The ledger half runs against the run's own
 * test database, which `test-db.sh` builds with `db:migrate` — so it has a
 * complete ledger, and each test rolls back whatever it does to it.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadMigrations, type Migration } from "@cellar-assistant/db/migrate";
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  assertNoPublishedDevSecrets,
  assertSchemaMigrated,
  bootPreflight,
  ledgerGap,
  PRODUCTION_SECRETS,
} from "./boot-preflight.ts";
import { closeTestDb, resolveTestDatabase, withTestDb } from "./testing.ts";

const { skip } = await resolveTestDatabase();

/**
 * The development defaults `infra/docker-compose.yml` publishes for the
 * guarded variables — read from that file, which is what publishes them,
 * rather than written into this one.
 */
const composeDefaults = (): string[] => {
  const compose = readFileSync(
    new URL("../../../../infra/docker-compose.yml", import.meta.url),
    "utf8",
  );
  const defaults = new Set<string>();
  for (const name of PRODUCTION_SECRETS) {
    for (const match of compose.matchAll(
      new RegExp(`\\$\\{${name}:-([^}]+)\\}`, "g"),
    )) {
      if (match[1] !== undefined) defaults.add(match[1]);
    }
  }
  return [...defaults];
};

const SHIPPED = loadMigrations();
const fake = (name: string): Migration => ({
  name,
  sql: "select 1;",
  sha256: "0".repeat(64),
});

describe.skipIf(skip)("the schema ledger against this build", () => {
  afterAll(closeTestDb);

  it("finds the test database's ledger complete — the build's own migrations, all recorded", async () => {
    await withTestDb(async (db) => {
      expect(SHIPPED.length).toBeGreaterThan(5);
      expect(await ledgerGap(db)).toEqual({
        ledger: true,
        missing: [],
        changed: [],
      });
      await expect(assertSchemaMigrated(db)).resolves.toBeUndefined();
    });
  });

  it("refuses a database missing a migration this build ships, and names it", async () => {
    await withTestDb(async (db) => {
      const newest = SHIPPED.at(-1);
      if (newest === undefined) throw new Error("no migrations shipped");
      await db.execute(
        sql`delete from cellar_meta.schema_migrations where name = ${newest.name}`,
      );
      const refused = assertSchemaMigrated(db);
      await expect(refused).rejects.toThrow(/refusing to start/);
      await expect(refused).rejects.toThrow(`missing: ${newest.name}`);
      await expect(refused).rejects.toThrow(/db:migrate/);
    });
  });

  it("refuses one the database never heard of — a deploy that skipped db:migrate", async () => {
    await withTestDb(async (db) => {
      const next = fake("29991231235959_not_yet_applied");
      await expect(
        assertSchemaMigrated(db, [...SHIPPED, next]),
      ).rejects.toThrow(`missing: ${next.name}`);
    });
  });

  it("refuses a migration recorded from a different file than this build ships", async () => {
    await withTestDb(async (db) => {
      const [first, ...rest] = SHIPPED;
      if (first === undefined) throw new Error("no migrations shipped");
      const edited = { ...first, sha256: "f".repeat(64) };
      expect(await ledgerGap(db, [edited, ...rest])).toMatchObject({
        missing: [],
        changed: [first.name],
      });
      await expect(assertSchemaMigrated(db, [edited, ...rest])).rejects.toThrow(
        `changed: ${first.name}`,
      );
    });
  });

  it("allows a migration the database has and this build does not: a rollback", async () => {
    await withTestDb(async (db) => {
      await expect(
        assertSchemaMigrated(db, SHIPPED.slice(0, -1)),
      ).resolves.toBeUndefined();
    });
  });

  it("bootPreflight prints the refusal before it throws, so the log says which", async () => {
    await withTestDb(async (db) => {
      const newest = SHIPPED.at(-1);
      if (newest === undefined) throw new Error("no migrations shipped");
      await db.execute(
        sql`delete from cellar_meta.schema_migrations where name = ${newest.name}`,
      );
      const printed: string[] = [];
      await expect(
        bootPreflight(db, { NODE_ENV: "test" }, (line) => printed.push(line)),
      ).rejects.toThrow(/refusing to start/);
      expect(printed.join("\n")).toContain(`missing: ${newest.name}`);

      // And the secrets are checked too, first, without touching the database.
      printed.length = 0;
      await expect(
        bootPreflight(
          db,
          { NODE_ENV: "production", APP_API_TOKEN: composeDefaults()[0] },
          (line) => printed.push(line),
        ),
      ).rejects.toThrow(/APP_API_TOKEN/);
      expect(printed.join("\n")).not.toContain("missing:");
    });
  });

  it("says so when there is no ledger at all", async () => {
    await withTestDb(async (db) => {
      await db.execute(sql`drop table cellar_meta.schema_migrations`);
      expect(await ledgerGap(db)).toMatchObject({
        ledger: false,
        missing: SHIPPED.map((m) => m.name),
      });
      await expect(assertSchemaMigrated(db)).rejects.toThrow(
        /no schema ledger/,
      );
    });
  });
});

describe("published development secrets", () => {
  const digest = (value: string): string =>
    createHash("sha256").update(value, "utf8").digest("hex");
  // The mechanism against a digest computed here, so the test does not
  // write the published values into the tree a third time.
  const PUBLISHED = "a-value-everyone-has";
  const digests = [digest(PUBLISHED)];

  it("refuses each of them, by name and never by value, in production", () => {
    for (const name of PRODUCTION_SECRETS) {
      const env = { NODE_ENV: "production", [name]: PUBLISHED };
      expect(() => assertNoPublishedDevSecrets(env, digests)).toThrow(name);
      try {
        assertNoPublishedDevSecrets(env, digests);
      } catch (error) {
        expect(String(error)).not.toContain(PUBLISHED);
      }
    }
  });

  it("names every one that is published, not just the first", () => {
    expect(() =>
      assertNoPublishedDevSecrets(
        {
          NODE_ENV: "production",
          DAPR_API_TOKEN: PUBLISHED,
          APP_API_TOKEN: PUBLISHED,
          MINIO_ROOT_PASSWORD: "real",
        },
        digests,
      ),
    ).toThrow("DAPR_API_TOKEN, APP_API_TOKEN are");
  });

  it("allows them outside production, where they are the point", () => {
    for (const NODE_ENV of [undefined, "development", "test"]) {
      expect(() =>
        assertNoPublishedDevSecrets(
          { NODE_ENV, APP_API_TOKEN: PUBLISHED },
          digests,
        ),
      ).not.toThrow();
    }
  });

  it("allows real values in production", () => {
    expect(() =>
      assertNoPublishedDevSecrets(
        {
          NODE_ENV: "production",
          DAPR_API_TOKEN: "r1",
          APP_API_TOKEN: "r2",
          MINIO_ROOT_PASSWORD: "r3",
        },
        digests,
      ),
    ).not.toThrow();
  });

  it("carries a digest for each development default the compose file publishes", () => {
    const defaults = composeDefaults();
    expect(defaults.length).toBeGreaterThanOrEqual(PRODUCTION_SECRETS.length);
    for (const value of defaults) {
      expect(() =>
        assertNoPublishedDevSecrets({
          NODE_ENV: "production",
          APP_API_TOKEN: value,
        }),
      ).toThrow(/APP_API_TOKEN/);
    }
  });
});
